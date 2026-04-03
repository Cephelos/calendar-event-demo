# Calendar Event Demo

Demo app for the embedded calendar architecture:

- `calendar-module` scheduled events (schedule first, then content slots)
- composable event content modules (notification + module-picker examples)
- notification host integration that merges dispatches from scheduled-event notification slots (and related content modules)

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

## Create a handoff zip (with local file deps)

The demo depends on sibling folders via `file:../...` packages.  
Use this script to produce a shareable zip that keeps the needed folder layout:

```bash
bash scripts/create-handoff-zip.sh
```

It creates:

- `handoff-calendar-event-demo-<timestamp>/` (folder copy)
- `handoff-calendar-event-demo-<timestamp>.zip` (archive)

By default it includes:

- `calendar-event-demo`
- `calendar-module`
- `module-picker`
- `notification-modules`

Update `DEPENDENT_DIRS` in `scripts/create-handoff-zip.sh` whenever the demo gains new sibling dependencies.

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

- The demo references local workspace packages via `file:` dependencies (`@enhearten/calendar-module`, `@enhearten/module-picker`, `@enhearten/notification-modules-*`), so CI assumes those package directories are committed in this repository context.
- If you later split this into a true multi-repo setup, switch to published package versions or a workspace/monorepo build strategy for CI.
