/**
 * setup-stripe-products.ts
 * Run once to create GlamBot subscription products and prices in Stripe test mode.
 * Usage: npx tsx src/scripts/setup-stripe-products.ts
 */
import Stripe from 'stripe';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
});

const PLANS = [
  {
    key: 'starter',
    name: 'GlamBot Starter',
    description: 'Perfect for a single boutique salon. 1 location, WhatsApp integration, up to 500 AI bookings/mo.',
    price_aed: 299,
  },
  {
    key: 'pro',
    name: 'GlamBot Pro',
    description: 'For established salons ready to scale. Up to 3 locations, WhatsApp + Instagram, unlimited AI bookings.',
    price_aed: 499,
  },
  {
    key: 'enterprise',
    name: 'GlamBot Enterprise',
    description: 'For large franchises. Unlimited locations, white-label widget, dedicated account manager.',
    price_aed: 1499, // Custom pricing placeholder
  },
];

async function main() {
  console.log('🚀 Setting up GlamBot Stripe products...\n');

  const priceIds: Record<string, string> = {};

  for (const plan of PLANS) {
    // Create or find existing product
    const existingProducts = await stripe.products.search({
      query: `name:'${plan.name}'`,
    });

    let product: Stripe.Product;
    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`✅ Product already exists: ${plan.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { glambot_plan: plan.key },
      });
      console.log(`✨ Created product: ${plan.name} (${product.id})`);
    }

    // Check existing prices for this product
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 1,
    });

    let price: Stripe.Price;
    if (existingPrices.data.length > 0) {
      price = existingPrices.data[0];
      console.log(`✅ Price already exists for ${plan.name}: ${price.id} (${plan.price_aed} AED/mo)`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_aed * 100, // Stripe uses smallest currency unit
        currency: 'aed',
        recurring: { interval: 'month' },
        metadata: { glambot_plan: plan.key },
      });
      console.log(`💰 Created price for ${plan.name}: ${price.id} (${plan.price_aed} AED/mo)`);
    }

    priceIds[plan.key] = price.id;
  }

  // Write price IDs to .env
  const envPath = path.resolve(__dirname, '../../.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  for (const [plan, priceId] of Object.entries(priceIds)) {
    const key = `STRIPE_PRICE_${plan.toUpperCase()}`;
    const line = `${key}=${priceId}`;
    if (envContent.includes(key)) {
      envContent = envContent.replace(new RegExp(`${key}=.*`), line);
    } else {
      envContent += `\n${line}`;
    }
  }

  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ All done! Price IDs written to .env:');
  for (const [plan, priceId] of Object.entries(priceIds)) {
    console.log(`   STRIPE_PRICE_${plan.toUpperCase()}=${priceId}`);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
