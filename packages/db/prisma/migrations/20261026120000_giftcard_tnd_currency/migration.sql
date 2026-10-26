-- Fix GiftCard.currency default from AED (Gulf) to TND (Tunisia)
-- CuraVet's primary deployment market is Tunisia.
ALTER TABLE "GiftCard" ALTER COLUMN "currency" SET DEFAULT 'TND';
