# I Can't Decide

**I Can't Decide** is a personal decision wheel app for one person.  
Create and save wheels (like "Dinner" or "Movie Night"), spin with a realistic ease-out animation, and get a random winner that matches exactly where the pointer lands.

## Features

- Create, edit, rename, and delete wheels
- Add/remove/edit options (supports 2 to 30 options)
- Persist all wheels in `localStorage` (survives reloads)
- Big colorful wheel with pointer and smooth spin animation
- Random landing + mathematically consistent winner detection
- Result card with celebration effect
- Optional spin tick sound (mute toggle)
- Haptic vibration on landing when supported
- Installable PWA (manifest + icons + offline service worker)

## Tech Stack

- React + TypeScript
- Vite
- Client-side only (no backend)

## Local Development

### Requirements

- Node.js 20+ (or current LTS)
- npm 10+

### Run

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## PWA / Offline Notes

- `public/manifest.webmanifest` defines install metadata and app icons.
- `public/sw.js` caches the app shell and same-origin assets.
- On first online visit, assets are cached for offline use.

## Deploy as a Static Site

Any static host works (Netlify, Vercel static output, Cloudflare Pages, GitHub Pages, etc.).

1. Build:
   ```bash
   npm run build
   ```
2. Deploy the `dist/` directory.
3. Ensure your host serves `index.html` for SPA routes (if route rewrites are needed).

## Privacy

All data stays in the browser (`localStorage`) on that device.
