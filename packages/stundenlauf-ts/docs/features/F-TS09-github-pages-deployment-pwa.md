# F-TS09: GitHub Pages Deployment and PWA

## Overview

- Feature ID: F-TS09
- Feature name: GitHub Pages deployment, Progressive Web App (PWA), CI/CD pipeline
- Owner: —
- Status: Planned
- Related requirement(s): R7 (portable data), R8 (German-language UI accessible to organizers)
- Related milestone(s): M-TS7
- Python predecessor(s): F22 (Windows PyInstaller packaging — eliminated; replaced entirely by this feature)

## Problem Statement

The Python version requires organizers to install a Windows-specific desktop app (PyInstaller bundle + Edge WebView2 runtime). This creates friction:

- **Distribution**: Every update requires downloading a new installer or portable ZIP from a GitHub release.
- **Platform lock-in**: Only Windows is supported; macOS/Linux organizers cannot use the app.
- **Runtime dependencies**: WebView2 must be present on the target machine.
- **Installation barrier**: Non-technical organizers must navigate installer wizards or extract ZIP archives.

The TS port eliminates all of this. The app is a static site served from GitHub Pages — organizers open a URL in any modern browser and the app is immediately available. A Progressive Web App (PWA) manifest and service worker add:

- **Offline capability**: The app works without an internet connection after the first visit, matching the desktop app's local-first promise.
- **Install-to-home-screen**: Organizers can "install" the PWA for a native-like experience (taskbar icon, standalone window, no browser chrome).
- **Automatic updates**: Service worker update flow ensures the latest version is picked up on the next visit.

A CI/CD pipeline automates the build → test → deploy cycle on every push to the main branch.

## Scope

### In Scope

- **Vite production build** configuration for static output targeting GitHub Pages.
- **GitHub Actions workflow** for automated build, test, lint, and deployment to GitHub Pages.
- **PWA manifest** (`manifest.json` / `manifest.webmanifest`) with German-language app metadata, icons, theme colors, and `display: standalone`.
- **Service worker** for offline caching of the app shell (HTML, CSS, JS, icons) using a cache-first strategy for static assets.
- **Service worker update flow**: detect new version → notify user → activate on next navigation (no silent forced reload).
- **App icons** in required PWA sizes (192×192, 512×512 PNG; maskable variant).
- **`<meta>` tags** for PWA: `theme-color`, `apple-mobile-web-app-capable`, viewport, description.
- **Base path configuration** for GitHub Pages subdirectory hosting (e.g., `/stundenlauf/`).
- **404 fallback** for SPA client-side routing (GitHub Pages `404.html` redirect trick, if needed by the router).
- **Environment-aware version string** injected at build time (git SHA or tag) for cache busting and the "About" display.
- **CI quality gates**: lint (ESLint + Prettier), type-check (`tsc --noEmit`), test (Vitest), build — all must pass before deployment.
- **Branch protection recommendation**: document that the `main` branch should require passing CI before merge.

### Out of Scope

- **Custom domain** setup (CNAME) — can be added by the repo owner at any time; no code change needed.
- **Server-side rendering (SSR)** — the app is fully static / client-rendered.
- **Backend or API deployment** — there is no backend.
- **Push notifications** — no server to send them; the app is single-user and local-first.
- **Background sync** — no server to sync with.
- **IndexedDB caching by the service worker** — IndexedDB is managed by the app itself (F-TS01); the service worker only caches static assets.
- **Desktop Electron/Tauri wrapper** — PWA is the distribution mechanism.
- **Automated end-to-end (E2E) browser tests** in CI (Playwright/Cypress) — deferred; manual smoke testing covers the initial release.
- **Analytics or telemetry** — local-first, no tracking.

## Acceptance Criteria

- [ ] `npm run build` (Vite) produces a `dist/` directory containing a fully functional static site.
- [ ] The built site works correctly when served from a subdirectory path (e.g., `/stundenlauf/`).
- [ ] Pushing to the `main` branch triggers the GitHub Actions workflow, which lints, type-checks, tests, builds, and deploys to GitHub Pages.
- [ ] The deployed site is accessible at `https://<owner>.github.io/stundenlauf/` (or equivalent).
- [ ] A `manifest.webmanifest` is served with correct `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `lang: de`, and icon references.
- [ ] The app is recognized as installable by Chrome, Edge, Firefox, and Safari (passes Lighthouse PWA installability checks).
- [ ] A service worker is registered and caches the app shell on first visit.
- [ ] After the initial visit, the app loads and functions fully offline (airplane mode / no network).
- [ ] When a new version is deployed, the service worker detects the update and the app displays a non-intrusive notification prompting the user to refresh.
- [ ] The user is never force-reloaded mid-session — update activation happens on the next navigation or explicit refresh.
- [ ] App icons (192×192, 512×512) render correctly in the browser install prompt and on mobile home screens.
- [ ] The CI workflow fails (blocks deployment) if any lint, type-check, or test step fails.
- [ ] A build-time version string (git SHA short or tag) is accessible in the app for display in an "About" section or footer.
- [ ] The deployed site returns correct `Content-Type` headers for all assets and passes basic Lighthouse performance/accessibility checks (score ≥ 90).
- [ ] Client-side routing (if used) works on GitHub Pages — direct URL access to any route does not produce a 404.

---

## Technical Plan

### 1. Vite Build Configuration

Vite is already the chosen build tool (PROJECT_PLAN.md). The production build needs:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/stundenlauf/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // ... see Section 4
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

**`base` path**: GitHub Pages serves repository sites at `/<repo-name>/`. All asset references must be relative to this base. Vite's `base` config handles this globally — all `import` paths, `<link>`, `<script>`, and asset URLs are rewritten.

**Source maps**: Enabled in production for debugging. They are served alongside the app but not loaded by browsers unless DevTools are open — no performance impact.

### 2. GitHub Actions Workflow

Replace the Python-only `windows-build.yml` (which fires on `v*` tags) with a new workflow for the TS port. The existing Windows workflow remains untouched — it serves the Python version and fires on different triggers.

```yaml
# .github/workflows/ts-deploy.yml
name: TS Port – Build & Deploy

on:
  push:
    branches: [main]
    paths:
      - 'packages/stundenlauf-ts/**'
      - '.github/workflows/ts-deploy.yml'
  pull_request:
    branches: [main]
    paths:
      - 'packages/stundenlauf-ts/**'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  quality:
    name: Lint, Type-check, Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/stundenlauf-ts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: packages/stundenlauf-ts/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --run

  build:
    name: Build
    needs: quality
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/stundenlauf-ts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: packages/stundenlauf-ts/package-lock.json
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/stundenlauf-ts/dist

  deploy:
    name: Deploy to GitHub Pages
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Key decisions:**

| Decision | Rationale |
|---|---|
| `paths` filter on `packages/stundenlauf-ts/**` | Avoids deploying on Python-only changes. |
| Quality gate runs before build | Fast feedback; build doesn't start unless code is clean. |
| `deploy` only on push to `main` | PRs run quality + build but do not deploy. |
| `concurrency: pages` with cancel-in-progress | Prevents racing deployments. |
| Node 22 | Current LTS; aligns with Vite/React ecosystem expectations. |

### 3. PWA Manifest

```json
{
  "name": "Stundenlauf-Auswertung",
  "short_name": "Stundenlauf",
  "description": "Auswertung und Verwaltung von Stundenlauf-Rennserien — lokal im Browser, ohne Server.",
  "lang": "de",
  "start_url": "/stundenlauf/",
  "scope": "/stundenlauf/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#1565C0",
  "background_color": "#FFFFFF",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "categories": ["sports", "utilities"]
}
```

**`theme_color`**: `#1565C0` (blue) — matches the Python version's header bar color and the Laufübersicht cover page year color.

**`background_color`**: `#FFFFFF` — white splash screen during app load, consistent with the app's light theme.

**Icon derivation**: The existing `assets/splash_tri_hgwaii.png` (used for the PyInstaller splash) can be adapted as the source for PWA icons. Alternatively, a simplified icon can be designed. The exact artwork is not a code concern — placeholder icons are sufficient for the initial implementation.

### 4. Service Worker (via vite-plugin-pwa)

Rather than hand-writing a service worker, use `vite-plugin-pwa` which wraps **Workbox** — the industry-standard service worker toolkit from Google. This provides:

- **Precaching** of all Vite-emitted assets (JS, CSS, HTML, icons) with content-hash-based cache keys.
- **Runtime caching** rules for any additional assets.
- **Update detection** and lifecycle management.
- **Prompt-based update flow** (not auto-update, which can disrupt active sessions).

```typescript
// vite-plugin-pwa configuration within vite.config.ts
VitePWA({
  registerType: 'prompt',
  includeAssets: ['icons/*.png'],
  manifest: {
    // ... manifest fields from Section 3 (or reference external manifest.webmanifest)
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    cleanupOutdatedCaches: true,
    clientsClaim: false,  // new SW waits until user confirms
    skipWaiting: false,   // user must accept update
  },
})
```

**`registerType: 'prompt'`** means the app controls when the new service worker activates. The update flow:

1. User visits the app. The browser checks for a new service worker in the background.
2. If a new SW is found, it installs and enters the `waiting` state.
3. The app detects the waiting SW (via `vite-plugin-pwa`'s `useRegisterSW` hook or event listener).
4. The app displays a toast/banner: *"Neue Version verfügbar. Jetzt aktualisieren?"* with an "Aktualisieren" button.
5. On click, the app sends `skipWaiting` to the waiting SW, which activates and takes control.
6. The app reloads to pick up new assets.

This avoids the disruptive pattern of silently reloading the page while the user is mid-workflow (e.g., reviewing matches or editing standings).

### 5. Update Notification UI

A minimal React component that listens for the `vite-plugin-pwa` update event:

```typescript
import { useRegisterSW } from 'virtual:pwa-register/react';

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-toast" role="alert">
      <span>Neue Version verfügbar.</span>
      <button onClick={() => updateServiceWorker(true)}>
        Aktualisieren
      </button>
    </div>
  );
}
```

Styled as a fixed-position toast at the bottom of the viewport. Non-blocking — the user can dismiss or ignore it and continue working.

### 6. SPA Routing on GitHub Pages

GitHub Pages does not natively support SPA routing — direct access to `/stundenlauf/standings` would return a 404 because there is no `standings/index.html` file.

**Solution: 404.html redirect trick.**

1. Create a `404.html` that captures the URL path and redirects to `index.html` with the path encoded as a query parameter or hash fragment.
2. `index.html` contains a small script that reads the encoded path and uses `history.replaceState` to restore the correct URL before the app's router initializes.

This is a well-established pattern for SPAs on GitHub Pages (used by `spa-github-pages`).

**Alternative**: If the app uses **hash-based routing** (`/#/standings`), no 404 trick is needed — the server always serves `index.html` because the hash is never sent to the server. Hash routing is simpler for GitHub Pages but produces less clean URLs.

**Recommendation**: Start with **hash routing** (`createHashRouter` in React Router) for simplicity. It avoids the 404.html hack entirely, works reliably on GitHub Pages, and is appropriate for a local-first utility app where URL aesthetics are secondary. Migrate to history-based routing later if desired.

### 7. Build-Time Version Injection

Inject the git commit SHA (short) and optional tag at build time using Vite's `define` feature:

```typescript
// vite.config.ts
import { execSync } from 'child_process';

const gitSha = execSync('git rev-parse --short HEAD').toString().trim();
const gitTag = execSync('git describe --tags --always --dirty').toString().trim();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(gitTag),
    __APP_COMMIT__: JSON.stringify(gitSha),
  },
  // ...
});
```

Accessible in app code as global constants:

```typescript
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
```

Displayed in a small "About" footer or info panel. Also useful for support/debugging: organizers can report which version they're running.

### 8. Offline Behavior

With the service worker caching the app shell, the app functions fully offline after the first visit. The core workflow is inherently offline:

| Operation | Online needed? | Notes |
|---|---|---|
| Open season | No | Reads from IndexedDB |
| Import Excel file | No | File API + client-side parsing |
| Review matches | No | All in-memory |
| View standings | No | Computed from event log in IndexedDB |
| Export PDF/Excel | No | Client-side generation + browser download |
| Export season ZIP | No | Client-side ZIP + download |
| Import season ZIP | No | File API + IndexedDB write |

The only operation requiring a network connection is the **initial app load** (first visit, or after clearing browser data). After that, the service worker serves all assets from cache.

**Offline indicator**: When `navigator.onLine` is `false`, display a subtle indicator (e.g., a small offline icon in the header). This is informational — the app continues to function normally.

### 9. GitHub Pages Configuration

The repository needs GitHub Pages enabled with the **GitHub Actions** source (not the legacy branch-based deployment):

1. Go to repository Settings → Pages.
2. Under "Build and deployment", select **Source: GitHub Actions**.
3. The `ts-deploy.yml` workflow handles the rest.

No `gh-pages` branch is needed. The `actions/deploy-pages` action uploads the build artifact directly to the Pages infrastructure.

### 10. Module Structure

```
packages/stundenlauf-ts/
  public/
    icons/
      icon-192.png
      icon-512.png
      icon-512-maskable.png
    404.html                      # SPA fallback (only if using history routing)
  src/
    components/
      UpdatePrompt.tsx            # PWA update notification toast
    sw/
      (empty — vite-plugin-pwa generates the SW)
    version.ts                    # Re-exports __APP_VERSION__, __APP_COMMIT__
  vite.config.ts                  # Vite config with PWA plugin, base path, version injection
  index.html                      # App entry point with <meta> tags for PWA
```

### 11. `<meta>` Tags in `index.html`

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#1565C0">
<meta name="description" content="Stundenlauf-Auswertung — Verwaltung und Auswertung von Laufserien. Lokal im Browser, ohne Server.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Stundenlauf">
<link rel="apple-touch-icon" href="/stundenlauf/icons/icon-192.png">
<link rel="manifest" href="/stundenlauf/manifest.webmanifest">
```

### 12. Interaction with Other Features

| Feature | Interaction |
|---|---|
| **F-TS01** (event architecture) | IndexedDB storage is managed by the app, not the service worker. The SW only caches static assets. No conflict. |
| **F-TS06** (UI shell) | The update prompt component integrates into the app shell. The offline indicator is part of the header. Hash routing configuration is part of the router setup in F-TS06. |
| **F-TS07** (season portability) | Export/import works fully offline — no interaction with the service worker. The SW does not cache exported ZIP files. |
| **F-TS08** (export) | PDF/Excel generation works fully offline. Generated blobs are downloaded via `<a download>`, unaffected by the SW. |
| **All features** | The CI pipeline runs all tests from all features. A failing test in any feature blocks deployment. |

### 13. Coexistence with Python Version

The existing `windows-build.yml` fires on `v*` tags and builds the Python desktop app. The new `ts-deploy.yml` fires on pushes to `main` (filtered to `packages/stundenlauf-ts/**` paths). The two workflows are independent:

| Aspect | Python (`windows-build.yml`) | TS Port (`ts-deploy.yml`) |
|---|---|---|
| Trigger | Push of `v*` tag | Push to `main` (packages/stundenlauf-ts paths) |
| Output | Windows installer + portable ZIP | GitHub Pages deployment |
| Artifact | GitHub Release attachments | GitHub Pages site |
| Language | Python 3.13 | Node 22 / TypeScript |

Both can coexist in the same repository indefinitely. When the TS port reaches feature parity and the Python version is retired, the Windows workflow can be removed.

---

## Mapping from Python Implementation

### Python approach

- `win_bundle/gui_entry.py` + `stundenlauf_windows.spec` — PyInstaller bundles the app into a onedir folder with an `.exe` entry point.
- `installer/Stundenlauf.iss` — Inno Setup produces a Windows installer `.exe`.
- `.github/workflows/windows-build.yml` — GitHub Actions builds the installer and portable ZIP on `v*` tags, uploads to GitHub Releases.
- Distribution: organizers download the installer or portable ZIP from the GitHub Releases page. Updates require downloading a new release.
- Platform: Windows only (Edge WebView2 runtime required).
- Offline: inherently offline (desktop app with local files).

### TS port differences

| Aspect | Python (F22) | TS Port (F-TS09) |
|---|---|---|
| Distribution | GitHub Releases (manual download) | GitHub Pages (open a URL) |
| Platform | Windows only | Any modern browser (Chrome, Firefox, Safari, Edge) |
| Installation | Installer / portable ZIP extraction | Optional PWA install (one click) |
| Updates | Manual re-download | Automatic (service worker detects new version) |
| Offline support | Inherent (desktop app) | Service worker caches app shell |
| Build tool | PyInstaller + Inno Setup | Vite |
| CI trigger | `v*` tag push | `main` branch push |
| CI runner | `windows-latest` | `ubuntu-latest` |
| Runtime dependency | Edge WebView2 | Modern browser |
| Package size | ~100+ MB (Python runtime + deps) | < 5 MB (JS + CSS + icons) |

### Reusable logic

- **None directly.** The packaging and deployment mechanisms are completely different. The only conceptual carryover is the CI/CD pattern: "code change → automated build → artifact published."
- **Icon artwork:** The existing `assets/splash_tri_hgwaii.png` can be cropped/resized for PWA icons.

### Not ported

- PyInstaller spec, frozen-path resolution (`sys._MEIPASS`), splash screen dismiss logic.
- Inno Setup installer script.
- Windows-specific build commands and `.pre-commit-config.yaml` `[build]` hook.

---

## Risks and Assumptions

- **Assumption:** The repository owner will enable GitHub Pages with the "GitHub Actions" source in repository settings. This is a one-time manual step.
- **Assumption:** The `stundenlauf` repository is public (or has GitHub Pages enabled for a private repo via a paid plan). GitHub Pages is free for public repos.
- **Assumption:** `vite-plugin-pwa` (Workbox-based) handles all service worker needs — no hand-written SW logic is required.
- **Assumption:** Target browsers (latest 2 major versions of Chrome, Firefox, Safari, Edge — per PROJECT_PLAN.md non-goals) all support service workers, the Web App Manifest, and the Cache API.
- **Risk:** Service worker caching of stale `index.html` could prevent users from seeing updates.
  - Mitigation: `vite-plugin-pwa` with `registerType: 'prompt'` and Workbox's content-hash-based precaching ensures the SW always checks for updates. The `index.html` is included in the precache manifest with a revision hash — any change triggers an update. The prompt-based flow ensures the user is notified.
- **Risk:** GitHub Pages has a soft limit of 1 GB for site size and 100 GB/month bandwidth.
  - Mitigation: The TS port's build output is expected to be < 5 MB. Bandwidth is negligible for a niche sports app. Not a realistic concern.
- **Risk:** Browser PWA install prompts behave differently across browsers and OS.
  - Mitigation: The app does not depend on being installed — it works identically in a browser tab. Installation is a convenience, not a requirement. Test on Chrome (desktop + Android) and Safari (iOS) for the primary audience.
- **Risk:** iOS Safari has historically had PWA limitations (no push notifications, limited background processing, occasional storage eviction).
  - Mitigation: The app does not use push notifications or background sync. Storage eviction is mitigated by the explicit season export feature (F-TS07) — organizers are encouraged to export/back up important seasons. Display a hint about this on iOS.
- **Risk:** The `base` path (`/stundenlauf/`) may change if the repository is renamed or the Pages site moves to a custom domain.
  - Mitigation: The `base` value is a single configuration point in `vite.config.ts`. For custom domains (served at `/`), set `base: '/'`. Document this.
- **Risk:** Concurrent deployments from rapid pushes to `main` could race.
  - Mitigation: The workflow uses `concurrency: { group: pages, cancel-in-progress: true }` to ensure only one deployment runs at a time.

## Implementation Steps

1. **Initialize Vite project** — if not already done, scaffold the `packages/stundenlauf-ts/` directory with `npm create vite@latest` (React + TypeScript template). Configure `tsconfig.json` strict mode, ESLint, Prettier.
2. **Configure `vite.config.ts`** — set `base: '/stundenlauf/'`, add React plugin, add build-time version injection via `define`.
3. **Add `vite-plugin-pwa`** — `npm install -D vite-plugin-pwa`. Configure `registerType: 'prompt'`, manifest fields, Workbox glob patterns.
4. **Create PWA icons** — generate 192×192, 512×512, and 512×512 maskable PNGs from the project's existing artwork or a new design. Place in `public/icons/`.
5. **Add `<meta>` tags** to `index.html` — viewport, theme-color, description, apple-mobile-web-app tags, manifest link.
6. **Implement `UpdatePrompt` component** — React component using `useRegisterSW` from `virtual:pwa-register/react`. German copy. Toast styling.
7. **Configure routing** — set up hash-based routing (React Router `createHashRouter`) so all routes work on GitHub Pages without a 404 fallback hack.
8. **Create `version.ts`** — re-export `__APP_VERSION__` and `__APP_COMMIT__` with TypeScript declarations.
9. **Create GitHub Actions workflow** — `.github/workflows/ts-deploy.yml` with quality (lint + typecheck + test), build, and deploy jobs. Scoped to `packages/stundenlauf-ts/**` paths.
10. **Test local production build** — `npm run build && npx serve dist` (or `npx vite preview`). Verify base path, asset loading, manifest, and SW registration.
11. **Test offline mode** — in Chrome DevTools, go offline after first load. Verify the app loads and all local operations work.
12. **Test update flow** — make a change, rebuild, serve. Verify the update prompt appears and clicking "Aktualisieren" reloads with the new version.
13. **Enable GitHub Pages** — configure repository Settings → Pages → Source: GitHub Actions. Push to `main` and verify deployment.
14. **Run Lighthouse audit** — verify PWA installability, performance ≥ 90, accessibility ≥ 90.
15. **Document** — update README with deployment instructions, local dev commands, and the production URL.

## Test Plan

- **Unit: `version.ts`**
  - `__APP_VERSION__` and `__APP_COMMIT__` are defined strings at runtime.

- **Unit: `UpdatePrompt`**
  - When `needRefresh` is false, nothing renders.
  - When `needRefresh` is true, the toast is visible with the German message and button.
  - Clicking the button calls `updateServiceWorker(true)`.

- **Integration: Vite build**
  - `npm run build` succeeds with exit code 0.
  - `dist/` contains `index.html`, hashed JS/CSS bundles, `manifest.webmanifest`, icon files, and the generated service worker.
  - `index.html` references assets with the correct base path (`/stundenlauf/...`).
  - `manifest.webmanifest` contains the expected fields (`name`, `start_url`, `icons`, etc.).

- **Integration: Service worker**
  - After first load, `navigator.serviceWorker.controller` is active.
  - Cached assets are present in the Cache Storage (inspect via DevTools → Application → Cache Storage).
  - Going offline, the app reloads from cache without errors.

- **Integration: GitHub Actions**
  - A push to `main` with `packages/stundenlauf-ts/` changes triggers the workflow.
  - The quality job fails if lint, typecheck, or tests fail (verified by intentionally breaking a test).
  - The deploy job runs only on `main` (not on PRs).
  - A push to `main` with only Python-path changes does not trigger the workflow.

- **Manual: PWA install**
  - Chrome desktop: address bar shows install icon; clicking it installs the app in a standalone window.
  - Chrome Android: "Add to Home Screen" prompt works; app opens in standalone mode.
  - Safari iOS: "Add to Home Screen" via share sheet works; app opens without browser chrome.

- **Manual: Update flow**
  - Deploy version A. Visit the site, confirm SW active.
  - Deploy version B. Revisit the site. Verify the "Neue Version verfügbar" toast appears.
  - Click "Aktualisieren". Verify the page reloads with version B's commit SHA.

- **Manual: Lighthouse**
  - Run Lighthouse in Chrome DevTools on the deployed site.
  - PWA: all installability criteria pass.
  - Performance: score ≥ 90.
  - Accessibility: score ≥ 90.
  - Best Practices: score ≥ 90.

## Definition of Done

- [ ] Vite production build produces a correct, deployable static site.
- [ ] GitHub Actions workflow runs lint, typecheck, test, build, and deploy on push to `main`.
- [ ] PWA manifest passes Lighthouse installability checks.
- [ ] Service worker caches app shell; app works offline after first visit.
- [ ] Update prompt displays when a new version is available; user-initiated reload activates it.
- [ ] App icons render in install prompts and home screens.
- [ ] Hash-based routing works for all app routes on GitHub Pages.
- [ ] Build-time version string is accessible in the app.
- [ ] CI quality gates block deployment on failures.
- [ ] All tests pass (Vitest).
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`.
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`.

## Links

- Python source reference(s):
  - `win_bundle/gui_entry.py` — PyInstaller entry point (eliminated)
  - `win_bundle/stundenlauf_windows.spec` — PyInstaller spec (eliminated)
  - `installer/Stundenlauf.iss` — Inno Setup script (eliminated)
  - `.github/workflows/windows-build.yml` — Python CI/CD (coexists, not replaced)
  - `docs/features/F22-windows-pyinstaller-packaging.md` — Python packaging feature doc
- Depends on: F-TS06 (UI shell — the app that gets deployed), all other features (tests run in CI)
- Depended on by: None (this is the final milestone)
- External references:
  - [vite-plugin-pwa documentation](https://vite-pwa-org.netlify.app/)
  - [Workbox](https://developer.chrome.com/docs/workbox/)
  - [GitHub Pages with Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)
  - [Web App Manifest spec](https://www.w3.org/TR/appmanifest/)
