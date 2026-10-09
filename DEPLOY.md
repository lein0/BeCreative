# Deploy BeCreative on AWS App Runner

The container listens on port 8080, runs database migrations on startup, and serves `GET /api/health`. Stripe keys are optional. Without them, checkout completes as pay at the studio.

## Build and run

```bash
docker build -t becreative .

# Apply migrations without starting the server.
docker run --rm \
  -e DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/becreative" \
  -e DATABASE_SSL=require \
  --entrypoint node \
  becreative /opt/migrate/migrate.mjs

# Demo data plus bootstrap admins. Run from a checkout, not on every deploy.
# ADMIN_EMAILS defaults to eric.leino@gmail.com. That account is created with no password.
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/becreative" DATABASE_SSL=require npm run db:seed

# Start the app. Migrations run again unless RUN_MIGRATIONS=0.
docker run --rm -p 8080:8080 --env-file .env.production becreative
```

`npm run db:migrate` is the same migration set, via drizzle-kit, for a laptop or CI. The container uses `scripts/migrate.mjs` so the image does not need drizzle-kit.

`docker build` does not embed `AUTH_SECRET`. Set it on the running service. A missing-secret line during the image build is expected.

Seed is idempotent for demo rows (`is_demo`). It does not set a password for addresses in `ADMIN_EMAILS`. After seeding, open Forgot password for `eric.leino@gmail.com`, or use Google if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. The Google redirect URI is `https://<host>/api/auth/callback/google`.

## App Runner

1. Push the image to ECR.
2. Create an App Runner service from that image. Port `8080`.
3. Health check path `/api/health`, protocol HTTP. Give the service about 40 seconds before the first check so migrations can finish.
4. Attach an instance role. Do not put AWS access keys in the environment when the role is present.
5. Put the service in a VPC connector that can reach RDS on 5432.
6. Set the environment variables below. `APP_URL` must be the public `https://` origin. Session cookies are `Secure` when that origin is HTTPS, which is what the browser sees in front of App Runner.

Start command stays the image entrypoint. It runs migrations, then `node server.js`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | RDS or Aurora Postgres connection string |
| `DATABASE_SSL` | RDS | `require` turns on TLS. The RDS CA is not bundled, so leave `DATABASE_SSL_REJECT_UNAUTHORIZED` unset (or `false`) unless you mount the AWS CA bundle |
| `AUTH_SECRET` | yes | Session signing secret, at least 32 random characters. `BETTER_AUTH_SECRET` is accepted as a fallback |
| `APP_URL` | yes | Public origin, `https://<your-domain>`. Also used as the auth base URL. `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are fallbacks. Set `NEXT_PUBLIC_APP_URL` to the same origin at image build time so any client bundle that reads it matches |
| `ADMIN_EMAILS` | yes | Comma-separated. Sign-up and sign-in grant the admin role. Default in `.env.example` is `eric.leino@gmail.com` |
| `AWS_REGION` | with S3 or SES | Region for the SDK |
| `S3_BUCKET` | with S3 | Media bucket. `STORAGE_PROVIDER=s3` |
| `SES_FROM_EMAIL` | with SES | Verified sender. `EMAIL_PROVIDER=ses` |
| `EMAIL_PROVIDER` | no | `console` logs mail. `ses` sends through SES |
| `GOOGLE_CLIENT_ID` | no | Google sign-in is off until both this and `GOOGLE_CLIENT_SECRET` are set |
| `GOOGLE_CLIENT_SECRET` | no | Pair to the client id |
| `CHECKOUT_HOLD_MINUTES` | no | How long an unpaid Stripe Checkout holds a seat. Default 30 |
| `FEEDBACK_WEBHOOK_URL` | no | Where approved feedback is POSTed. Unset stores the attempt as undelivered |
| `FEEDBACK_WEBHOOK_SECRET` | with the webhook | HMAC-SHA256 key for `X-Feedback-Signature: sha256=<hex>` over the raw JSON body |
| `FEEDBACK_WEBHOOK_KEY` | with the webhook | Sent as `Authorization: Bearer <key>` on the same POST |
| `FEEDBACK_CALLBACK_TOKEN` | no | Bearer token for `POST /api/feedback/:id/status` and `GET /api/feedback/queue`. Unset keeps both routes closed |
| `STRIPE_SECRET_KEY` | no | Omit and bookings stay pay-at-studio |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | no | Required only when the secret key is set |
| `STRIPE_WEBHOOK_SECRET` | no | Signing secret for `POST /api/webhooks/stripe` |
| `TRUSTED_PROXY_CIDRS` | no | Extra proxy CIDRs for auth rate limits. Private ranges are already trusted, so App Runner's `X-Forwarded-For` chain resolves to the client |
| `RUN_MIGRATIONS` | no | `1` (default) migrates on container start. `0` skips that and you run the one-off command |
| `CRON_SECRET` | yes in production | Bearer token for `GET` or `POST /api/cron/tick`. Unset, the route returns 401 |
| `SMS_PROVIDER` | no | `aws` (default), `twilio`, or `telnyx`. Inert until that provider's variables are set |
| `AWS_SMS_ORIGINATION_IDENTITY` | with AWS SMS | Phone number, pool, or sender id for End User Messaging |
| `AWS_SMS_CONFIGURATION_SET` | no | Optional Pinpoint SMS configuration set |
| `TWILIO_ACCOUNT_SID` | with Twilio | Account SID. Also needs the auth token and from-number |
| `TWILIO_AUTH_TOKEN` | with Twilio | Pair to the account |
| `TWILIO_FROM_NUMBER` | with Twilio | Sender number, E.164 |
| `TELNYX_API_KEY` | with Telnyx | API key |
| `TELNYX_FROM_NUMBER` | with Telnyx | Sender number |
| `SMS_WEBHOOK_SECRET` | with texts | Bearer token, or `?token=`, for `POST /api/webhooks/sms` |
| `IMESSAGE_PROVIDER` | no | `off` (default), `sendblue`, or `loopmessage` |
| `SENDBLUE_API_KEY` | with Sendblue | With `SENDBLUE_API_SECRET` and `SENDBLUE_FROM_NUMBER` |
| `LOOPMESSAGE_API_KEY` | with LoopMessage | With `LOOPMESSAGE_SENDER` |
| `SHORT_LINK_DOMAIN` | no | Origin for text links. Defaults to `APP_URL` plus `/go/<code>` |
| `SES_CONFIGURATION_SET` | no | Added as `X-SES-CONFIGURATION-SET` on outbound mail |
| `SES_WEBHOOK_SECRET` | with SES feedback | Bearer token, or `?token=`, for `POST /api/webhooks/ses` |
| `VAPID_PUBLIC_KEY` | no | Web push stays off until both VAPID keys are set and the admin flag is on |
| `VAPID_PRIVATE_KEY` | no | Pair to the public key |
| `POSTHOG_KEY` | no | First-party events always stay in Postgres. PostHog gets a copy only when this is set and the visitor accepted cookies |
| `POSTHOG_HOST` | no | PostHog capture host. Defaults to `https://us.i.posthog.com` |

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are optional. When they are unset, S3 presigned uploads and SES use the instance role. The browser receives a presigned PUT URL, never the role credentials.

## IAM

Instance role:

- `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/*`
- `ses:SendRawEmail` on the verified identity
- `sms-voice:SendTextMessage` when texts use AWS End User Messaging

Bucket CORS must allow `PUT` from `APP_URL`.

RDS security group allows 5432 from the App Runner VPC connector.

## Scheduled work

App Runner does not run cron itself. Amazon EventBridge Scheduler calls the app on a one-minute rate:

- Target: `https://<your-domain>/api/cron/tick`
- Method: `POST`
- Header: `Authorization: Bearer <CRON_SECRET>`

That tick claims queued jobs with `FOR UPDATE SKIP LOCKED`, sends due notifications, queues class reminders 24 hours and 2 hours before start, queues review asks, win-back notes, membership notices, and the Monday teacher summary, and escalates support tickets that sat with a teacher for 24 hours. A replay of the same reminder does not send a second message.

## Email authentication

Verify the sending domain in SES, then publish:

- SPF: `v=spf1 include:amazonses.com -all`
- DKIM: the three CNAME records SES shows for the identity
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain`

Create an SES configuration set and set `SES_CONFIGURATION_SET`. Point its bounce and complaint topics at `https://<your-domain>/api/webhooks/ses?token=<SES_WEBHOOK_SECRET>`. A permanent bounce or a complaint sets `email_suppressed` on that address, and later mail to it is skipped.

## Text messages

AWS End User Messaging (Pinpoint SMS v2) is the default because it lives in the same account as App Runner. Twilio and Telnyx are drop-in alternates. Nothing sends until the provider variables are set.

Register A2P 10DLC before production traffic in the US:

1. Register the brand (the legal entity) in AWS End User Messaging or the provider console.
2. Register a campaign whose use case is account notifications, with the sample messages for the 2-hour reminder, a same-day cancellation, and a waitlist spot.
3. Attach the origination number or pool and put its id in `AWS_SMS_ORIGINATION_IDENTITY`.
4. Point inbound messages at `POST /api/webhooks/sms?token=<SMS_WEBHOOK_SECRET>` so STOP, HELP, and START update the opt-out list.

By default, texts go only for a reminder 2 hours before class, a cancellation on the same day, and a waitlist spot that opened. Everything else is email. A person must check the SMS box at signup or checkout first. Quiet hours are 9pm–8am Pacific. The monthly cap defaults to $50 at one cent per segment and is an admin setting.

iMessage is off until `IMESSAGE_PROVIDER` is `sendblue` or `loopmessage` and an admin turns the platform flag on. The app asks the provider whether the number can take iMessage and sends blue when it can. If that send fails, the same text goes by SMS. These are third-party APIs, not Apple Messages for Business. Apple’s terms and deliverability can change, and a number can be filtered. Messages for Business is customer-initiated, so it cannot send these alerts.

## Staging and production

Use two App Runner services and two RDS instances. Staging and production do not share `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, or Stripe keys. Staging uses Stripe test keys. Production uses live keys. `APP_URL` is the public origin of that environment.

Turn on automated RDS backups (a 7-day retention is a sound start) and confirm a restore once before launch. Point-in-time recovery covers a bad migration.

Server actions are same-origin. Next.js rejects a cross-site post, which is the CSRF check for forms. Booking, refund, and support actions also stop after a burst of requests from the same account.

`SENTRY_DSN` is optional. When it is unset, errors are written as JSON logs and nothing is sent to Sentry.

`POSTHOG_KEY` is optional. Page views, funnels, and experiment exposures are stored in `analytics_events` either way. PostHog is skipped until the key is set and `bc_cookie` is `1`.

Student iOS and Android apps call the same services through `GET` and `POST /api/v1`. The contract is `docs/openapi.yaml`. A bearer token from `POST /api/v1/auth/sign-in` lasts 30 days. Teachers stay on the web.

GitHub Actions runs lint, typecheck, tests, migrations, and a production build on every pull request.

## What the health check covers

`GET /api/health` runs `select 1` and returns 200 `{ "ok": true }`. A database failure returns 503.
