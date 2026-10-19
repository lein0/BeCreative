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

`npm run db:seed` also creates or upgrades every address in `ADMIN_EMAILS` (default `eric.leino@gmail.com`) as an admin. That account has no password. Use Forgot password, or Google when those keys are set. Production deploy steps are in `DEPLOY.md`.

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
- Better Auth with email and password. Sessions are in Postgres. Role checks run on the server for `/teach`, `/admin`, `/manage`, and `/crm`. See `DEPLOY.md` for App Runner.
- Email goes through `lib/email.ts`. `console` writes the outbox. `ses` uses Amazon SES.
- Uploads go through `lib/storage.ts`. `local` stores files under `./data/uploads`. `s3` returns a presigned PUT. The browser never receives the AWS secret key.
- Maps are Leaflet and OpenStreetMap behind `components/studio-map.tsx`. Geocoding is `lib/geocode.ts` (`local`, `nominatim`, or `mapbox`).
- Recurring classes store a rule plus generated session rows. A rolling window covers "never" (about eight weeks ahead). Instances with bookings are kept. Times are America/Los_Angeles, including DST.
- Share links: `/t/[slug]`, `/c/[slug]`, `/t/[slug]/bio`, `/t/[slug]/p/[pack]`, `/t/[slug]/m/[membership]`, plus `?session=`, `?code=`, `?ref=`, and UTM params. `proxy.ts` stores attribution for 30 days. Clicks land in `link_clicks`.
- Feedback is limited to admins and account managers. The ✎ button opens a full-page drawing overlay. Marks are stored in page coordinates. Screenshots go to object storage. Admin notes are approved and dispatched immediately. Account manager notes stay `pending_review` until an admin approves them. Dispatch is `createFeedbackDispatcher()` in `lib/feedback-webhook.ts`: a webhook by default, and a no-op that records `undelivered` when `FEEDBACK_WEBHOOK_URL` is unset. The POST never fails the user's submit.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Session signing secret. `BETTER_AUTH_SECRET` is the fallback |
| `APP_URL` | Public origin. `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are fallbacks |
| `ADMIN_EMAILS` | Comma-separated admins. Default `eric.leino@gmail.com`. No password is seeded |
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
| `CHECKOUT_HOLD_MINUTES` | Unpaid Checkout hold. Default 30 |
| `FEEDBACK_WEBHOOK_URL` | Approved feedback is POSTed here. Unset records the delivery as undelivered |
| `FEEDBACK_WEBHOOK_SECRET` | HMAC-SHA256 secret for `X-Feedback-Signature` |
| `FEEDBACK_WEBHOOK_KEY` | Bearer token sent as `Authorization` on the webhook |
| `FEEDBACK_CALLBACK_TOKEN` | Bearer token for the fixer status and queue APIs |
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
- App Runner (or another Node host) running the container in `Dockerfile`. See `DEPLOY.md` for the image, health check, migrations, and instance role. A static export will not work.
- Secrets for `DATABASE_URL`, `AUTH_SECRET`, and Stripe keys when you turn Stripe on. S3 and SES use the instance role when access keys are unset.
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

## Feedback webhook

Approved items POST `feedback.approved` to `FEEDBACK_WEBHOOK_URL`. The signature header is `X-Feedback-Signature: sha256=<hmac-sha256 of the raw body>` using `FEEDBACK_WEBHOOK_SECRET`. The same request sends `Authorization: Bearer <FEEDBACK_WEBHOOK_KEY>`. Retries are three attempts with 500ms and 1500ms backoff. Each attempt is stored on the feedback item.

`sensitive` is true when the route, targets, title, or comment touch billing, checkout, Stripe, payouts, auth, roles, permissions, promo funding, or admin settings. The fixer should ask before changing those.

The fix loop calls back with `Authorization: Bearer <FEEDBACK_CALLBACK_TOKEN>`:

- `POST /api/feedback/:id/status` with `{ "status", "fix_pr_url", "fix_notes", "comment" }`. Status is one of `queued`, `in_progress`, `needs_info`, `fixed`, `deployed`, `wont_fix`.
- `GET /api/feedback/queue?status=approved` returns `{ "items": [ ... ] }` using the same item shape.

```json
{
  "event": "feedback.approved",
  "sent_at": "2026-10-08T00:40:00.000Z",
  "item": {
    "id": "6d5c2a0e-0000-4000-8000-000000000001",
    "title": "Neighborhood label sits under the pin",
    "body": "On Explore, the Silver Lake label is hidden behind the map pin.",
    "type": "bug",
    "priority": "normal",
    "status": "approved",
    "sensitive": false,
    "url": "https://classes.example/explore",
    "route": "/explore",
    "selector": "main > section:nth-of-type(1)",
    "element_text": "Explore",
    "targets": [{ "selector": "main > section:nth-of-type(1)", "text": "Explore" }],
    "marks": [{ "type": "box", "x": 420, "y": 280, "w": 160, "h": 48 }],
    "viewport": { "w": 1280, "h": 800, "dpr": 1.5, "scroll_x": 0, "scroll_y": 0 },
    "device": "desktop",
    "screenshot_url": "https://classes.example/api/media/feedback/2026/shot.jpg",
    "author": { "id": "user_admin", "name": "Avery Chen", "email": "admin@becreative.demo", "role": "admin" },
    "approved_by": "user_admin",
    "approved_at": "2026-10-08T00:40:00.000Z",
    "fix_pr_url": null,
    "fix_notes": null,
    "created_at": "2026-10-08T00:39:00.000Z",
    "comments": []
  }
}
```

Screenshot URLs are absolute. Local storage uses the app origin. S3 uses a presigned GET that lasts seven days. The image bytes are not stored on the feedback row.

## Known gaps

- A paid Stripe webhook that arrives after the hold expired does not reopen the seat. `CHECKOUT_HOLD_MINUTES` defaults to 30.
- Cancelling one date of a series does not prorate a series booking. A single-session booking refunds when Stripe has a payment intent.
- `next_step_due` is stored and shown in the CRM. It is intentionally absent from the official 36-column CSV so a round trip does not invent a column. Import leaves an existing due date alone when the column is missing.
- Platform-funded discounts larger than the fee are recorded as liability. There is no automatic Stripe top-up transfer.
- The local geocoder uses neighborhood centroids plus a small jitter. It is not a street-level geocoder.
- A map provider other than Leaflet shows that maps are not configured.
- Converting a lead with an existing password leaves that password in place and links the studio. A new teacher gets a set-password link.
- Feedback webhook retries run in the request that follows submit. A crash mid-retry does not resume. Admins can resend from the feedback item.
