# CuraVet — Phase C: Authentication, Authorization and Session Security

## Executive Summary

Authentication is implemented with JWTs (HS256) + refresh token rotation via Redis. Authorization uses role-based access control (super_admin > doctor > receptionist > client) enforced via Fastify middleware. Several critical findings emerge, ranging from development-default secrets to IDOR vulnerabilities.

---

## 2.1 Password Authentication

### Implementation
- **Password hashing:** scrypt via `crypto.scryptSync` with N=16384, r=8, p=1, maxmem=256MB (services/auth.ts:136-145)
- **Verification:** constant-time `timingSafeEqual` (services/auth.ts:150-169)
- **Login endpoint:** `POST /api/auth/login` (routes/auth.ts:68-234)
- **Bootstrap super-admin:** If no user found and credentials match env defaults (`admin@curavet.io` / `admin123`), a synthetic user is created with `role: super_admin` (routes/auth.ts:121-124)

### Critical Findings

| Finding ID | Severity | Description |
|---|---|---|
| ACC-001 | **CRITICAL** | **Development-default secrets will block production startup.** `assertProductionSafety()` in `env.ts:158-197` hard-fails if `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, or `SUPERADMIN_PASSWORD` still contain their default values. A deployment that bypasses this guard would run with insecure credentials. |
| ACC-002 | **CRITICAL** | **Bootstrap super-admin creates user with plain-environment credentials.** If the database is empty, `POST /api/auth/login` with `admin@curavet.io` / `admin123` creates a super-admin user. This means an empty database + default creds = immediate super-admin access. |
| ACC-003 | **HIGH** | **Password complexity only enforced at the API schema level,** not at the hash level. The `verifyPassword` function (services/auth.ts:150) does not normalize NFKC before comparison when the stored hash format is unrecognized, returning `false` silently. |
| ACC-004 | **MEDIUM** | **Login endpoint does not rate-limit per-email.** The `authRoutes` `post '/api/auth/login'` has no rate limiter. Combined with no account lockout, an attacker can perform credential guessing without server-side throttling (behind Fastify's global rate limit of 300/min which applies broadly). |

---

## 2.2 JWT Implementation

### Implementation
- **Algorithm:** HS256 (services/auth.ts:42-69)
- **Token structure:** `{ header, payload with sub/email/role/tenantId/jti/typ/iat/exp, signature }`
- **Access token TTL:** `JWT_TTL_SECONDS` = 900 (15 min) (env.ts:26)
- **Refresh token TTL:** `JWT_REFRESH_TTL_SECONDS` = 604800 (7 days) (env.ts:27)
- **Tokens stored in httpOnly cookies:** `access_token` (path `/`, `secure: env.isProduction`), `refresh_token` (path `/api/auth`)
- **Bearer token extraction:** `AuthService.extractBearerToken()` from `Authorization: Bearer <jwt>` header (services/auth.ts:112-119)

### Critical Findings

| Finding ID | Severity | Description |
|---|---|---|
| ACC-005 | **CRITICAL** | **HS256 with a shared secret means any user who obtains another user's JWT can impersonate them.** There is no key rotation mechanism. The `JWT_SECRET` is used for both signing and verification. |
| ACC-006 | **HIGH** | **Access-token `jti` revocation depends on Redis.** `isJtiRevoked()` (services/sessions.ts:72) fails OPEN when Redis is unreachable (returns `false`), meaning a revoked access token may still be accepted. The sessions plugin documents this design choice ("fail OPEN when Redis is unreachable so an outage must not brick logins"), but it is a security trade-off. |
| ACC-007 | **HIGH** | **Refresh token rotation is atomic only if `getdel` is supported.** `consumeRefreshSession()` uses `GETDEL` (Redis >= 6.2). If the Redis version is older, the atomic read-and-delete fallback is not used, and race conditions could allow refresh token replay. |
| ACC-008 | **MEDIUM** | **Cookie `secure` flag depends on `env.isProduction`.** In non-production environments, cookies are set without `Secure`, meaning they can be sent over plain HTTP. This is by design for dev but could be accidentally left in staging. |
| ACC-009 | **MEDIUM** | **Refresh token path differs between web and mobile.** Web uses httpOnly cookies; mobile/native clients send refresh tokens in the request body. The `/api/auth/refresh` handler (routes/auth.ts:245-328) handles both cases, but the body-path approach may be more exposed to XSS on the frontend. |

---

## 2.3 Authorization & Role-Based Access

### Role Hierarchy
`super_admin > doctor > receptionist > client` (defined in schema.prisma Role enum, normalized in `normaliseRole()` routes/auth.ts:32-36)

### Middleware Chain
1. `authenticate` — validates JWT, checks revocation, sets `request.user`
2. `requireSuperAdmin` — checks `request.user.role === 'super_admin'`
3. `requireRoles('doctor'|'receptionist'|'client')` — checks token role is known and in allowed set
4. `requireTenant` — resolves tenant from `user.tenantId` or query param, rejects non-tenanted accounts
5. `requireTenantAccess` — blocks non-super-admins from accessing `/api/tenants/:id/*` unless `user.tenantId === id`

### Critical Findings

| Finding ID | Severity | Description |
|---|---|---|
| ACC-010 | **CRITICAL** | **IDOR vulnerability in `/api/tenants/me/bookings/:id` patch.** The route handler `bookings.ts:163-255` fetches booking with `prisma.booking.findFirst({ where: { id, tenantId } })` (line 186). But the `updateBooking` path in `api.ts:162-171` uses `/tenants/me/bookings/${id}` with only `authenticate` middleware — no `requireTenant`. A user with a valid JWT but no tenantId could potentially access booking data they shouldn't. |
| ACC-011 | **CRITICAL** | **`/api/tenants/me/settings` endpoint accessible without tenant context.** The `api.ts:427-446` `updateSettings` and `api.ts:448-458` `updateBranding` require `authenticate` only. A user with a valid JWT but linked to no tenant (e.g., the env-super-admin) could potentially modify platform-wide settings. The `useAuth.ts:97-102` `api.getTenant()` is enabled only when `isAuthenticated()`, but `updateSettings` does not require `requireTenant`. |
| ACC-012 | **HIGH** | **`requireTenant` grants super-admins implicit tenant impersonation.** `plugins/auth.ts:85-116` `requireTenant` allows super-admins to proceed without a tenantId (`request.user.role !== 'super_admin'` check at line 93 is absent — super-admins bypass the tenant requirement entirely). A super-admin can access `/api/tenants/me/*` routes without being linked to a tenant, which means they can operate in a tenant-agnostic mode. While intentional for platform support, it means the frontend `useAuth` hook must distinguish super-admin from salon-admin, which it does via `user.role`. |
| ACC-013 | **HIGH** | **`/api/users` endpoint (provisioning) requires super-admin, but no email uniqueness guard across tenants.** `routes/auth.ts:385-443` `POST /api/users` creates a user with `tenantId` set based on role. A super-admin could create users across any tenant, and email uniqueness is global (`prisma.user.findUnique({ where: { email } })`). Two different salons could theoretically have users with the same email. |
| ACC-014 | **MEDIUM** | **Role normalization trusts token over database.** `normaliseRole()` (routes/auth.ts:32-36) maps unknown roles to `'client'`. But the `authenticate` plugin (plugins/auth.ts:36) does not re-normalize after verifying the token — it uses the raw `payload.role`. If a token has a role not in the enum (e.g., `'salon_admin'` legacy), it passes through `authenticate` because the check `payload.typ === 'refresh'` only rejects refresh tokens, and the revocation check `isJtiRevoked` may not catch it. |
| ACC-015 | **MEDIUM** | **No CSRF protection for non-cookie auth paths.** The API enables `fastifyCsrfProtection` with `sameSite: 'lax'` and `secure: env.isProduction` (server.ts:60-62). But mobile/native clients and the embeddable widget send JSON bodies without cookies, so CSRF is not a vector for those clients. However, the `/api/auth/refresh` endpoint accepts refresh tokens in the request body, and if combined with an XSS vulnerability, could be exploited. |
| ACC-016 | **LOW** | **`/api/public/` endpoints have no authentication.** Public routes (public.ts, platform.ts) are unauthenticated by design for the embeddable widget and widget chat. This is expected but should be verified that no private data leaks through these paths. |

---

## 2.4 Session Management

### Refresh Token Rotation
- **Store:** Redis key `curavet:refresh:{jti}` with TTL of 7 days (services/sessions.ts:30-35)
- **Consume (rotation):** `GETDEL` atomically reads and deletes the row (services/sessions.ts:42-54). On success, a new refresh token is issued with a new JTI (routes/auth.ts:288-292). On failure (unknown JTI), login is required.
- **Revoke access-token jti:** `REVOKE_PREFIX` key with TTL until natural expiry (services/sessions.ts:61-69)

### Critical Findings

| Finding ID | Severity | Description |
|---|---|---|
| ACC-017 | **CRITICAL** | **Redis unavailability causes session divergence.** When Redis is down, `withRedis()` falls back to no-op (returns undefined/fallback). This means: |
| | | - `storeRefreshSession` silently fails — refresh tokens are never persisted |
| | | - `consumeRefreshSession` returns null — every refresh attempt fails, users are locked out |
| | | - `isJtiRevoked` returns false — revoked tokens are not enforced |
| | | The design intention (documented in sessions.ts:13-17) is "fail OPEN when Redis is unreachable (an outage must not brick logins)" for access tokens, but for refresh tokens this means a user whose refresh token was never stored in Redis (because it was down at login) can still present a stale refresh token from before the outage and potentially get a new access token. |
| ACC-018 | **HIGH** | **Refresh session TTL race.** `storeRefreshSession()` uses `EX` with `env.jwtRefreshTtlSeconds` (604800). But `consumeRefreshSession()` uses `GETDEL` which returns the value regardless of TTL. If a refresh session is stored, then the tenant is suspended, the refresh session row still exists in Redis with its TTL, and the suspended user could still rotate refresh tokens until the TTL expires. The account suspension check in `routes/auth.ts:271-278` only happens on refresh, and only checks `user.isActive` at rotation time. |
| ACC-019 | **MEDIUM** | **No refresh token reuse protection beyond JTI.** If a refresh token's JTI is consumed (rotated), a new JTI is issued. But if the old refresh token cookie is replayed after rotation, `consumeRefreshSession` returns null and the user is forced to re-login. This is correct behavior, but there is no additional device fingerprinting or bound-to-client hash. |

---

## 2.5 Summary of Authentication Findings

| Category | Status | Key Issues |
|---|---|---|
| Password hashing | ✅ Secure | scrypt with appropriate parameters |
| Development defaults | ❌ **CRITICAL** | Default JWT_SECRET, CREDENTIALS_ENCRYPTION_KEY, SUPERADMIN_PASSWORD must never reach production |
| Bootstrap flow | ⚠️ **HIGH** | Empty DB + default creds = automatic super-admin creation |
| JWT design | ⚠️ **CRITICAL** | HS256 with shared secret; no key rotation; revocation depends on Redis |
| Refresh token rotation | ⚠️ **HIGH** | GETDEL requires Redis >= 6.2; TTL races on tenant suspension |
| Authorization middleware | ❌ **CRITICAL** | IDOR in booking patch endpoint; settings accessible without tenant context |
| Session management | ⚠️ **HIGH** | Redis unavailability causes session divergence; TTL races |

---

## 2.6 Reproduction Verification

- **Production safety guard:** Running `pnpm typecheck` will not trigger `assertProductionSafety()` since it only runs in production (`NODE_ENV === 'production'`). To verify, set `NODE_ENV=production` and ensure `JWT_SECRET != 'curavet_super_jwt_secret_change_in_production_2026'`.
- **Tenant isolation bypass:** Can be tested by creating two tenants, logging in as tenant A, and attempting to access `/api/tenants/me/bookings/:id` with tenant B's booking ID. The `requireTenant` middleware should block access.
- **Refresh token rotation:** Can be tested by obtaining a refresh token, calling `/api/auth/refresh` to rotate it, then presenting the old token — should receive `401 Refresh token expired or already used`.

---

## 2.7 Recommended Remediations

1. **Immediately rotate all default secrets** before any production deployment: `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `SUPERADMIN_PASSWORD`, `META_APP_SECRET`.
2. **Add per-endpoint rate limiting** to `/api/auth/login` to prevent credential guessing.
3. **Fix the IDOR vulnerability** in `bookings.ts:163-255` — ensure all booking operations require `requireTenant` middleware and verify ownership.
4. **Require `requireTenant`** on `updateSettings` and `updateBranding` in `api.ts`, or add explicit tenant context checks.
5. **Add Redis high-availability** or implement graceful degradation that denies refresh token rotation (not login) when Redis is unavailable.
6. **Implement refresh token binding** to client identifier for additional security.
7. **Audit the `/api/users` endpoint** for cross-tenant email collision risks.

---

## 2.8 Confidence Assessment

- **Confirmed:** Development-default secrets block production; JWT/HMAC signature verification is constant-time; refresh token rotation uses GETDEL; `requireTenant` enforces tenant context for non-super-admins.
- **Suspected:** The IDOR in booking patch may require specific sequence of requests to exploit; the settings endpoint without tenant may be mitigated by the frontend `requireTenant` hook.
- **Unverified:** Cannot test Redis failure modes or refresh token replay without a running Redis instance.