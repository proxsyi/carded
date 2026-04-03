# Carded

Free, offline-first flashcard app with cloud sync, smart study tracking, and zero clutter.

---

## Using Carded

### Web app

Go to **[proxsyi.github.io/carded](https://proxsyi.github.io/carded)**, create an account (or use without one), and start creating flashcard sets.

### Install as an offline app (PWA)

Carded works without an internet connection and can be installed as a standalone app:

- **Chrome / Edge**: click the install icon in the address bar, then click **Install**
- **iOS Safari**: tap **Share** → **Add to Home Screen**
- **Android Chrome**: tap the menu (⋮) → **Install app**

Once installed, Carded opens like a native app and works fully offline.

### Run locally

Clone the repo and open it with any static file server:

```bash
git clone https://github.com/proxsyi/carded.git
cd carded
python3 -m http.server 8080
# Open: http://localhost:8080/carded/
```

No build step. No dependencies to install. Edit files and refresh.

---

## How it works

**Stack**: Vanilla HTML, CSS, and JavaScript — no frameworks, no bundler, no transpilation.

**Storage**: IndexedDB via [Dexie.js](https://dexie.org/) for local-first offline storage + [Supabase](https://supabase.com/) PostgreSQL for cloud sync. All data is written locally first; sync happens in the background.

**Auth**: Supabase Auth with email/password, Google OAuth, and GitHub OAuth. Local (no-account) mode is also supported.

**Hosting**: GitHub Pages — push to `main` and it deploys automatically.

**PWA**: Service worker caches all static assets for offline access. Web app manifest enables installability.

**Study system**: Point-based familiarity tracking. Cards you miss accumulate points and appear more frequently. Cards you answer correctly lose points. Reaching 0 points means mastered.

**Sync**: Local-first with background cloud sync. Mutations are written to IndexedDB immediately, queued, and flushed to Supabase when online. Supabase Realtime broadcasts changes across tabs and devices.
