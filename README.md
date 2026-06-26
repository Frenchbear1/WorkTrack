# WorkTrack

Mobile-first iPhone PWA for job logging, presets, unpaid totals, and paid receipt tracking.

## Run locally

```bash
npm install
npm run dev
```

If Firebase env values are not configured, the app opens in local preview mode and stores data in this browser only.

## Firebase setup

1. Create a Firebase web app.
2. Enable Authentication > Google.
3. Create a Firestore database.
4. Add your local and deployed domains to Authentication > Authorized domains.
5. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
6. Deploy the rules from `firestore.rules`.
7. For GitHub Pages, add `frenchbear1.github.io` to Authentication > Settings > Authorized domains.

User data is stored under `/users/{uid}`, and the included rules only allow each signed-in user to read and write their own documents.

## GitHub Pages

The deployment workflow builds with `VITE_BASE_PATH=/WorkTrack/`, so the hosted app URL is:

```txt
https://frenchbear1.github.io/WorkTrack/
```

## Scripts

```bash
npm run dev
npm run build
npm test
npm run lint
```

`npm run lint` uses oxlint. If Windows Application Control blocks the native oxlint binding, the app can still be checked with `npm run build` and `npm test`.
