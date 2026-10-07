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
| `STRIPE_SECRET_KEY` | no | Omit and bookings stay pay-at-studio |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | no | Required only when the secret key is set |
| `STRIPE_WEBHOOK_SECRET` | no | Signing secret for `POST /api/webhooks/stripe` |
| `TRUSTED_PROXY_CIDRS` | no | Extra proxy CIDRs for auth rate limits. Private ranges are already trusted, so App Runner's `X-Forwarded-For` chain resolves to the client |
| `RUN_MIGRATIONS` | no | `1` (default) migrates on container start. `0` skips that and you run the one-off command |

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are optional. When they are unset, S3 presigned uploads and SES use the instance role. The browser receives a presigned PUT URL, never the role credentials.

## IAM

Instance role:

- `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/*`
- `ses:SendEmail` on the verified identity

Bucket CORS must allow `PUT` from `APP_URL`.

RDS security group allows 5432 from the App Runner VPC connector.

## What the health check covers

`GET /api/health` runs `select 1` and returns 200 `{ "ok": true }`. A database failure returns 503.
