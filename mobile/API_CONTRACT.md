# Student API

Source of truth: [`docs/openapi.yaml`](../docs/openapi.yaml), served at `/api/v1` by `lib/mobile-api.ts`. This note only records how the app uses that contract and where the payload is thinner than the screens.

Authenticated calls send `Authorization: Bearer bc_…`. Tokens last 30 days. Send `X-Platform: ios|android|web`. Errors are `{ "error": "string" }` plus an HTTP status. The route echoes the request `Origin` so the Expo web preview can call it. Native apps are not subject to that browser check.

## Auth

- `POST /auth/sign-in` `{ email, password, anonymousId }` → `{ token, user }`
- `POST /auth/sign-up` `{ email, password, name, phone, smsOptIn, marketingOptIn, anonymousId }` → `{ token, user }` immediately. There is no email-code step on this API.
- `POST /auth/sign-out` revokes the bearer token.
- `GET /auth/me` → `{ user: { id, name, email, roles } }`

Google and Apple sign-in are not on this API. Password reset stays on the website.

## Catalog

- `GET /explore?q&category&vertical&level&format` → `{ classes: PublicClass[] }`
- `GET /search?q&vertical` → `{ classes, services }`
- `GET /classes/{slug}` → `{ class, description, slots, teacher }`
- `GET /classes/slots?slug=` (auth) → `{ slots }`
- `GET /teachers/{slug}` → `{ teacher: { slug, name, bio }, classes: [{ id, slug, title }] }`

`PublicClass` is `{ id, slug, title, priceCents, delivery, teacher, teacherSlug, category, vertical, nextStartsAt, spots }`.

Date, max price, and “free” filters run on the device from those fields. The list does not include neighborhood or map coordinates, so the map view says so. The teacher payload does not include pack or membership ids.

## Booking and money

`POST /bookings` `{ sessionId, classId, series, code, payWith, policyAccepted, paymentSheet }`.

`payWith` is `cash`, `pack:<id>`, or `membership:<id>`. There is no separate quote call. The order response includes `listPriceCents`, `discountCents`, `studentPaysCents`, and `codeApplied` so checkout can show price, promo discount, and total.

- `paymentSheet: true` and a card charge return `{ orderId, clientSecret, publishableKey, …price }`. The app opens PaymentSheet with the client secret. The webhook marks the order paid. The app does not confirm the PaymentIntent itself.
- A Checkout Session returns `{ orderId, checkoutUrl, …price }`. Memberships always do this, because they renew. Packs do this only when `paymentSheet` is not set.
- No Stripe, or a zero total, returns `{ orderId, …price }` and the seat is already booked (pay at the studio, or nothing due).

On iOS and Android the API points Checkout `success_url` and `cancel_url` at `/mobile/return`, which redirects to `becreative://bookings`. The app opens `checkoutUrl` with `expo-web-browser` (`openAuthSessionAsync`) and treats that deep link as the return. On web, the session completes when the browser reaches `{API_URL}/bookings`.

Waiver text is `GET /waivers/{teacherSlug}` → `{ body, version, signed }`. Sign with `POST /waivers/{teacherSlug}/sign` `{ signedName }`. Booking also sends `policyAccepted: true`. If the teacher has no waiver, the app still asks the student to accept the cancellation policy and does not call sign.

`GET /bookings` → `{ bookings: [{ id, status, title, slug, createdAt }] }`. Cancel is `POST /bookings/{id}/cancel` → `{ ok, outcome, feeCents }`. Reschedule is `POST /bookings/{id}/reschedule` `{ sessionId }`.

## Wallet, inbox, help

- `GET /wallet` → `{ packs: [{ id, name, remaining, total }], memberships: [{ id, name, status, periodEnd }] }`
- `POST /packs/purchase` and `POST /memberships/purchase` `{ id, code }`
- `GET /notifications`, `POST /notifications/read` `{ id }`
- `GET /preferences` and `PUT /preferences` for one event row plus `smsOptIn`, `marketingOptIn`, and `phone`
- `POST /push-tokens` `{ token, platform, provider: expo|apns|fcm }`, `DELETE /push-tokens` `{ token }`
- `GET /help` and `GET /help/{slug}`
- `GET /tickets`, `POST /tickets` `{ category, subject, body, teacherId, bookingId }` → `{ id }`

Account deletion is not on this API. The profile screen files a ticket. The website Privacy page deletes the account.

## Events and experiments

`POST /track` `{ name, anonymousId, path, platform, consent, properties }`. `name` must be one of the OpenAPI enum values. Property values are strings. The app drops names that are not in that list.

`GET /experiments/{key}?subject=` → `{ key, variant, payload, goalEvent, status }`. The app asks for `class_cta` and uses `payload.label` on the class button.

## Mock mode

`EXPO_PUBLIC_API_MODE=mock` forces fixtures. Otherwise a set `EXPO_PUBLIC_API_URL` uses this API. With neither, tests and local demos stay on fixtures.
