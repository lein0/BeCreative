# BeCreative

BeCreative is a booking platform for independent creative teachers. Teachers set the price. Students book a session, a whole series, a class pack, or a membership. There is no credit subscription.

The app runs locally and in CI with Postgres only. Production is meant to be the owner's AWS account. Nothing in the repo calls Supabase, and no cloud account is required to boot the demo.

## Setup

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

`npm run db:wipe-demo` removes rows flagged `is_demo` and leaves categories and platform settings in place. The seed is idempotent: it wipes demo data, then inserts it again.

## Demo logins

Password for every demo account: `DemoPass123!`

| Email | Role |
| --- | --- |
| admin@becreative.demo | Admin |
| manager@becreative.demo | Account manager |
| teacher@becreative.demo | Maya Alvarez, approved teacher in Silver Lake |
| student@becreative.demo | Student with bookings and a class pack |
| lila@becreative.demo | Teacher pending approval |

## What you can click through

- Explore classes on a Leaflet map and book a session, with promo code `BECREATIVE15` or `MAYA10`.
- A teacher profile at `/t/maya-alvarez`, a class at `/c/scene-study`, a link-in-bio page at `/t/maya-alvarez/bio`, and an embed at `/embed/maya-alvarez`.
- Share opens a sheet with copy, a QR code, a promo baked into the URL, and a link preview.
- Studio → New class: one-time or repeating, with a plain-English summary and the generated dates before save.
- Roster, attendance, manual bookings, and email on a session page.
- Reports include clicks and attributed bookings. Billing shows the amount owed after payouts.
- Admin stats, teacher approval, platform promos, and the fee setting.
- CRM at `/crm` for admins and account managers: filters, saved views, kanban, follow-ups due, CSV import/export, convert to teacher.
- Account managers edit any teacher's class at `/manage`. Those edits are audited. They do not see platform finances.

Without Stripe keys, paid bookings complete as pay-at-studio. The confirmation email is written to the `email_outbox` table and printed by the console provider.

## Stacking and money

- One promo code per order.
- Codes do not apply to a $0 class, a first-class-free intro, or a booking paid with pack or membership credits.
- First class free, when the teacher allows it, is one intro per student per teacher and beats a promo code.
- Pack credits spend one credit per drop-in session. They do not automatically pay a cash series price.
- The platform fee is a percent and an optional fixed amount, stored in `platform_settings` and edited by admins. It applies to online card charges. Offline, manual, and pay-at-studio bookings carry a $0 platform fee.
- Teacher baseline is the list price minus the normal fee on the list price.
- Teacher-funded: the teacher absorbs the full discount off that baseline, so the platform still keeps the original fee when the student payment covers it.
- Platform-funded: the teacher keeps the full-price baseline. If the fee cannot absorb the discount, the shortfall is recorded as platform liability. Stripe cannot transfer more than the charge.
- Split: `platformSharePercent` of the discount is platform-funded and the rest comes off the teacher baseline.
- Stripe Checkout is charged the discounted student amount. The `orders` table is the ledger. The app does not create Stripe coupons.

## Stripe mapping

| Product | Stripe | Ledger |
| --- | --- | --- |
| Session, series, pack | Checkout `mode=payment` on the platform, `application_fee_amount`, `transfer_data.destination` when the teacher has a connected account | `orders` row is the source of truth |
| Membership | Checkout `mode=subscription` with `application_fee_percent` and `transfer_data` on the connected account | `membership_subscriptions` plus the order |
| $0, credits, intro, or no Stripe keys | No Checkout session | Order status `paid`, `pay_at_studio`, or entitlement |

Webhook: `POST /api/webhooks/stripe` handles `checkout.session.completed`, `charge.refunded`, and `account.updated`.

## Architecture

- Next.js App Router, TypeScript, Tailwind.
- Drizzle and Postgres. Migrations live in `drizzle/`.
- Better Auth with email and password. Sessions are in Postgres. Role checks run on the server for every studio, admin, CRM, and booking action.
- Email goes through `lib/email.ts`. `console` writes the outbox. `ses` uses Amazon SES.
- Uploads go through `lib/storage.ts`. `local` stores files under `./data/uploads`. `s3` returns a presigned PUT. The browser never receives the AWS secret key.
- Maps are Leaflet and OpenStreetMap behind `components/studio-map.tsx`. Geocoding is `lib/geocode.ts` (`local`, `nominatim`, or `mapbox`).
- Recurring classes store a rule plus generated session rows. A rolling window covers "never" (about eight weeks ahead). Instances with bookings are kept. Times are America/Los_Angeles, including DST.
- Share links: `/t/[slug]`, `/c/[slug]`, `/t/[slug]/bio`, `/t/[slug]/p/[pack]`, `/t/[slug]/m/[membership]`, plus `?session=`, `?code=`, `?ref=`, and UTM params. `proxy.ts` stores attribution for 30 days. Clicks land in `link_clicks`.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `BETTER_AUTH_URL` | Auth base URL |
| `NEXT_PUBLIC_APP_URL` | Public origin for links, embeds, and Checkout return URLs |
| `NEXT_PUBLIC_APP_NAME` | Product name |
| `REQUIRE_EMAIL_VERIFICATION` | `false` skips the verification email |
| `EMAIL_PROVIDER` | `console` or `ses` |
| `EMAIL_FROM` | From line for the console provider |
| `NEXT_PUBLIC_MAP_PROVIDER` | `leaflet` |
| `GEOCODER_PROVIDER` | `local`, `nominatim`, or `mapbox` |
| `MAPBOX_TOKEN` | Only for the Mapbox geocoder |
| `STORAGE_PROVIDER` | `local` or `s3` |
| `UPLOAD_DIR` | Local upload directory |
| `AWS_REGION` | SES and S3 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Server-side only |
| `S3_BUCKET` | Media bucket |
| `S3_ENDPOINT` | Optional. Set for MinIO |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO |
| `S3_PUBLIC_URL_BASE` | Optional public base for object URLs |
| `SES_FROM_EMAIL` | Verified SES sender |
| `STRIPE_SECRET_KEY` | Secret key. Omit to run pay-at-studio |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key. Both keys are required before Checkout is used |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |

The platform fee is not an environment variable. Admins edit it in settings.

`docker compose --profile minio up -d` starts MinIO on ports 9000 and 9001 (`becreative` / `becreative-secret`).

## AWS resources to provision

Point the same env vars at these and the app does not need a code change.

- VPC with private subnets for the database.
- RDS Postgres or Aurora PostgreSQL. Put the connection string in `DATABASE_URL`. Run `npm run db:migrate` against it.
- S3 bucket for class media, with CORS allowing `PUT` from the site origin. IAM credentials limited to `s3:PutObject` and `s3:GetObject` on that bucket.
- SES in the same region: a verified identity, production access, and `SES_FROM_EMAIL`.
- A Node host that can run Next.js server-side (Amplify Hosting SSR, ECS, or a similar service). This app uses server actions, webhooks, and a Postgres session, so a static export will not work.
- Secrets for `DATABASE_URL`, `BETTER_AUTH_SECRET`, AWS keys, and Stripe keys.
- Stripe webhook endpoint `https://<host>/api/webhooks/stripe`.
- Stripe Connect Express is created per teacher when you add an onboarding flow on top of `stripeAccountId`. Checkout already sends `transfer_data.destination` when that id is set.

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:wipe-demo
```

## Known gaps

- A pending Stripe Checkout holds a seat until the webhook or a cancel. Holds do not expire on their own.
- Cancelling one date of a series does not prorate a series booking. A single-session booking refunds when Stripe has a payment intent.
- Class emails put every recipient on the `To` line. There is no BCC.
- `next_step_due` is stored and shown in the CRM. It is intentionally absent from the official 36-column CSV so a round trip does not invent a column. Import leaves an existing due date alone when the column is missing.
- Platform-funded discounts larger than the fee are recorded as liability. There is no automatic Stripe top-up transfer.
- The local geocoder uses neighborhood centroids plus a small jitter. It is not a street-level geocoder.
- A map provider other than Leaflet shows that maps are not configured.
- Manual bookings do not block when the session is already full. They are the pen-and-paper path.
- Converting a lead emails a temporary password and also writes it on the activity. That is for the demo, not a production invite flow.
