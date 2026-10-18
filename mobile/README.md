# BeCreative student app

iOS and Android app for students. Teachers stay on the website. The app shares the website's backend once `/api/v1` exists. Until that ships, it runs on fixtures in mock mode, which is the default.

The API the app expects is written down in [API_CONTRACT.md](./API_CONTRACT.md). Do not invent a second client. The typed client is `src/api`.

## Run it

```bash
cd mobile
npm install
npm test
npm run typecheck
npx expo start
```

Press `w` for the web preview, `i` for the iOS simulator (Mac), or `a` for Android. The preview signs in with **Continue with demo student** (`student@becreative.demo` / `DemoPass123!`).

Mock mode is on unless you set:

```bash
EXPO_PUBLIC_API_MODE=live
EXPO_PUBLIC_API_URL=https://your-domain.example
```

Copy `.env.example` to `.env` when you have store and Stripe values. Expo reads `EXPO_PUBLIC_*` at bundle time.

## Tests

```bash
npm test
```

Vitest covers the API client (mock fixtures and the live client's paths, bearer header, and error codes), booking flow (dates, series, add-ons, sauna capacity, promos, waiver, cancel and reschedule policy), and deep-link parsing.

## Identifiers

| | Default | Override |
| --- | --- | --- |
| iOS bundle id | `com.becreative.students` | `IOS_BUNDLE_ID` |
| Android package | `com.becreative.students` | `ANDROID_PACKAGE` |
| URL scheme | `becreative://` | |
| Universal link host | `classes.becreative.app` | `LINK_HOST` |
| Apple Pay merchant id | `merchant.com.becreative.students` | `APPLE_MERCHANT_ID` |
| EAS project id | placeholder | `EAS_PROJECT_ID` |

Change these before the first store upload if Eric already owns different ids. Bundle ids cannot be renamed after the first upload.

## EAS build and release

Install the EAS CLI once (`npm install -g eas-cli`) and log in with the Expo account that owns the project.

```bash
cd mobile
eas init
eas credentials
eas build --profile preview --platform all
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Profiles live in `eas.json`.

- `development` is a dev client, including the iOS simulator.
- `preview` is an internal install for TestFlight-style checks and Play internal testing.
- `production` auto-increments the build number and is what you submit.

`eas credentials` is where push keys are created and stored. You do not commit the APNs key or the FCM service account.

- iOS push: let EAS create an Apple Push Notifications key on the team. The app uses Expo push tokens (`ExponentPushToken[...]`), registered at `POST /api/v1/push-tokens`.
- Android push: FCM v1. Download the Firebase service account when EAS asks, or upload the `google-services.json` EAS stores for the package name.
- After the first production build, `eas credentials` shows the SHA-256 fingerprints. Put those in `well-known/assetlinks.json`.

App Store Connect and Play Console still need a human for the first app record, tax, banking, and the age-rating questionnaire.

## Deep links the website must serve

The app claims `https://<LINK_HOST>/c/...`, `/t/...` (including `/bio`, `/p/:pack`, `/m/:membership`), `/reset`, and `/verify-email`, plus `becreative://` copies of those paths. Promo links are the same paths with `?code=`.

Host these two files on the website origin. This branch does not change the Next.js app. The web launch needs to serve them before universal links and Android App Links verify.

- `https://<host>/.well-known/apple-app-site-association` (no file extension, `Content-Type: application/json`)
- `https://<host>/.well-known/assetlinks.json`

Sources are in `mobile/well-known/`. Replace `TEAMID` with the Apple Team ID and the SHA-256 placeholder with the fingerprint from EAS. Associated domains and the Android intent filter already use `LINK_HOST`.

## What Eric needs to provide

1. Apple Developer Program membership, Team ID, and an App Store Connect app for `com.becreative.students` (or the bundle id he prefers).
2. Sign in with Apple turned on for that App ID. A Services ID and key if Android should use Apple too. Google is offered, so Apple is required on iOS.
3. Google Play Console account, the app record, and the same package name.
4. Google Cloud OAuth client ids: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
5. An Expo account (`EXPO_OWNER`) and a real `EAS_PROJECT_ID` from `eas init`.
6. Push credentials through `eas credentials` (APNs key and FCM v1). No cert files belong in git.
7. Stripe publishable key `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, an Apple Pay merchant id, and the merchant id registered in the Apple Developer account and Stripe dashboard. The secret key stays on the server.
8. The public site origin for `EXPO_PUBLIC_API_URL` and `LINK_HOST`, and the two `.well-known` files above once the Team ID and SHA-256 exist.
9. Privacy policy URL and support URL for the store listings.
10. A decision on the final bundle id before the first upload.

The website admin seed already treats `eric.leino@gmail.com` as an admin. That account is not a student login. Use the demo student above, or a real student account, in the app.

## App Review notes worth pasting

Students pay independent teachers for in-person classes and wellness sessions (yoga, massage, sauna, and the rest). Those are real-world services, so checkout is Stripe PaymentSheet with Apple Pay and Google Pay, not in-app purchase. Account deletion is under You. Sign in with Apple is on the sign-in screen next to Google. The app has no teacher tools.

## Design

Warm paper and ink, Fraunces headlines, a purple accent. BeWell switches the chrome to a calmer green when the wellness toggle or a wellness class is open. Dark mode follows the system, with a manual override on You. Tap targets are at least 44 points, and controls have screen-reader labels.
