-- Phase 4: Tunisian localization — TND millimes, payment methods, Africa/Tunis

-- Payment: counter-sale settlement method
ALTER TABLE "Payment" ADD COLUMN "method" TEXT;
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'TND';

-- Legacy AED amounts are value-equivalent to record in TND only after a rate
-- conversion by ops; keep history as-is, just retag defaults at DB level.
UPDATE "Payment" SET "currency" = 'TND' WHERE "currency" = 'AED';
UPDATE "Booking" SET "currency" = 'TND' WHERE "currency" = 'AED';
ALTER TABLE "Booking" ALTER COLUMN "currency" SET DEFAULT 'TND';

-- New tenants default to the Tunisian timezone and veterinary brand color
ALTER TABLE "Tenant" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Tunis';
ALTER TABLE "Tenant" ALTER COLUMN "primaryColor" SET DEFAULT '#059669';
ALTER TABLE "Tenant" ALTER COLUMN "emergencyPhone" SET DEFAULT '+216 71 000 000';
