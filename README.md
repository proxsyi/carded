# Carded

Carded is a self-hosted flashcard PWA for fast study with offline cache and Supabase-backed sync. It keeps the stack zero-build-step and static-host friendly.

**Features**

- Folders, sets, and standalone decks
- Email/password auth plus Google and GitHub OAuth
- Supabase cloud sync with local Dexie cache
- Offline queue with background sync when connectivity returns
- Inline editing for set names and card content
- Study mode with flip cards, keyboard shortcuts, and progress tracking
- Learn mode with multiple choice review
- Import/export for plain text card sets
- v1 local-data migration prompt on first sign-in
- Offline support with a service worker and installable manifest

**Run locally**

Use a simple static server:

`python3 -m http.server 8000`

Then open the local server root in your browser and navigate to `/carded/`.

You can also open `index.html` directly, but serving over HTTP is recommended so the service worker and manifest behave correctly.

**GitHub Pages**

https://proxsyi.github.io/carded/

**Supabase setup**

Add the project URL and publishable key in [config.js](/Users/cashm/Documents/Projects/personal/Carded/config.js). The current v2 setup expects:

- Site URL: `https://proxsyi.github.io/carded/`
- Redirect URLs: `https://proxsyi.github.io/carded/**`
- Google OAuth callback: `https://uctnhfasholeuyxqulmd.supabase.co/auth/v1/callback`
- GitHub OAuth callback: `https://uctnhfasholeuyxqulmd.supabase.co/auth/v1/callback`
- RLS enabled on `folders`, `sets`, `cards`, `user_card_progress`, and `user_stats`

Manual SQL setup for the v2 tables, triggers, policies, and realtime publication is documented in [🃏 Carded Plan v2.md](/Users/cashm/Documents/Projects/personal/Carded/🃏%20Carded%20Plan%20v2.md).

**Install on your device**

Visit the GitHub Pages URL, then install it from the browser menu:

- iPhone/iPad: Safari → Share → Add to Home Screen
- Android: Chrome → three-dot menu → Install app
- Desktop: Chrome or Edge → Install App / address bar install icon

Once installed, Carded runs like an app and keeps all data local to the browser on that device.

**Tech stack**

- Vanilla HTML, CSS, and JavaScript
- Dexie.js for local IndexedDB cache
- Supabase Auth + Postgres + Realtime
- Static hosting on GitHub Pages
- PWA manifest + service worker
