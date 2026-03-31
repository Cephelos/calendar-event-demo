# Calendar Event Demo

Demo app for the embedded calendar architecture:

- `calendar-module` scheduled events (schedule first, then content slots)
- composable event content modules (notification + module-picker examples)
- notification host integration that merges dispatches from event-module events and scheduled-event notification slots

## Run locally

Install dependencies:

```bash
npm install
```

Start web dev server:

```bash
npm run web
```

Other targets:

```bash
npm run ios
npm run android
```

## Build static web output

```bash
npm run build:web
```

Build output is written to `dist/`.

## GitHub Pages deployment

This repo is configured with a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that:

1. runs on pushes to `main` (or manually),
2. builds the Expo web export (`npm run build:web`),
3. deploys `dist/` to GitHub Pages.

### One-time setup in GitHub

In repository settings:

1. Go to **Settings -> Pages**.
2. Set **Source** to **GitHub Actions**.
3. Save.

After that, each push to `main` deploys automatically.

Expected site URL:

- <https://cephelos.github.io/calendar-event-demo/>

## Notes

- The demo references local workspace packages via `file:` dependencies (`@enhearten/calendar-module`, `@enhearten/event-module`, etc.), so CI assumes those package directories are committed in this repository context.
- If you later split this into a true multi-repo setup, switch to published package versions or a workspace/monorepo build strategy for CI.
