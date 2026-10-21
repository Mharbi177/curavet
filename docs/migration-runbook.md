# Database migration & data backfill runbook

This runbook covers rolling GlamBot from the pre-Phase-4 schema to the current
one, **without losing customer data**.

The single most important thing to understand before you start:

> There is no previous migration history in this repository. The file
> `prisma/migrations/20260101000000_init_growth_enterprise/migration.sql` was
> generated with `prisma migrate diff --from-empty`, so it creates the *full*
> current schema. It is only safe to apply to an **empty database**.

If you already have a populated database, do **not** run it. Use the
"Existing database" path below instead.

---

## 1. Fresh environment (CI, staging, new salon)

```bash
# From the repo root
pnpm install
pnpm db:generate
pnpm db:deploy      # applies prisma/migrations/** in order
pnpm seed           # optional demo tenant + super-admin
pnpm --filter api start
```

Verify:

```bash
curl http://localhost:3000/health          # {"status":"ok"}
curl http://localhost:3000/api/system/status | jq
```

---

## 2. Existing database with production data

The Phase 4/5 work introduced these tables/columns. On an existing database you
need an *incremental* diff instead of a full create.

### 2.1 Capture a backup first. Always.

```bash
pg_dump "$DATABASE_URL" -Fc -f glambot-pre-migration.dump
# Verify the dump is non-empty before continuing.
ls -lh glambot-pre-migration.dump
```

### 2.2 Generate an incremental migration

Point `--from-schema-datasource` at the **currently deployed** schema and
`--to-schema-datamodel` at the new one:

```bash
cd packages/db

# Save the old schema from git history first.
git show <last-release-tag>:packages/db/prisma/schema.prisma > prisma/old-schema.prisma

npx prisma migrate diff \
  --from-schema-datamodel prisma/old-schema.prisma \
  --to-schema-datamodel   prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_growth_enterprise/migration.sql
```

Review the SQL. `prisma migrate diff` will emit `DROP TABLE` / `DROP COLUMN`
statements for anything the new schema no longer defines — **delete those
statements** unless you are certain the data is disposable.

### 2.3 Apply

```bash
cd packages/db
npx prisma migrate deploy
npx prisma generate

---

## 3. Backfill requirements

These are **not** expressible as Prisma migrations — they need application-level
logic and, for credentials, access to the original secrets.

### 3.1 Create `User` rows for existing admins

Before Phase 4 there were no `User` records; salon admins authenticated from
`Tenant` alone. Every existing admin must become a `User` before login works.

```sql
-- Inspect what will be created. Run this first, every time.
SELECT t.id, t.slug, t.name
FROM "Tenant" t
LEFT JOIN "User" u ON u."tenantId" = t.id
WHERE u.id IS NULL;
```

Create one `salon_admin` per tenant, or import the existing admin list. Passwords
must be hashed with the same scrypt parameters the app uses
(`services/auth.ts` → `hashPassword`); plaintext or bcrypt hashes will not work.

### 3.2 Create the platform super-admin

Generate the hash with the application helper rather than by hand, so the
parameters can never drift from what login expects:

```bash
cd apps/api
node -e "const{hashPassword}=require('./dist/services/auth');console.log(hashPassword(process.argv[1]))" 'CHANGEME'
```

```sql
INSERT INTO "User" (id, email, "passwordHash", name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'admin@glambot.io',
  '<scrypt hash printed above>',
  'Platform Admin',
  'super_admin',
  true,
  now(),
  now()
);
```

### 3.3 Encrypt existing integration credentials

`TenantIntegration.encryptedCredentials` must hold AES-256-GCM ciphertext, not
plaintext. A backfill script must:

1. Read every row where `encryptedCredentials` looks like plaintext (no `:` separators).
2. Re-encrypt with `CREDENTIALS_ENCRYPTION_KEY`.
3. Write the new value.

**Critical:** if the existing production data was encrypted under a different
master key, set `CREDENTIALS_ENCRYPTION_KEY` to the *old* key for the backfill
run, then rotate. Re-encrypting under a new key without a migration step makes
every existing integration silently fail to authenticate.

### 3.4 Populate white-label and language fields

New nullable columns on `Tenant` (`brandName`, `logoUrl`, `primaryColor`,
`customDomain`, `webWidgetKey`, …) default to `NULL`. Backfill sensible values
or leave them null — the API already falls back to the tenant `name` and a
default primary colour.

`webWidgetKey` must be populated for any tenant that wants the chat widget:

```sql
UPDATE "Tenant"
SET "webWidgetKey" = 'wgt_' || encode(gen_random_bytes(12), 'hex')
WHERE "webWidgetKey" IS NULL;
```

### 3.5 Verify the backfill

```sql
-- No tenant should be without an admin.
SELECT count(*) FROM "Tenant" t
LEFT JOIN "User" u ON u."tenantId" = t.id AND u.role = 'salon_admin'
WHERE u.id IS NULL;                                  -- expect 0

-- No credential should still be plaintext.
SELECT count(*) FROM "TenantIntegration"
WHERE "encryptedCredentials" IS NOT NULL
  AND "encryptedCredentials" NOT LIKE '%:%';         -- expect 0

-- Custom domains must be unique.
SELECT "customDomain", count(*) FROM "Tenant"
WHERE "customDomain" IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;                      -- expect 0 rows
```

---

## 4. Post-migration smoke test

```bash
pnpm --filter api smoke     # 60 runtime assertions, no DB writes required
pnpm --filter api test      # 131 unit + integration tests
```

Then, against the real database:

```bash
# A real login for a backfilled admin
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<backfilled-admin>","password":"<password>"}'

# Confirm queues came up against Redis
curl http://localhost:3000/api/system/status | jq '.queue'
```

---

## 5. Rollback

The migration is additive, so rolling back the schema is rarely necessary.
Prefer a forward fix. If you must:

```bash
# 1. Stop writers so nothing new is written.
docker compose stop api salon-admin super-admin

# 2. Restore.
pg_restore -d "$DATABASE_URL" --clean --if-exists glambot-pre-migration.dump

# 3. Roll the code back, then restart.
git checkout <last-good-release>
docker compose up -d
```

Credentials re-encrypted during step 3.3 are **not** recoverable from the backup —
you will need the original secrets. Keep them somewhere safe until the migration
is confirmed stable.

```
