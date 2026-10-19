# Student API

Source of truth: [`docs/openapi.yaml`](../docs/openapi.yaml) 1.1.0, served at `/api/v1` by `lib/mobile-api.ts`. This note records how the app uses that contract.

Authenticated calls send `Authorization: Bearer bc_…`. Tokens last 30 days. Send `X-Platform: ios|android|web`. Errors are `{ "error": "string" }` plus an HTTP status. The route echoes the request `Origin` so the Expo web preview can call it. Native apps are not subject to that browser check.

## Auth

- `POST /auth/sign-in` `{ email, password, anonymousId }` → `{ token, user }`
- `POST /auth/sign-up` `{ email, password, name, phone, smsOptIn, marketingOptIn, anonymousId }` → `{ token, user }` immediately. A verification email can still be sent afterwards.
- `POST /auth/social` `{ provider: apple|google, idToken, nonce, firstName, lastName, anonymousId }` → `{ token, user }`. The app sends the native identity token and the raw nonce. Apple receives the SHA-256 nonce; the API accepts the raw value or that digest. `503` means that provider is not configured. The sign-in screen shows that message and keeps email sign-in available.
- `POST /auth/password/request` `{ email }` → `{ ok: true }` even when no account exists. The email link is `/reset?token=`.
- `POST /auth/password/confirm` `{ token, password }` → `{ ok: true }`.
- `POST /auth/email/request` `{ email }` → `{ ok: true }`. The website redirects to `/verify`. The app also accepts the older `/verify-email` link.
- `POST /auth/email/confirm` `{ token }` → `{ ok: true }`.
- `POST /auth/sign-out` revokes the bearer token.
- `GET /auth/me` → `{ user: { id, name, email, roles } }`
- `DELETE /me` `{ password }` or `{ provider, idToken, nonce }` → `{ ok: true }`. Same deletion as the website. The app asks for the password or a fresh Apple or Google sign-in, confirms, then signs out.

## Catalog

- `GET /explore?q&category&vertical&level&format` → `{ classes: PublicClass[] }`
- `GET /search?q&vertical` → `{ classes, services }`
- `GET /classes/{slug}` → `{ class, description, slots, teacher }`
- `GET /classes/slots?slug=` (auth) → `{ slots }`
- `GET /teachers/{slug}` → `{ teacher, classes, packs, memberships }`
- Packs are `{ id, slug, name, priceCents, creditCount }`. Memberships are `{ id, slug, name, priceCents }`. The teacher screen sells them with those ids.

`PublicClass` is `{ id, slug, title, priceCents, delivery, teacher, teacherSlug, category, vertical, nextStartsAt, spots, lat, lng, neighborhood, location }`. `location` is `{ lat, lng, neighborhood, name, city }`. Virtual classes send null, and the map hides them.

Class detail adds `signatureRequired` and `policyAcknowledgementRequired`. The signature step is skipped when `signatureRequired` is false. The cancellation-policy checkbox stays, and booking still sends `policyAccepted: true`.

Date, max price, and “free” filters run on the device from those fields. The map pins in-person classes from `lat` and `lng`.

## Booking and money

`POST /bookings` `{ sessionId, classId, series, code, payWith, policyAccepted, paymentSheet }`.

`payWith` is `cash`, `pack:<id>`, or `membership:<id>`. There is no separate quote call. The order response includes `listPriceCents`, `discountCents`, `studentPaysCents`, and `codeApplied` so checkout can show price, promo discount, and total.

- `paymentSheet: true` and a card charge return `{ orderId, clientSecret, publishableKey, …price }`. The app opens PaymentSheet with the client secret. The webhook marks the order paid. The app does not confirm the PaymentIntent itself.
- A Checkout Session returns `{ orderId, checkoutUrl, …price }`. Memberships always do this, because they renew. Packs do this only when `paymentSheet` is not set.
- No Stripe, or a zero total, returns `{ orderId, …price }` and the seat is already booked (pay at the studio, or nothing due).

On iOS and Android the API points Checkout `success_url` and `cancel_url` at `/mobile/return`, which redirects to `becreative://bookings`. The app opens `checkoutUrl` with `expo-web-browser` (`openAuthSessionAsync`) and treats that deep link as the return. On web, the session completes when the browser reaches `{API_URL}/bookings`.

Waiver text is `GET /waivers/{teacherSlug}` → `{ body, version, signed, required, policyAcknowledgementRequired }`. `required` is false when the body is empty. Sign with `POST /waivers/{teacherSlug}/sign` `{ signedName }` only when a signature is required and not yet signed. Booking always sends `policyAccepted: true`.

`GET /bookings` → `{ bookings: [{ id, status, title, slug, createdAt, startsAt, endsAt, timezone, location }] }`. The list formats `startsAt` in `timezone` (the class zone, or `America/Los_Angeles`). `location` is null for a virtual class. Cancel is `POST /bookings/{id}/cancel` → `{ ok, outcome, feeCents }`. Reschedule is `POST /bookings/{id}/reschedule` `{ sessionId }`.

## Wallet, inbox, help

- `GET /wallet` → `{ packs: [{ id, name, remaining, total }], memberships: [{ id, name, status, periodEnd }] }`
- `POST /packs/purchase` and `POST /memberships/purchase` `{ id, code }`
- `GET /notifications`, `POST /notifications/read` `{ id }`
- `GET /preferences` and `PUT /preferences` for one event row plus `smsOptIn`, `marketingOptIn`, and `phone`
- `POST /push-tokens` `{ token, platform, provider: expo|apns|fcm }`, `DELETE /push-tokens` `{ token }`
- `GET /help` and `GET /help/{slug}`
- `GET /tickets`, `POST /tickets` `{ category, subject, body, teacherId, bookingId }` → `{ id }`

Account deletion is `DELETE /me` with the bearer token and a fresh password or Apple/Google identity token. The profile screen confirms, calls that route, and signs out.

## Events and experiments

`POST /track` `{ name, anonymousId, path, platform, consent, properties }`. `name` must be one of the OpenAPI enum values. Property values are strings. The app drops names that are not in that list.

`GET /experiments/{key}?subject=` → `{ key, variant, payload, goalEvent, status }`. The app asks for `class_cta` and uses `payload.label` on the class button.

## Mock mode

`EXPO_PUBLIC_API_MODE=mock` forces fixtures. Otherwise a set `EXPO_PUBLIC_API_URL` uses this API. With neither, tests and local demos stay on fixtures.
