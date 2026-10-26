-- Four-role RBAC model (clean break from the legacy salon roles).
-- Legacy text values are converted one final time, then the column becomes a
-- strict enum so no legacy value can ever be written again.
CREATE TYPE "Role" AS ENUM ('super_admin', 'doctor', 'receptionist', 'client');

UPDATE "User" SET "role" = CASE
  WHEN "role" IN ('super_admin') THEN 'super_admin'
  WHEN "role" IN ('salon_admin', 'admin') THEN 'doctor'
  WHEN "role" IN ('staff', 'receptionist') THEN 'receptionist'
  ELSE 'client'
END;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'doctor';
