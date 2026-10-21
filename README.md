# CuraVet 🐾🩺
**AI-Powered Veterinary Practice Management, Autonomous Booking & Triage Platform**

CuraVet is a modern, multi-tenant B2B SaaS platform engineered specifically for veterinary clinics, animal hospitals, and companion pet care practices.

---

## 🌟 Key Capabilities
- **24/7 Omnichannel AI Veterinary Reception**: Handles appointment inquiries, pricing, and bookings across **WhatsApp Business, Instagram DMs, and Web Widgets**.
- **Clinical Emergency Triage Guardrails**: Instant escalation protocols for life-threatening pet emergencies (toxic ingestion, respiratory distress, seizures, bloat).
- **Patient & Pet Management**: Full tracking of pets (species, breed, date of birth, weight, microchip, and medical history) linked directly to bookings.
- **Race-Free High-Concurrency Scheduling**: High-performance multi-doctor calendar preventing double-bookings.
- **Automated Retention & Care Reminders**: Automated 24h/1h WhatsApp visit reminders, vaccination due notifications, review nudges, and cancellation waitlist auto-fill.
- **Stripe Prepayment & Deposits**: Eliminates no-shows for high-value surgical procedures and dental appointments.

---

## 🏗️ Architecture
- **Backend API (`apps/api`)**: Fastify, TypeScript, LangChain/OpenAI/Groq AI agents, BullMQ on Redis.
- **Clinic Portal (`apps/clinic-admin`)**: React 19, Vite, TailwindCSS dashboard for practice managers and doctors.
- **Super Admin (`apps/super-admin`)**: Global tenant provisioning and billing dashboard.
- **Mobile App (`apps/mobile`)**: React Native / Expo app for on-duty veterinarians.
- **Web Widget (`apps/widget`)**: Embeddable booking widget for clinic websites.
- **Database (`packages/db`)**: PostgreSQL schema with Prisma ORM.

---

## 🚀 Quickstart
```bash
# 1. Install dependencies
pnpm install

# 2. Setup database
pnpm db:generate
pnpm db:migrate

# 3. Seed veterinary demo data
pnpm seed

# 4. Start all applications
pnpm dev
```
