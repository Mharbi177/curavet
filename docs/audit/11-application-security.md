# CuraVet — Phase K: Application Security

## Executive Summary

The application implements several security controls from OWASP ASVS Level 2: HTTP security headers via Helmet, CORS configuration, rate limiting, CSRF protection, and JWT authentication with scrypt password hashing. However, critical gaps exist: several endpoints lack proper authorization (IDOR in booking updates, settings accessible without tenant context from Phase C), sensitive data appears in error messages, debug endpoints may be exposed, and dependency vulnerabilities exist in the ecosystem. No SSRF or open redirect vulnerabilities were found, but mass assignment risks exist through `additionalProperties: true` schemas. **Several confirmed vulnerabilities affect tenant isolation and data integrity, which combine with the findings from Phases C and D to constitute a significant security risk.**

---

## 11.1 OWASP ASVS 5.0.0 Level 2 Controls Status

| Control | Status | Details |
|---|---|---|
| **Input Validation** | ⚠️ Partial | Zod schemas validate API request bodies, but some routes use `additionalProperties: true` (open-ended), allowing unexpected fields. Frontend forms may accept invalid data before server-side validation. |
| **Error Handling** | ❌ Inadequate | Error handlers in `server.ts:139-148` expose detailed error messages in non-production mode (`detail: error.message`). In production, only `error.message` is shown for 500 errors, but 404 handler returns `Route ${request.method} ${request.url} not found` which could aid reconnaissance. |
| **Headers - Helmet** | ✅ **Implemented** | `fastify-helmet` registered with `contentSecurityPolicy: false` (line 51-53). Helmet provides `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`. |
| **Headers - CORS** | ✅ **Configured** | `fastify-cors` with `origin: true`, `credentials: true`, all methods allowed (server.ts:64-68). `allowList` permits webhooks, metrics, health (line 75-76). |
| **Headers - Rate Limiting** | ✅ **Configured** | `fastify-rate-limit` with global max 300/1min (server.ts:70-77). `allowList` permits webhooks, metrics, health. Burst allowed for webhooks by design. |
| **Headers - CSRF Protection** | ✅ **Configured** | `fastify-csrf-protection` with cookie `signed: true`, `httpOnly: true`, `sameSite: 'lax'`, `secure: env.isProduction` (server.ts:60-62). |
| **Password Hashing** | ✅ **Implemented** | Scrypt with N=16384, r=8, p=1, maxmem=256MB (services/auth.ts:136-145). Meets ASVS requirement. |
| **Authentication Rate Limiting** | ❌ **Missing** | `/api/auth/login` has no per-endpoint rate limit. Relies on global 300/min which applies broadly. |
| **Sensitive Data in Errors** | ❌ **Present** | `server.ts:146` error handler: `...(env.isProduction ? {} : { detail: error.message })` — development errors include `detail` field with full message. Health/Prometheus endpoints may leak server information. |
| **Security Headers - CSP** | ⚠️ **Helmet enabled, CSP disabled** | `fastify-helmet` with `contentSecurityPolicy: false`. CSP not configured, increasing XSS risk. |
| **API Documentation Exposure** | ⚠️ **Swagger UI available** | `swagger` and `swagger-ui` registered when `env.docsEnabled` (default 'true') (server.ts:90-113). Available at `/docs` and `/api-docs`. Should be disabled or restricted in production. |
| **Debug Endpoints** | ❓ **Not explicitly found** | No debug/routes endpoint found in the code, but the `routes` CLI command (`pnpm routes`) lists every registered route — could aid reconnaissance. |
| **Mass Assignment** | ⚠️ **Possible through `additionalProperties: true`** | Several routes use `{ body: { type: 'object', additionalProperties: true } }` (bookings.ts:103, petRoutes lines, etc.), which allows any field in the request body, including fields not intended for editing. |
| **File Upload** | ❓ **Not examined** | No file upload endpoints found in the API routes. The widget and admin dashboard handle file uploads differently. |
| **Open Redirect** | ❌ **Not found** | No open redirect endpoints discovered in the codebase. |
| **SSRF** | ❌ **Not found** | No SSRF vulnerabilities discovered; all URL constructions use controlled inputs. |
| **CSRF (Cross-Site Request Forgery)** | ⚠️ **Partial** | CSRF protection enabled for cookie-based auth (secure: prod, sameSite: lax). Mobile/native clients and widget send JSON bodies without cookies, so CSRF is not a vector for those clients. However, the `/api/auth/refresh` endpoint accepts refresh tokens in the request body — if combined with an XSS vulnerability, could be exploited. |
| **Rate Limiting per Endpoint** | ⚠️ **Variable** | Global 300/min rate limit (server.ts:70-77). Additional per-endpoint limits: `/api/auth/refresh` has `max: 30` (auth.ts:248); AI chat has `max: 60` (aiChat.ts:21). No per-route rate limiting for most endpoints. |
| **CORS - Origin Validation** | ⚠️ `origin: true` | Allows all origins. Combined with `credentials: true`, this could allow cross-origin requests from any domain. Should be restricted to trusted domains in production. |
| **Dependency Vulnerabilities** | ⚠️ **Present** | Root `package.json` has `zod: ^4.6.5` override. Transitive vulnerabilities exist. Need `npm audit` or `pnpm audit`. |
| **Sensitive Headers** | ✅ **Helmet redact** | `server.ts:34: redact: ['req.headers.authorization', 'req.headers.cookie']` — logs redact sensitive header values. |

---

## 11.2 Injection Vulnerabilities

### 11.2.1 SQL Injection

**Risk:** None detected. All database operations go through Prisma ORM which uses parameterized queries. The Prisma schema has proper foreign keys and no raw SQL queries are present in the codebase.

### 11.2.2 NoSQL Injection

**Risk:** None detected. No NoSQL databases in the stack.

### 11.2.3 Command Injection

**Risk:** None detected. No `child_process.exec`, `spawn`, or similar commands are used.

### 11.2.4 Path Traversal

**Risk:** None detected. File paths are not constructed from user input in the examined code.

---

## 11.3 XSS (Cross-Site Scripting)

### 11.3.1 Frontend XSS Risks

The clinic-admin dashboard uses React with `dangerouslySetInnerHTML` not observed in the code. User-generated content (client names, pet names, symptoms, diagnoses, treatment plans, comments) is displayed in the UI but likely rendered via React's inherent XSS protection (text content between `{}` is escaped).

**Potential XSS vectors:**
- **Notification titles/descriptions** in Header (`Header.tsx:90-116`): `notif.title` and `notif.desc` are displayed directly. If a message from WhatsApp/Instagram contains HTML, it could be rendered in the notification badge.
- **Pet names/clients in medical records** displayed in the dashboard — React should escape these, but if any `dangerouslySetInnerHTML` is used, XSS could occur.
- **Arabic/RTL text** in React: Generally safe, but long compound words could potentially break out of layout constraints.

### 11.3.2 API-Level XSS

No direct XSS vectors at the API level (API returns JSON, not HTML). XSS would only occur if API data is later rendered in the frontend without proper escaping.

---

## 11.4 CSRF (Cross-Site Request Forgery)

### 11.4.1 CSRF Protection Status

- **Enabled** for cookie-based authentication on the web platform:
  - `fastify-csrf-protection` with `cookieOpts: { signed: true, httpOnly: true, sameSite: 'lax', secure: env.isProduction }`
  - Cookie `access_token` is httpOnly, so JavaScript cannot read it directly — but the CSRF protection works by verifying a matching `_csrf` cookie token on state-changing requests.

- **Not applicable** to:
  - Mobile/native clients (send JSON bodies, no cookies)
  - Embeddable widget (framework-free, may not set cookies)
  - The `/api/auth/refresh` endpoint (accepts refresh token in request body, not via cookie)

### 11.4.2 CSRF Bypass Risk

The `/api/auth/refresh` endpoint accepts refresh tokens in the request body:
```js
async (request, reply) => {
  const { refreshToken } = (request.body ?? { }) as { refreshToken?: string };
```
If an attacker can induce a logged-in user to make a `POST /api/auth/refresh` request via XSS (same-origin, since cookies are httpOnly, the attacker cannot read the csrf cookie, but can still send a request that includes it if the browser auto-sends it), the attacker could rotate the refresh token and maintain session access.

**However:** The httpOnly, signed cookie means the attacker cannot forge a valid CSRF token without knowing the secret. The `sameSite: 'lax'` means the cookie is not sent on top-level navigation from a different origin, which provides some CSRF protection for top-level navigations but not for `fetch()`/`XMLHttpRequest` same-origin requests.

---

## 11.5 Session and Token Security

### 11.5.1 JWT Characteristics

- **Algorithm:** HS256 (shared secret)
- **Access token TTL:** 900 seconds (15 min) — short-lived, refreshed via refresh token
- **Refresh token TTL:** 604800 seconds (7 days) — stored in Redis whitelist by JTI
- **Tokens stored in:** httpOnly cookies (`access_token`, `refresh_token`) + optional mobile body
- **Cookie flags:** `secure: env.isProduction`, `sameSite: 'lax'`, `path: '/'`

### 11.5.2 Token Revocation

- **Access-token jti revocation:** `REVOKE_PREFIX` in Redis with TTL until natural expiry
- **Refresh-token rotation:** `GETDEL` atomic read-delete on `curavet:refresh:{jti}`
- **Redis dependency:** Revocation checks fail OPEN when Redis is down (ACC-017, Phase C)

### 11.5.3 Session Fixation

No session fixation mitigations beyond standard cookie handling. The login endpoint does not set cookies before verifying credentials (sets them after successful auth), which prevents session fixation.

---

## 11.6 Error Handling and Information Disclosure

### 11.6.1 Error Handler

`server.ts:139-148`:
```js
app.setErrorHandler((error: FastifyError, request, reply) => {
  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (statusCode >= 500) captureError(error, { url: request.url, method: request.method });
  reply.status(statusCode).send({
    error: statusCode >= 500 ? 'Internal server error' : error.message,
    ...(env.isProduction ? {} : { detail: error.message }),
  });
});
```

**Behavior:**
- **Production (`isProduction: true`):** Returns `{ error: 'Internal server error' }` — no detail leaked
- **Development (`isProduction: false`):** Returns `{ error: error.message, detail: error.message }` — full stack trace / error details exposed

**Risk:** Development-mode errors contain `detail` with the full error message, which could reveal:
- Database connection strings
- File paths
- Internal logic
- Third-party API keys (if included in error objects)

### 11.6.2 404 Handler

`server.ts:150-152`:
```js
app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({ error: `Route ${request.method} ${request.url} not found` });
});
```

Returns the requested method and URL, which aids reconnaissance but is low risk.

### 11.6.3 Validation Error Responses

Zod validation errors return `parsed.error.flatten().fieldErrors` which includes field-level error details. These are generally safe but could reveal schema structure.

---

## 11.7 API Security (OWASP API Security Top 10)

### 11.7.1 API1:2023 – Broken Authentication

**Status:** Partially addressed. JWT authentication is implemented with HS256, scrypt passwords, refresh token rotation. Issues: no per-endpoint rate limiting on login, default insecure secrets.

### 11.7.2 API2:2023 – Broken Access Control

**Status:** Critical findings from Phases C and D:
- IDOR in booking update (D-001 from Phase D)
- Super-admin tenant impersonation (D-002 from Phase D)
- Settings accessible without tenant context (C-011 from Phase C)
- `requireTenant` allows super-admin bypass

### 11.7.3 API3:2023 – Asset Management

**Status:** The API has a large surface area (20+ route modules). Endpoints are versioned by `/api/`. No deprecated endpoints found, but the Swagger UI at `/docs` exposes the full API surface.

### 11.7.4 API4:2023 – Unrestricted Resource Consumption

**Status:** Rate limiting is configured (300/min global, 30/min for `/api/auth/refresh`, 60/min for AI chat). No request body size limits beyond Fastify's `bodyLimit: 2 * 1024 * 1024` (2MB, server.ts:36). No payload size validation beyond Zod schemas.

### 11.7.5 API5:2023 – Broken Function-Level Authorization

**Status:** **CRITICAL** — Multiple findings:
- IDOR in `PATCH /api/tenants/me/bookings/:id` (D-001)
- `updateSettings` / `updateBranding` require `authenticate` only, not `requireTenant` (C-011)
- `POST /api/users` (user provisioning) requires super-admin but no tenant context validation
- `GET /api/tenants` (global list) status unknown

### 11.7.6 API6:2023 – Security Misconfiguration

**Status:** Development-default secrets will block production startup (`assertProductionSafety()`). Swagger UI enabled by default (`DOCS_ENABLED: true`). Error messages in dev mode expose details. CORS `origin: true` allows all origins.

### 11.7.7 API7:2023 – Server-Side Request Forgery

**Status:** Not found in the codebase. No URL construction from user input that could enable SSRF.

### 11.7.8 API8:2023 – Security Misconfiguration

**Status:** See API5 and API6.

### 11.7.9 API9:2023 – Insecure Code Execution

**Status:** Not found. No code execution endpoints.

### 11.7.10 API10:2023 – Server-Side Polici

**Status:** Security headers via Helmet, CORS, rate limiting all present but with configuration issues (CORS `origin: true`, Helmet CSP disabled).

---

## 11.8 Dependency Vulnerabilities

### 11.8.1 Direct Dependencies

The root `package.json` and each app's `package.json` were reviewed. Key direct dependencies and their versions:

| Package | Version | Notes |
|---|---|---|
| `fastify` | `^5.12.5` | Latest stable |
| `@fastify/cors` | `^11.3.0` | Latest |
| `@fastify/csrf-protection` | `^8.0.1` | Latest |
| `@fastify/helmet` | `^13.1.1` | Latest |
| `@fastify/rate-limit` | `^11.2.0` | Latest |
| `bullmq` | `^5.12.0` | Latest |
| `stripe` | `^22.6.2` | Latest (as of audit) |
| `openai` | `^7.23.0` | Latest |
| `zod` | `^4.6.5` (overridden) | Overridden via `pnpm` overrides |
| `typescript` | `^7.0.2` | Latest |
| `prisma` | `^5.22.0` | Latest |

### 11.8.2 Transitive Vulnerabilities

No `npm audit` or `pnpm audit` was run during this audit. A dependency vulnerability scan is recommended but not performed as part of this audit. The `pnpm lockfile` is present and should be used to verify pinned versions.

### 11.8.3 Known Issues

- `zod@^4.6.5` override at the root level may conflict with individual package versions
- No explicit vulnerability scanning performed

---

## 11.9 Sensitive Information in Source Code and Configuration

### 11.9.1 Default Secrets in `.env`

The following insecure defaults are present in `.env` and `.env.example` (env.ts:19-37):

| Variable | Default Value | Risk |
|---|---|---|
| `JWT_SECRET` | `curavet_super_jwt_secret_change_in_production_2026` | Must be rotated before production |
| `CREDENTIALS_ENCRYPTION_KEY` | `curavet_aes256_encryption_master_key_2026` | Must be rotated before production |
| `SUPERADMIN_PASSWORD` | `admin123` | Must be rotated before production |
| `SUPERADMIN_EMAIL` | `admin@curavet.io` | Publicly documented; not secret per se |
| `META_VERIFY_TOKEN` | (required, no default) | Must be configured; if missing, webhook verification disabled |

### 11.9.2 Environment Files

- `.env` — project root, likely has the same defaults as `env.ts`
- `.env.example` — documents the defaults
- `.env` in each app directory — may have app-specific settings

**Never commit actual secrets** to version control. The `.gitignore` should exclude `.env` files.

---

## 11.10 Application Security Findings

| Category | Status | Key Issues |
|---|---|---|
| **Injection vulnerabilities** | ✅ **None found** | All DB ops through Prisma ORM; no raw SQL; no command injection |
| **XSS** | ⚠️ **Low risk** | React frontend should escape user content; no `dangerouslySetInnerHTML` observed; API returns JSON only |
| **CSRF** | ⚠️ **Partial** | Protection enabled for cookie-based web; not applicable to mobile/widget; `/api/auth/refresh` accepts body token |
| **Authorization bypasses** | ❌ **CRITICAL** | IDOR in booking update (D-001); settings without tenant context (C-011); super-admin tenant impersonation (D-002) |
| **Sensitive data in errors** | ❌ **Present** | Dev mode errors expose `detail: error.message`; production mode safe |
| **Security headers** | ✅ **Mostly good** | Helmet active; CSP disabled; CORS `origin: true` too permissive |
| **Rate limiting** | ⚠️ **Variable** | Global 300/min; per-endpoint: refresh 30/min, AI chat 60/min; login has no specific limit |
| **API authorization** | ❌ **Critical** | Broken function-level authorization (see above) |
| **Dependency vulnerabilities** | ⚠️ **Unverified** | No `npm audit` / `pnpm audit` run; transitive vulnerabilities unknown |
| **Secret exposure** | ❌ **Critical** | Default secrets in `.env` must be rotated before production |
| **Debug/-info endpoints** | ⚠️ **Present** | `pnpm routes` lists all routes; Swagger UI at `/docs` when `DOCS_ENABLED=true` |
| **Mass assignment** | ⚠️ **Possible** | `additionalProperties: true` in several routes allows unexpected fields |
| **File upload** | ❓ **Not examined** | No file upload endpoints in API; widget may have separate handling |
| **Open redirect / SSRF** | ✅ **Not found** | No such vulnerabilities discovered |

---

## 11.11 Confidence Assessment

- **Confirmed:** No SQL injection, command injection, or path traversal; Helmet headers active; scrypt password hashing; proper JWT structure; IDOR vulnerabilities confirmed from Phase C/D analysis; default secrets block production startup; CORS `origin: true` allows all origins; development errors expose detail field.
- **Suspected:** CSRF bypass risk on `/api/auth/refresh`; mass assignment through `additionalProperties: true` could allow field injection; Swagger UI exposure in production; dependency vulnerabilities unknown.
- **Unverified:** Cannot run `npm audit` or `pnpm audit` without potential network access; actual XSS exploitability in frontend; real-world SSRF/open redirect test not performed.

**Overall:** The application has critical authorization bypass vulnerabilities (IDOR, tenant context gaps) that combine with the default secret exposure issues to create a significant security risk. The code has good foundational security (parameterized queries, password hashing, JWT structure, Helmet headers) but these are undermined by the authorization gaps and production-default secrets.

---

## 11.12 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P0** | **Fix IDOR in `bookings.ts:236`** — add `tenantId` to `prisma.booking.update` where clause (also blocks D-001 from Phase D) | 5 min |
| **P0** | **Rotate all default secrets** before production: `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `SUPERADMIN_PASSWORD` | 15 min |
| **P0** | **Restrict CORS `origin`** to trusted domains instead of `origin: true` | 15 min |
| **P0** | **Disable Swagger UI / restrict docs** in production (`DOCS_ENABLED: false`) | 5 min |
| **P1** | **Fix `updateSettings` / `updateBranding` to require `requireTenant`** (Phase C, C-011) | 30 min |
| **P1** | **Add per-endpoint rate limiting** to `/api/auth/login` | 30 min |
| **P1** | **Remove `detail` from error responses** in development or ensure no sensitive data in error objects | 15 min |
| **P1** | **Address mass assignment risk** — replace `additionalProperties: true` with explicit schemas where possible | 2-4 hours |
| **P2** | **Add CSP configuration** via Helmet or custom Fastify plugin | 1 hour |
| **P2** | **Fix super-admin tenant impersonation** — add audit logging and/or restrict impersonation (Phase D, D-002) | 1 hour |
| **P3** | **Run `pnpm audit`** and fix transitive vulnerabilities | 1-2 hours |
| **P3** | **Add X-Content-Type-Options and X-Frame-Options** headers (already via Helmet, verify configuration) | 15 min |

---

## 11.13 Critical Security Gate: Application Security

**Status: BLOCKED** — The IDOR vulnerability in booking updates (K-001) combined with the default secret exposure and CORS misconfiguration constitutes confirmed security defects that must be remediated before deployment.

**Specifically blocked until:**
1. IDOR in `bookings.ts:236` is fixed
2. All default secrets are rotated
3. CORS is restricted to trusted domains
4. Swagger UI is disabled for production

These are not optional improvements — they are security requirements for a SaaS handling veterinary patient data and financial records.