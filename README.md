# Carded

Carded is a self-hosted flashcard PWA for fast study with offline cache and Supabase-backed sync. Zero build step, static-host friendly.

**Features (v3)**

- Clean URLs (`/carded/login`, `/carded/library`, `/carded/study`, `/carded/account`)
- Folder and set organization with standalone decks
- Email/password auth plus Google and GitHub OAuth
- Supabase cloud sync with local Dexie (IndexedDB) cache
- Offline-first — create and edit cards while disconnected, sync queue flushes on reconnect
- Sync retry with exponential backoff; session-expiry redirect handling
- Flip-card study mode with keyboard shortcuts and auto-resume across sessions
- Multiple-choice learn mode with per-card progress tracking
- Custom modals (no browser `prompt()`) with full keyboard/a11y support
- Import/export for plain-text card sets (`Term, Definition` per line)
- v1 local-data migration prompt on first sign-in
- Installable PWA with dark splash screen; install prompt on repeat visits
- Skip-to-main link, focus traps, print stylesheet
- Terms of Service and Privacy Policy pages

**Run locally**

```
python3 -m http.server 8000
```

Open `http://localhost:8000/carded/` — serving over HTTP is required for the service worker and OAuth redirects.

**Production**

https://proxsyi.github.io/carded/

**Supabase setup**

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `config.js`. Dashboard settings needed:

- Site URL: `https://proxsyi.github.io/carded/`
- Redirect URLs: `https://proxsyi.github.io/carded/**`
- RLS enabled on `folders`, `sets`, `cards`, `user_card_progress`, `user_stats`
- `delete_user()` RPC function (transaction that deletes all user rows + auth user)

**Install as PWA**

- iOS: Safari → Share → Add to Home Screen
- Android: Chrome → three-dot menu → Install app
- Desktop: Chrome/Edge → install icon in address bar

**Tech stack**

- Vanilla HTML, CSS, ES6 JavaScript (IIFE modules, no bundler)
- Dexie.js 4.4.2 (IndexedDB) + Supabase JS 2.101.1 (Auth / Postgres / Realtime) via CDN with SRI hashes
- GitHub Pages static hosting
- PWA: service worker (cache-first, cache name versioned), Web App Manifest
