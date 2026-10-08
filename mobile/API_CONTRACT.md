# BeCreative mobile API contract

The student app in `mobile/` calls these endpoints on the same origin as the website. Nothing in this document is implemented on the server yet. Mock mode (the default) implements the shapes below so the app runs before `/api/v1` exists.

Base URL: `{APP_ORIGIN}/api/v1` (`EXPO_PUBLIC_API_URL`, default `http://localhost:3000`).

Conventions:

- JSON in and out. `Content-Type: application/json`. `Accept: application/json`.
- Authenticated calls send `Authorization: Bearer <token>`. Mobile sessions are bearer tokens, not the website's cookies.
- Clients send `X-BeCreative-Client: mobile`.
- Money is integer USD cents. Timestamps are ISO-8601. Ids are strings.
- Writes that charge a card accept an `Idempotency-Key` header.
- Errors are HTTP 4xx/5xx with `{ "error": { "code": "unauthorized", "message": "Email or password is wrong." } }`.
- Codes the app branches on: `unauthorized`, `unverified`, `validation`, `not_found`, `conflict`, `waiver_required`, `policy`, `promo_invalid`, `request_failed`.
- This API is student-only. Do not expose teacher, admin, CRM, or studio tools here.
- Field names that already exist on Drizzle rows (`classes`, `teachers`, `orders`, `categories`) use those names. The app imports those row types and will fail typecheck if they drift.

Platform fee for quotes matches `platform_settings`: percent plus optional fixed cents. The shared `quotePrice` helper in `lib/pricing.ts` is the pricing source of truth (one code, first class free beats a code, credits beat a code, series is not paid with a pack credit).

## Catalog

`GET /api/v1/catalog`

```json
{
  "categories": [{ "id": "cat-acting", "slug": "acting", "name": "Acting", "parentId": null, "vertical": "creative" }],
  "neighborhoods": [{ "name": "Silver Lake", "lat": 34.0869, "lng": -118.2702 }],
  "feePercent": 10,
  "feeFixedCents": 0
}
```

`vertical` is `creative` or `wellness`. Creative chips the app expects: acting, comedy, music, dance, art, dj, photo. Wellness (BeWell): yoga, sound-baths, massage, meditation, sauna, cold-plunge, stretching. Unknown categories still render.

`GET /api/v1/explore`

Query: `q`, `category` (slug), `vertical`, `date` (`YYYY-MM-DD` in America/Los_Angeles), `maxPriceCents`, `neighborhood`, `free` (`true`/`false`), `firstClassFree`, `lat`, `lng`, `miles`.

When both `free` and `firstClassFree` are true, match classes that are free **or** first-class-free. Virtual classes stay in distance filters. Response:

```json
{ "classes": [ClassCard], "nextCursor": null }
```

`ClassCard`: `id`, `slug`, `title`, `teacherName`, `teacherSlug`, `vertical`, `categorySlug`, `categoryName`, `neighborhood`, `lat`, `lng`, `delivery`, `format`, `skillLevel`, `durationMinutes`, `pricePerSessionCents`, `pricePerSeriesCents`, `firstClassFree`, `nextStartsAt`, `offeringKind` (`class` | `appointment` | `capacity`), `coverHue`.

## Class and teacher

`GET /api/v1/classes/:slug`

`ClassDetail` is the class row fields the app reads (`id`, `slug`, `title`, `description`, `outcomes`, `prerequisites`, `whatToBring`, `skillLevel`, `format`, `delivery`, `durationMinutes`, `maxSize`, `pricePerSessionCents`, `pricePerSeriesCents`, `seriesBookingEnabled`, `firstClassFree`) plus:

- `vertical`, `offeringKind`, `categorySlug`, `categoryName`, `coverHue`
- `teacher`: `id`, `slug`, `studioName`, `bio`, `specialties`, `instagram`, `website`, `neighborhood`
- `location`: `{ neighborhood, city, lat, lng, addressLine1 }` or null
- `sessions`: `{ id, startsAt, endsAt, localDate, status, capacity, confirmedCount }` for ordinary classes
- `slots`: `{ id, startsAt, endsAt, remaining, priceCents }` for appointments and capacity (sauna, plunge)
- `addons`: `{ id, name, priceCents, minutes }` (massage)
- `waiver`: `{ required, title, body }`
- `reviews`: `{ id, rating, body, author }`
- `packs`, `memberships` offered by that teacher
- `introAlreadyUsed` for the signed-in student, else false

`GET /api/v1/teachers/:slug` returns `studioName`, `bio`, `slug`, `vertical`, `neighborhood`, `classes` (cards), `packs`, `memberships`.

Share URLs the app opens, and that the site already has:

- `/c/:slug`
- `/t/:slug`
- `/t/:slug/bio`
- `/t/:slug/p/:packSlug`
- `/t/:slug/m/:membershipSlug`
- `/reset?token=`
- `/verify-email?token=&email=`

Promo links are those URLs plus `code`, and may include `ref`, `session`, `utm_source`, `utm_medium`, `utm_campaign`. The app parses them locally and sends `promoCode` on quote and booking.

## Auth

`POST /api/v1/auth/signup` `{ name, email, password }` → `{ verificationRequired: true, user }`

`POST /api/v1/auth/login` `{ email, password }` → `{ token, expiresAt, user }`

`POST /api/v1/auth/google` `{ idToken }` → session

`POST /api/v1/auth/apple` `{ idToken, nonce, fullName: { givenName, familyName } | null }` → session

`POST /api/v1/auth/verify` `{ email?, code?, token? }` → session

`POST /api/v1/auth/resend-verification` `{ email }` → `{ sent: true }`

`POST /api/v1/auth/forgot` `{ email }` → `{ sent: true }` always, so the response does not reveal accounts

`POST /api/v1/auth/reset` `{ token, password }` → `{ reset: true }`

`POST /api/v1/auth/logout` → `{ ok: true }` and the bearer token stops working

`GET /api/v1/me` → user

`PATCH /api/v1/me` `{ name?, phone?, smsOptIn? }` → user. Opting into SMS without a phone is `validation`.

`DELETE /api/v1/me` `{ confirm: "DELETE" }` → `{ deleted: true }`. This is the in-app account deletion Apple requires.

User: `{ id, name, email, emailVerified, phone, smsOptIn, imageUrl }`.

Unverified password login returns `403` `unverified`.

## Quote and booking

`POST /api/v1/quotes`

```json
{
  "classSlug": "scene-study",
  "kind": "session",
  "sessionId": "sess-1",
  "slotId": null,
  "addonIds": [],
  "partySize": 1,
  "promoCode": "BECREATIVE15",
  "usePackId": null,
  "useMembershipId": null
}
```

`kind` is `session`, `series`, `appointment`, or `capacity`.

Response:

```json
{
  "label": "This date",
  "listPriceCents": 3600,
  "quote": {
    "listPriceCents": 3600,
    "discountCents": 540,
    "studentPaysCents": 3060,
    "platformFeeCents": 0,
    "teacherAmountCents": 3240,
    "platformFundedCents": 540,
    "teacherFundedCents": 0,
    "platformLiabilityCents": 180,
    "codeApplied": "BECREATIVE15",
    "codeError": null,
    "paymentPath": "cash"
  }
}
```

`paymentPath` is `cash`, `entitlement`, `first_class_free`, or `free`. A bad code is still HTTP 200 with `codeError` set and the undiscounted price, unless the request itself is invalid (missing class → 404, full session → 409 `conflict`).

Rules:

- One promo code.
- First class free is one intro per student per teacher, only on a single session, and it beats a code.
- Pack credits and membership credits do not pay a series price and do not stack with a code.
- Appointment price is the slot plus selected add-ons. Capacity price is per person times `partySize`, and fails when `remaining` is too small.
- Series price is `pricePerSeriesCents`, not the sum of dates. Every upcoming scheduled session needs an open seat.

`POST /api/v1/bookings` with the quote body plus:

```json
{ "waiver": { "agreed": true, "signedName": "Sam Rivera" } }
```

The signed name must match the account name. Missing waiver → `422` `waiver_required`.

Response `{ booking, order }`.

Booking: `{ id, classSlug, classTitle, teacherName, kind, status, startsAt, endsAt, location, sessionId, slotId, partySize, orderId }`. `status` is `pending`, `confirmed`, `waitlisted`, or `cancelled`.

Order: money fields from the quote, plus `id`, `bookingId`, `classTitle`, `kind`, `promoCode`, `status` (`pending`, `paid`, `cancelled`), `createdAt`, and `payment`.

`payment` is null when nothing is due. Otherwise it is what Stripe PaymentSheet needs:

```json
{
  "paymentIntentClientSecret": "pi_secret",
  "customerId": "cus_",
  "customerEphemeralKeySecret": "ek_",
  "merchantDisplayName": "BeCreative",
  "publishableKey": "pk_live_or_test",
  "merchantCountryCode": "US",
  "applePayMerchantId": "merchant.com.becreative.students",
  "googlePayTestEnv": false
}
```

The app calls `initPaymentSheet` with Apple Pay and Google Pay enabled. Real-world classes and wellness sessions are outside Apple in-app purchase. Do not return a Checkout Session URL.

`POST /api/v1/orders/:id/confirm` `{ paymentIntentId }` verifies the PaymentIntent with Stripe, marks the order paid, and confirms the booking. Repeat calls return the paid order.

`GET /api/v1/orders/:id`

`GET /api/v1/bookings` → `{ bookings: Booking[] }`

`GET /api/v1/bookings/:id`

`POST /api/v1/bookings/:id/cancel` → `{ booking, refund, message }`

`refund` is `full`, `credit`, or `none`.

- More than 24 hours before start: full refund.
- 2 to 24 hours: account credit, no card refund.
- Under 2 hours, before start: seat released, no refund.
- After start: `409` `policy`.
- Waitlist and unpaid holds cancel with `none`.
- A series cancel drops every remaining date and is not prorated. Say so in `message`.

`POST /api/v1/bookings/:id/reschedule` `{ sessionId }` or `{ slotId }`

Reschedule is for a confirmed session, appointment, or capacity booking, and it closes 12 hours before the current start. Series bookings cannot move one date. The new time must be open.

## Wallet

`GET /api/v1/wallet`

```json
{
  "packs": [{ "id": "purchase-scene-5", "packId": "pack-scene-5", "name": "5-class pack", "teacherName": "Maya Alvarez", "creditsTotal": 5, "creditsRemaining": 3, "expiresAt": "2026-12-01T00:00:00.000Z", "classSlugs": ["scene-study"], "categorySlugs": ["acting"] }],
  "memberships": [{ "id": "sub-bewell", "membershipId": "mem-bewell", "name": "BeWell monthly", "teacherName": "Lena Ortiz", "status": "active", "currentPeriodEnd": "2026-11-01T00:00:00.000Z", "classesPerPeriod": 4, "classesUsedThisPeriod": 1, "unlimited": false, "classSlugs": ["sunrise-flow"], "categorySlugs": ["yoga"] }],
  "ledger": [{ "id": "led-1", "direction": "credit", "sourceType": "pack", "label": "Restored 1 credit after a cancel", "createdAt": "2026-10-01T00:00:00.000Z" }]
}
```

## Push, notifications, help

`POST /api/v1/push-tokens` `{ expoPushToken, platform }` where platform is `ios` or `android` and the token starts with `ExponentPushToken`.

`DELETE /api/v1/push-tokens` `{ token }`

`GET /api/v1/notifications` → `{ items: [{ id, title, body, read, createdAt, href }] }`

`POST /api/v1/notifications/:id/read`

`GET /api/v1/notification-preferences` and `PATCH` with any of `{ pushBookings, pushReminders, pushMarketing, smsOptIn }`. Marketing defaults off.

`GET /api/v1/faq` → `{ items: [{ id, question, answer }] }`

`GET /api/v1/bookings/:id/help` → `{ actions: [{ id, label, enabled, detail }] }`

Action ids: `cancel`, `reschedule`, `waiver_copy`, `ask_teacher`, `safety`. `enabled` follows the cancel and reschedule policy. Safety is always enabled.

`GET /api/v1/support-tickets`

`POST /api/v1/support-tickets` `{ bookingId, subject, body }` → `{ id, bookingId, subject, body, status, createdAt }` with status `open`.

## Analytics

`POST /api/v1/track` accepts a bearer token when the student is signed in, and also accepts anonymous events.

```json
{
  "event": "class_view",
  "platform": "ios",
  "occurredAt": "2026-10-08T18:00:00.000Z",
  "anonymousId": "anon-1",
  "userId": "user-student",
  "properties": { "slug": "scene-study" }
}
```

`platform` is only `ios` or `android`. `properties` values are strings, numbers, booleans, or null. Respond `{ accepted: true }`.

Events the app sends: `screen_view`, `explore_search`, `vertical_selected`, `class_view`, `booking_started`, `checkout_started`, `checkout_completed`, `booking_cancelled`, `booking_rescheduled`, `push_permission`, `login`.

`GET /api/v1/experiments` → `{ assignments: [{ key, variant }] }`

The app reads `explore_density` (`comfortable` or `compact`). Unknown keys are ignored.

## Mock preview

Until this contract is live, the app stays in mock mode. Demo student: `student@becreative.demo` / `DemoPass123!`. Verification code `123456`. Demo reset token `reset-demo`. Google and Apple buttons accept any non-empty token and sign in that student. Set `EXPO_PUBLIC_API_MODE=live` to use the server.
