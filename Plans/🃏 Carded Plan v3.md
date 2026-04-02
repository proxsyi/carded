**Branch**: `v3` (from `main`)

**Push cadence**: after each phase, test, then continue

**Merge**: to `main` when all phases pass

---

## Phase 1 — File Restructure + Clean URLs

Convert all pages from flat `.html` files to folder-based clean URLs.

### Step 1: Create folder structure

Create the following folders, each with an `index.html`:

- `login/index.html` — new file (login hub)
- `signin/index.html` — move from `signin.html`
- `signup/index.html` — move from `signup.html`
- `library/index.html` — move current `index.html` library view here
- `study/index.html` — move from `study.html`
- `account/index.html` — move from `account.html`
- `tos/index.html` — new file
- `privacy/index.html` — new file

Update root `index.html` to be the new homepage (landing page).

### Step 2: Remove hash routing

- Remove any `/#/` hash-based routing that was introduced in v2
- **Only remove route-based hash handling** (`/#/path`). Preserve the ability to read URL hash fragments — Supabase auth tokens use `#access_token=...&type=recovery` which must still be detected (see Step 8e)
- All internal links must use clean relative paths: `/carded/login`, `/carded/library`, etc.
- Update all `window.location` assignments, `<a href>` tags, and redirect logic

### Step 3: Fix all hardcoded [localhost](http://localhost) URLs

- Search ALL files for `localhost`, `127.0.0.1`, `localhost:3000`
- Replace with relative paths or the production base URL `https://proxsyi.github.io/carded`
- Note: Step 4g will refactor these hardcoded URLs to use `BASE_PATH` — for now just eliminate [localhost](http://localhost) references
- Key files to check: `auth.js`, `config.js`, `app.js`, `sync.js`, all HTML files
- OAuth `redirectTo` should use `https://proxsyi.github.io/carded/library` (or relative)

### Step 4: Update all internal links

- Every `<a href>`, `window.location`, `location.href`, `location.replace` must use clean paths
- Old: `signin.html` → New: `/carded/signin`
- Old: `signup.html` → New: `/carded/signup`
- Old: `account.html` → New: `/carded/account`
- Old: `study.html` → New: `/carded/study`
- Old: `index.html` (library) → New: `/carded/library`
- **Trailing slash convention**: always use paths WITHOUT trailing slashes (`/carded/library` not `/carded/library/`). Normalize in the SW fetch handler to prevent duplicate cache entries. GH Pages serves both variants, so pick one convention and stick to it

### Step 4b: Update 404.html

- Create or update `404.html` at the repo root with a branded error page
- Dark theme, Carded logo, "Page not found" message, link back to `/carded`
- Test: navigate directly to a non-existent path like `/carded/fakepage` — should show the 404 page
- Test: direct URL access to every valid route WITH and WITHOUT trailing slash

### Step 4c: Update PWA manifest

- Update `manifest.webmanifest`:
    - `start_url`: `/carded/` (homepage — handles both auth'd and unauth'd users)
    - `scope`: `/carded/`
    - `display`: `standalone` (verify)
    - Update `icons` array if any paths changed
- Verify the `<link rel="manifest">` tag is present in ALL `index.html` files

### Step 4d: Standard meta tags template

Every new `index.html` must include:

- `<meta charset="UTF-8">`
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- `<title>Carded — \\[Page Name\\]</title>` (unique per page)
- `<link rel="icon" href="/carded/assets/favicon.png">` (existing file — or generate a proper `favicon.ico` for multi-size support)
- `<meta name="theme-color" content="#1e1e2e">` (match dark theme)
- `<link rel="manifest" href="/carded/manifest.webmanifest">`
- `<meta name="description" content="...">` (unique per page — homepage, legal pages, and all public pages should have one. Auth pages optional but recommended)
- `<html lang="en">` on every page (screen readers use this for pronunciation)
- `<meta name="color-scheme" content="dark">` (tells browser to render dark bg immediately, prevents white flash before CSS loads)
- `<meta name="apple-mobile-web-app-capable" content="yes">` (required for iOS standalone PWA — without this, iOS opens in Safari instead of its own window)
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` (dark status bar in iOS standalone mode)

### Step 4e: Old URL redirect script

Existing v2 users may have bookmarks to old hash routes (`/#/study`, `/#/library`) and flat file paths (`signin.html`, `study.html`). Add redirect logic to `404.html`:

- Detect old hash routes: if `location.hash` starts with `#/`, redirect to `/carded/` + path after `#/`
- Detect old flat file paths: if URL ends in `.html` (e.g., `/carded/signin.html`), redirect to the clean path (`/carded/signin`)
- For all other 404s, show the branded error page with link home

### Step 4f: Favicon + apple-touch-icon

Current repo icons (in `assets/`): `favicon.png`, `icon-192.png`, `icon-512.png`, `icon.svg`

- Verify `assets/favicon.png` works as page favicon (browsers accept PNG). Optionally generate a multi-size `favicon.ico` for legacy browser compat
- Create `apple-touch-icon.png` (180×180) if missing — required for iOS home screen. Place in `assets/`
- Verify `assets/icon-192.png` and `assets/icon-512.png` are referenced correctly in `manifest.webmanifest`
- Add `<link rel="apple-touch-icon" href="/carded/assets/apple-touch-icon.png">` to all pages

### Step 4g: Base path config variable

Add `BASE_PATH = "/carded"` to `config.js`. Reference it everywhere instead of hardcoding `/carded/`:

- All `window.location` redirects: `${BASE_PATH}/login`, `${BASE_PATH}/library`, etc.
- All `<a href>` values generated in JS
- OAuth `redirectTo` URLs
- SW cache paths
- This makes it trivial to rename the repo or move hosting — change one variable

### Step 4h: Manifest background_color and theme_color

Update `manifest.webmanifest` to include:

- `"background_color": "#1e1e2e"` — controls the PWA splash screen background on mobile (prevents white flash on launch)
- `"theme_color": "#1e1e2e"` — controls the browser/status bar color on mobile
- Both should match the app's dark theme background
- Test: install PWA on Android/iOS → open from home screen → splash screen should be dark, not white

### Step 4h-ii: robots.txt + sitemap

Control search engine indexing — auth/account pages should NOT be indexed:

- Create `robots.txt` at repo root:
    - `Allow: /carded/$` (homepage only)
    - `Allow: /carded/tos`
    - `Allow: /carded/privacy`
    - `Disallow: /carded/signin`, `/carded/signup`, `/carded/login`, `/carded/library`, `/carded/study`, `/carded/account`
    - `Sitemap: <https://proxsyi.github.io/carded/sitemap.xml`>
- Create a minimal `sitemap.xml` with homepage, TOS, and privacy URLs — helps Google index the landing page faster
- Also add `<meta name="robots" content="noindex">` to auth-gated pages as a second layer (in case crawlers ignore robots.txt)

### Step 4i: Create initial shared JS files early

Create core shared files now so Phase 2 pages can import them:

- `utils.js` — `BASE_PATH` helper, input sanitization function, error display helpers, `withLoading()` for double-submit prevention, **safe localStorage wrapper** (all `localStorage.getItem`/`setItem` calls wrapped in try/catch — Safari private mode and disabled storage throw `SecurityError`. Provide `safeGet(key)`/`safeSet(key, value)` helpers that return `null`/fail silently on error. Use these everywhere: sync queue, session cache, return URL, install prompt counter, study session persistence)
- `auth-guard.js` — shared session check that all protected pages import. Redirect to login if no session, redirect to library if already auth'd on public pages. **Set up `supabase.auth.onAuthStateChange()` listener** as the central auth event handler — handles OAuth callback token exchange, automatic token refresh, sign-out detection from other tabs, and session expiry. Manual session checks on individual pages should delegate to this listener rather than reimplementing logic
- **Add a minimal global error handler now** in `utils.js`: `window.onerror` + `window.onunhandledrejection` that catches crashes and shows a styled "Something went wrong — please refresh" message instead of a blank page. Step 23i will enhance this with server-side logging later
- These don't need modal/toast yet — `components.js` comes in Phase 3 (Step 12g) after modal design is finalized
- Establish git tag convention: run `git tag v3-phase-1` before pushing. Do this before every phase push for easy rollback

**Push after Phase 1. Test all navigation works. Test direct URL access for all routes. Test old URL redirects (hash + flat files). Verify manifest, meta tags, and favicons on every page. Verify PWA splash screen is dark.**

---

## Phase 2 — Homepage + Login Flow

### Step 5: Build homepage (`index.html`)

Root `/carded` landing page:

- Carded logo (🃏) + app name
- Tagline (e.g. "Study smarter. Remember more.")
- Brief feature highlights (3-4 bullet points or cards): offline-first, cloud sync, smart study tracking, free & open source (don't claim "spaced repetition" — that's v4 SM-2. Current algorithm is Leitner 3-box)
- Big CTA button: "Get Started" → `/carded/login`
- If already authenticated (check Supabase session), auto-redirect to `/carded/library`
- Footer: links to TOS (`/carded/tos`) and Privacy (`/carded/privacy`)
- Match existing dark theme styling

### Step 6: Build login page (`login/index.html`)

Login hub at `/carded/login`:

- Carded logo + "Welcome back" or "Log in to Carded"
- **Sign in with Google** button — with Google "G" logo SVG, triggers `supabase.auth.signInWithOAuth({ provider: 'google' })` directly. **Follow Google's branding guidelines** for button styling (exact colors, padding, font, logo placement) — non-compliant buttons can get your OAuth consent screen rejected during app review
- **Sign in with GitHub** button — with GitHub octocat logo SVG, triggers `supabase.auth.signInWithOAuth({ provider: 'github' })` directly
- **Sign in with Email** text link → `/carded/signin`
- Divider line
- "Don't have an account? **Sign up**" → `/carded/signup`
- If already authenticated, redirect to `/carded/library`
- OAuth `redirectTo`: use `${window.location.origin}${BASE_PATH}/library` (dynamic, not hardcoded — adapts if hosting changes)

### Step 7: Update sign-in page (`signin/index.html`)

Email/password sign-in at `/carded/signin`:

- Email + password fields + "Sign in" button (keep existing styling)
- Add `autocomplete="email"` on the email input, `autocomplete="current-password"` on the password input (enables password manager autofill)
- Add a password visibility toggle (eye icon) on the password field — toggles `type="password"` ↔ `type="text"`. Important on mobile where typos are common
- "Forgot password?" link → triggers `supabase.auth.resetPasswordForEmail()`
- "Don't have an account? **Sign up**" → `/carded/signup`
- "← Back to all login options" → `/carded/login`
- If already authenticated, redirect to `/carded/library`

### Step 8: Update sign-up page (`signup/index.html`)

Combined sign-up at `/carded/signup`:

- Email/password sign-up form at the TOP (email, password, confirm password, "Create account" button)
- Add `autocomplete="email"` on email, `autocomplete="new-password"` on both password fields (tells password managers this is a new account)
- Add password visibility toggle on both password fields (same eye icon as signin)
- Divider: "— or —"
- **Sign up with Google** button (with Google logo)
- **Sign up with GitHub** button (with GitHub logo)
- "Already have an account? **Sign in**" → `/carded/login`
- If already authenticated, redirect to `/carded/library`

### Step 8b: OAuth callback loading state

- When user returns from Google/GitHub OAuth, they hit `/carded/library` (the `redirectTo`)
- The auth guard checks the session — this takes a moment
- Show a centered spinner + "Signing you in..." message while session is being validated
- Only render page content once session is confirmed
- If session check fails → redirect to `/carded/login`

### Step 8c: Return URL persistence

- Before redirecting an unauthenticated user to `/carded/login`, store their intended path in `sessionStorage` (`carded_return_url`)
- After successful auth (OAuth callback or email login), check for stored return URL
- **Validate before redirecting**: only redirect if stored URL starts with `BASE_PATH` (e.g. `/carded/`). If it's external or malformed, ignore it and default to `/carded/library`. This prevents open redirect attacks
- If found and valid → redirect there and clear it. If not → default to `/carded/library`
- For OAuth: `redirectTo` stays as `/carded/library`, but library page checks sessionStorage on load

### Step 8d: Homepage SEO meta tags

Add to homepage `<head>`:

- `<meta property="og:title" content="Carded — Study smarter. Remember more.">`
- `<meta property="og:description" content="Free, offline-first flashcard app. Quizlet replacement built for speed.">`
- `<meta property="og:image" content="/carded/og-image.png">`

### Step 8d-ii: Create OG image

Don't forget to actually create this file before pushing Phase 2:

- 1200×630px PNG — Carded logo (🃏) + tagline text on dark bg (`#1e1e2e`)
- Save as `og-image.png` in repo root
- Quick Figma/Canva export or HTML-to-image screenshot works fine
- `<meta property="og:url" content="<https://proxsyi.github.io/carded/>">`
- `<meta property="og:type" content="website">`

### Step 8e: Password reset callback handling

Supabase sends a magic link for password resets that redirects to the Site URL with a token fragment (`#access_token=...&type=recovery`). Handle this:

- On the homepage (`/carded`), detect `type=recovery` in the URL hash on page load. Parse with: `new URLSearchParams(window.location.hash.substring(1)).get('type')` — don't use regex, Supabase puts multiple params in the hash fragment
- If detected, redirect to `/carded/account` with the token preserved
- On the account page, detect the recovery token and show a "Set new password" form (new password + confirm)
- After successful password update, clear the hash and show success message
- Test: trigger "Forgot password?" → click email link → should land on account page with password form

### Step 8f: OAuth account auto-linking

Configure Supabase to auto-link accounts when the same email is used across providers:

- In Supabase dashboard: Authentication → Settings → enable "Automatically link accounts with the same email"
- If user signs up with email then signs in with Google (same email) → auto-link, not duplicate
- Test all combos: email→Google, email→GitHub, Google→email, GitHub→email, Google→GitHub
- v4 will add manual account linking UI in account settings

### Step 8g: Google OAuth testing mode error handling

While Google OAuth is in "Testing" mode, only manually added test users can sign in. Handle this:

- On login/signup pages, if Google OAuth returns an error, show friendly message: "Google sign-in is temporarily limited. Try email or GitHub instead."
- Don't show a raw error or blank screen
- Remove this fallback message once the app is published on Google Cloud Console

### Step 8h: Empty states

Design empty states for first-time users:

- **Empty library** (no folders or sets): centered "No flashcards yet" + big "Create your first set" button
- **Empty folder** (no sets inside): "This folder is empty" + "Create a set" button
- **Empty set** (no cards): "No cards yet" + "Add your first card" button
- Match dark theme, use subtle icon/emoji, friendly copy

### Step 8i: Browser back button cleanup after OAuth

After a successful OAuth redirect chain (app → Google/GitHub → Supabase callback → `/carded/library`), the browser history stack contains auth server URLs. Pressing back takes the user through Google's auth flow again (broken/confusing).

- After successful OAuth login is confirmed on the library page, call `history.replaceState(null, '', location.pathname)` to clean up the current entry
- This prevents back-button from hitting the OAuth callback URL
- Test: sign in with Google → press browser back → should NOT go back to Google's auth server

### Step 8j: Custom PWA install prompt

Handle the `beforeinstallprompt` event for a better install experience:

- **Chromium only** (Chrome, Edge, Samsung Internet). Safari/iOS does NOT support this event — iOS users install via Share → "Add to Home Screen". Consider showing a manual install hint on iOS: detect `navigator.standalone === undefined && /iPhone|iPad/.test(navigator.userAgent)` and show "Tap Share → Add to Home Screen"
- Listen for `beforeinstallprompt` on the homepage and library page
- Store the event object (Chrome fires this based on its own heuristics — you can't control WHEN it fires, only whether to show your UI)
- When the event fires, check a `localStorage` visit counter. If first visit, stash the event silently. On second+ visit, show a subtle banner: "Install Carded for offline access" with an "Install" button
- On click, call `event.prompt()` to trigger the native install dialog
- After install (or dismiss), hide the banner and store a flag in `localStorage` so it doesn't show again

### Step 8k: Account page shows auth provider

On the account page, display how the user signed in:

- Pull provider from `supabase.auth.getUser()` → `user.app_metadata.provider` and `user.email`
- Display: "Signed in with Google ([cash@gmail.com](mailto:cash@gmail.com))" or "Signed in with email" or "Signed in with GitHub"
- Helps users remember which method to use next time
- Note: email confirmation is intentionally OFF — users can sign up with any email without a verification step. This is a deliberate decision for v3 simplicity. Document in code comments

**Push after Phase 2. Test all auth flows including password reset callback. Test OAuth auto-linking (all combos). Verify empty states. Test Google OAuth error handling. Test back button after OAuth. Test install prompt on mobile. Verify account page shows provider info.**

---

## Phase 3 — UX Polish

### Step 9: Profile button

- Add a circle with the user's first initial in the top-right of the header
- Style: 32px circle, purple background (#7c5cfc or similar), white text, bold
- Get initial from `supabase.auth.getUser()` → use `user.user_metadata?.full_name?.\\[0\\] || user.email?.\\[0\\]?.toUpperCase() || '?'` (null-safe — email can be null in rare OAuth edge cases)
- Clicking it navigates to `/carded/account`
- Add `aria-label="Account settings"` — screen readers can't infer purpose from a single letter. Apply this pattern to ALL icon-only interactive elements (modal close buttons get `aria-label="Close"`, etc.)
- Show on ALL auth-gated pages: library, study, account

### Step 10: Custom modals for create set/folder

- Replace browser `prompt()` calls with a custom modal component
- Modal design: dark background overlay, centered card (dark bg `#1e1e2e`, purple accent border/button), rounded corners
- Contents: title ("Set name" or "Folder name"), text input field, Cancel + OK buttons
- Cancel closes modal, OK submits (also Enter key submits, Escape closes)
- Create a reusable `showModal(title, placeholder)` function that returns a Promise<string|null>

### Step 11: Text selection fix

- Add `user-select: none` to: `.btn`, `.card`, `nav`, `.modal-overlay`, `.folder-item`, `.set-item`, all clickable/draggable elements
- Allow `user-select: text` on: card term/definition text content, input fields, textarea, `.content-editable` areas
- Add to `styles.css` as global rules

### Step 12: Email confirmation for account deletion

- On the account page, when user clicks "Delete Account":
    1. Show custom modal: "Type your email to confirm deletion"
    2. Text input must exactly match the user's email
    3. If match → call `delete_user()` RPC → sign out → redirect to `/carded`
    4. If no match → show error "Email doesn't match" and keep modal open
- Use the same modal component from Step 10

### Step 12b: Modal accessibility

- Add `role="dialog"` and `aria-label` to modal overlays
- Auto-focus the text input when modal opens
- Focus trap: Tab/Shift+Tab cycles within the modal (don't let focus escape to page behind)
- Restore focus to the trigger button when modal closes
- Add `aria-hidden="true"` to the page content behind the modal while it's open
- Add `aria-label="Close"` to modal close/X buttons (icon-only buttons need explicit labels for screen readers)

### Step 12c: Keyboard navigation basics

- All interactive elements (buttons, links, inputs) must be keyboard-focusable
- Visible focus rings on all focusable elements (don't remove `outline` without a replacement)
- Add `tabindex` where needed for custom interactive elements

### Step 12d: Confirm password validation

- Signup form: client-side validation that password + confirm password match before submitting
- Show inline error "Passwords don't match" if mismatched
- Validate minimum password length (Supabase default 6 chars) — show error if too short

### Step 12e: Delete confirmation for folders/sets

Add "Are you sure?" confirmation before deleting any folder or set:

- Use the same custom modal component from Step 10
- For folders: "Delete this folder and all its sets? This can't be undone."
- For sets: "Delete this set and all its cards? This can't be undone."
- Cancel + Delete buttons (Delete in red/danger color)
- Simple confirm — no email typing needed like account deletion

### Step 12f: No-JS fallback

Add a `<noscript>` tag to every `index.html`:

- Dark-themed centered message: "Carded requires JavaScript. Please enable JavaScript in your browser to use Carded."
- Style inline so it doesn't depend on external CSS

### Step 12g: Shared component files

Create `components.js` and extend the shared files from Step 4i:

- **NEW** `components.js` — modal (`showModal`, `showConfirm`), toast notifications (`showToast`), spinner/loading overlay
- **EXTEND** `utils.js` (created in Step 4i) — add modal/toast integration, any new helpers for Phase 3
- **EXTEND** `auth-guard.js` (created in Step 4i) — update if new auth logic is needed
- Do NOT recreate `utils.js` or `auth-guard.js` from scratch — they already exist from Phase 1
- All 9+ pages should import these instead of copy-pasting. Use `<script src>` with defer, or inline imports if using modules

### Step 12h: Double-submit prevention

Prevent duplicate form submissions across the app:

- On every form submit / action button click: immediately disable the button + show a small spinner inside it
- Re-enable on success (after redirect) or on error (so user can retry)
- Key areas: "Create Account", "Sign In", "Create Set", "Create Folder", "Delete Account", "Delete Set/Folder", "Save" buttons
- Use a reusable `withLoading(button, asyncFn)` helper in `utils.js`

### Step 12h-ii: Unsaved changes warning

Prevent silent data loss when editing cards:

- When the set editor has unsaved changes (new cards typed but not saved, edits in progress), set a dirty flag
- Add `beforeunload` listener when dirty: `window.addEventListener('beforeunload', e => { e.preventDefault(); })` — browser shows "Leave site? Changes may not be saved"
- Remove the listener when changes are saved or explicitly discarded
- Also check the dirty flag before in-app navigation (e.g., clicking library link) and show a confirm modal: "You have unsaved changes. Discard?"

### Step 12i: Loading skeletons

Show placeholder shimmer/skeleton UI while data loads from Dexie instead of a blank page:

- **Library page**: show 3-4 gray placeholder cards (rounded rects with shimmer animation) in the folder/set grid while Dexie query runs
- **Study page**: show a placeholder card shape while the set/cards load
- Use CSS-only shimmer animation (linear gradient moving left to right on a gray block)
- Once data loads, replace skeletons with real content. If empty, show empty states (Step 8h)
- Keep it simple — gray rounded rects that match the card dimensions, no complex skeleton shapes

### Step 12j: Duplicate name prevention + merge

Prevent duplicate folder and set names:

- **On create/rename**: before saving, check if a folder/set with the same name already exists in the same parent
- If duplicate found, show inline error: "A folder with this name already exists" — don't let the user submit
- **On merge (edge case)**: if duplicates somehow exist (from offline sync, v1 migration, etc.), detect and merge them:
    - Same-name folders in the same parent → merge their contents into one folder, delete the duplicate
    - Same-name sets in the same folder → merge their cards into one set, deduplicate cards by term text
    - Run this check on app load or after sync completes
- Name comparison should be case-insensitive and trimmed ("Math" == "math" == " Math ")
- Reject whitespace-only and empty names: if `name.trim() === ''`, show error "Name can't be empty" — don't let blank names through

### Step 12k: Mobile CSS fixes

- **`100dvh`**: replace any `100vh` usage (modals, study page, full-height layouts) with `100dvh`. On mobile Safari, `100vh` includes the address bar height so content gets cut off. `100dvh` accounts for dynamic browser chrome
- **Important**: use `min-height`, NOT `height` — `height: 100dvh` clips overflowing content and blocks scrolling. Correct fallback: `min-height: 100vh; min-height: 100dvh;`
- Only use `height: 100dvh` for elements that truly should NOT scroll (e.g. modal overlays). For page layouts and containers, always `min-height`
- **`touch-action: manipulation`**: add to all interactive elements (buttons, cards, links, nav items). Disables 300ms double-tap-to-zoom delay on mobile. Add as global CSS: `.btn, .card, a, nav, .folder-item, .set-item { touch-action: manipulation; }`

### Step 12l: Screen reader + keyboard accessibility

- **`aria-live` region**: add `<div aria-live="polite" id="announcements" class="sr-only">` to each page. Update its text when toasts appear, data loads, or sync completes — screen readers will announce these changes. Wire into `showToast()` in `components.js`
- **Skip to main content**: add `<a href="#main" class="skip-link">Skip to main content</a>` as first element in `<body>` on every page. CSS: `.skip-link { position: absolute; left: -9999px; } .skip-link:focus { left: 50%; transform: translateX(-50%); top: 4px; z-index: 9999; }`. Add `id="main"` to main content area. Keyboard users can skip the header in one Tab press

### Step 12m: Print stylesheet

Add `@media print` block to `styles.css`:

- Flip to white background + dark text (invert dark theme for paper)
- Hide: header, nav, profile button, footer, modals, toasts, offline banner
- Show: card content, set names, folder names
- Useful for students printing flashcard sets for paper study

**Push after Phase 3. Test: profile button, modals (including keyboard/a11y), text selection, deletion confirmation, delete confirmations, signup validation, noscript fallback, double-submit prevention, loading skeletons, duplicate name rejection, 100dvh on mobile Safari, skip-to-main-content link, print output.**

---

## Phase 4 — Legal Pages

### Step 13: Terms of Service (`tos/index.html`)

Create `/carded/tos` page with the following content (match app dark theme styling):

**Terms of Service**

_Last updated: March 2026_

Carded ("the Service") is a free, open-source flashcard application.

By using Carded, you agree to the following terms:

**1. Use of Service** — Carded is provided free of charge, as-is, without warranty of any kind. We make no guarantees about uptime, data preservation, or service continuity.

**2. Your Data** — You own all content you create in Carded (folders, sets, cards). We do not claim any rights to your data. Your content is stored in your account and is not shared with third parties.

**3. Accounts** — You may create an account using email/password or OAuth (Google, GitHub). You are responsible for maintaining the security of your account. You may delete your account and all associated data at any time from the account settings page.

**4. Acceptable Use** — Do not use Carded to store or distribute illegal, harmful, or abusive content. We reserve the right to terminate accounts that violate these terms.

**5. Limitation of Liability** — Carded and its developers are not liable for any damages arising from your use of the service, including data loss.

**6. Changes** — We may update these terms at any time. Continued use of the service constitutes acceptance of the updated terms.

**Contact**: [cashmouzon@gmail.com](mailto:cashmouzon@gmail.com)

Footer: "← Back to Carded" link → `/carded`

### Step 14: Privacy Policy (`privacy/index.html`)

Create `/carded/privacy` page with the following content (match app dark theme styling):

**Privacy Policy**

_Last updated: March 2026_

Carded ("the Service") respects your privacy. This policy explains what data we collect and how we use it.

**1. Data We Collect**

- **Account information**: email address (required for sign-up). If you sign in with Google or GitHub, we receive your email and basic profile info (name, profile picture) from the OAuth provider.
- **Flashcard content**: folders, sets, cards (terms and definitions) that you create.
- **Usage data**: we do NOT collect analytics, tracking data, or usage statistics. We may collect basic error logs (error message, page URL, app version) tied to your account to maintain app stability. Error logs are deleted when you delete your account.

**2. How We Store Data**

- **Cloud**: your data is stored in a PostgreSQL database hosted by Supabase (AWS infrastructure, US region).
- **Local**: your data is also cached locally on your device using IndexedDB (via Dexie.js) for offline access.
- **Authentication**: handled by Supabase Auth. Passwords are hashed and never stored in plain text.

**3. OAuth Scopes**

- **Google**: email and basic profile (name, profile picture)
- **GitHub**: email address

We only request the minimum scopes needed for authentication. We do not access your Google Drive, GitHub repos, or any other data.

**4. Data Sharing** — We do NOT share your data with any third parties. We do NOT sell your data. We do NOT use your data for advertising.

**5. Data Retention & Deletion** — Your data is retained as long as your account exists. You can delete your account and ALL associated data (folders, sets, cards, progress) at any time from the account settings page. Alternatively, email [cashmouzon@gmail.com](mailto:cashmouzon@gmail.com) to request deletion.

**6. Cookies & Local Storage** — Carded uses `localStorage` for session management and sync queue state. No third-party cookies or tracking cookies are used.

**7. Changes** — We may update this privacy policy at any time. Check this page for the latest version.

**Contact**: [cashmouzon@gmail.com](mailto:cashmouzon@gmail.com)

Footer: "← Back to Carded" link → `/carded`

**Push after Phase 4. Verify both pages render correctly and links work.**

---

## Phase 5 — Security Audit

### Step 15: Config exposure check

- Verify `config.js` ONLY contains `SUPABASE_URL` and `SUPABASE_ANON_KEY` (publishable key)
- Search entire repo for: `service_role`, `secret`, `private_key`, `SUPABASE_SERVICE`
- **Also search git history**: `git log -p --all -S 'service_role'` — if a key was ever committed and then removed, it's still in the history and must be **rotated** in Supabase (generate a new key), not just deleted from code
- If any secret keys found in current code, remove them immediately

### Step 16: RLS audit

- Verify RLS is enabled on ALL 5 tables: `folders`, `sets`, `cards`, `user_card_progress`, `user_stats`
- Verify each table has policies that restrict to `auth.uid() = user_id`
- Test: create a second test account. Log in as user A, attempt to query user B's data via browser console. Should return empty

### Step 17: Auth guard

Update auth guard logic for the new URL structure:

- **No auth needed**: `/carded` (homepage), `/carded/login`, `/carded/signin`, `/carded/signup`, `/carded/tos`, `/carded/privacy`
- **Auth required**: `/carded/library`, `/carded/study`, `/carded/account`
- If no valid session on auth-required pages → redirect to `/carded/login`
- If valid session on login/signin/signup pages → redirect to `/carded/library`

### Step 18: Input sanitization

- Audit all DOM insertion points where user input is displayed
- Replace any `innerHTML = userInput` with `textContent = userInput` or use a sanitize function
- Key areas: folder names, set names, card terms/definitions, modal inputs
- Test: try creating a set named `<img src=x onerror=alert(1)>` — should render as plain text, not execute
- Also add `form-action 'self' <https://accounts.google.com> <https://github.com> https://*.supabase.co` to the CSP — OAuth uses full-page redirects/form posts to these domains. Without this, CSP may block OAuth sign-in. Test ALL OAuth flows with CSP enabled before shipping

### Step 18b: CSP meta tag

Add `<meta http-equiv="Content-Security-Policy">` to all pages:

- `default-src 'self'`
- `script-src 'self'` + only the CDN domains you actually use (audit your `<script>` tags — if you only use jsdelivr, don't whitelist unpkg, and vice versa. Each extra domain is a potential attack vector)
- `connect-src 'self' <https://uctnhfasholeuyxqulmd.supabase.co> wss://uctnhfasholeuyxqulmd.supabase.co` (Supabase API + realtime)
- `style-src 'self' 'unsafe-inline'` (if you use inline styles)
- `img-src 'self' data: https:`
- Test: verify app works with CSP enabled, check browser console for violations

### Step 18b-ii: Subresource Integrity (SRI)

Add `integrity` + `crossorigin="anonymous"` attributes to ALL CDN `<script>` tags:

- Generate SRI hashes: use [srihash.org](http://srihash.org) or `openssl dgst -sha384 -binary <file> | openssl base64 -A`
- Example: `<script src="<https://cdn.jsdelivr.net/npm/dexie@3.x.x/dist/dexie.min.js>" integrity="sha384-..." crossorigin="anonymous"></script>`
- If a CDN serves a tampered file, the browser refuses to execute it — defense-in-depth with CSP
- **Regenerate hashes when bumping CDN versions** — add this to the version bump checklist
- Test: intentionally corrupt an integrity hash → verify script is blocked

### Step 18c: External link hardening

- Add `rel="noopener noreferrer"` to all external `<a>` links (anything outside `/carded/`)
- Add `<meta name="referrer" content="no-referrer">` to all pages

### Step 18d: Clickjacking protection

Add `frame-ancestors 'none'` to the CSP meta tag from Step 18b.

- ⚠️ **GitHub Pages limitation**: `frame-ancestors` is only enforced via HTTP headers, not `<meta>` tags. GH Pages doesn't support custom headers, so this directive is silently ignored. Include it anyway (no harm, and it works if you migrate hosting later). Add a code comment noting the limitation
- Real clickjacking protection requires a host with custom response headers (Cloudflare Pages, Netlify, Vercel) — consider if hosting migrates in future

### Step 18e: Console logging hygiene

- Add a `DEBUG` flag to `config.js` (set `false` for production)
- Gate all verbose `console.log` calls behind the `DEBUG` flag
- Audit for any logging of sensitive data: auth tokens, passwords, emails, Supabase keys
- In production, only log errors — never log tokens or credentials

### Step 18f: Version tracking

- Add `APP_VERSION = "3.0.0"` to `config.js`
- Display version in the account page footer (small, muted text)
- Include version in any error logs for debugging
- Bump this on each release

### Step 18g: Script loading order

Define explicit dependency chain for JS files. All scripts use `defer` to avoid blocking rendering:

```html
<script src="config.js" defer></script>         <!-- 1. Constants: BASE_PATH, SUPABASE_URL, APP_VERSION, etc. -->
<script src="utils.js" defer></script>           <!-- 2. Shared helpers (depends on config) -->
<script src="components.js" defer></script>      <!-- 3. UI components: modal, toast (depends on utils) -->
<script src="db.js" defer></script>              <!-- 4. Dexie setup (depends on config) -->
<script src="auth.js" defer></script>            <!-- 5. Supabase client + auth guard (depends on config, utils) -->
<script src="supabase-db.js" defer></script>    <!-- 6. Supabase DB helpers (depends on auth) -->
<script src="sync.js" defer></script>            <!-- 7. Sync queue (depends on db, auth, supabase-db) -->
<script src="app.js" defer></script>             <!-- 8. Page-specific logic (depends on all above) -->
```

**Pin CDN versions** — always use exact versions to prevent breaking changes from CDN updates:

- Supabase: pin to current version (e.g. `@supabase/supabase-js@2.x.x`)
- Dexie: pin to current version (e.g. `dexie@3.x.x`)
- SortableJS: pin to current version (e.g. `sortablejs@1.x.x`)
- Document pinned versions in `config.js` comments. Check for updates manually per release
- Document this order in a comment at the top of each HTML file
- `defer` guarantees execution in source order, after DOM parse
- **Standardize init pattern**: every page's `app.js` (or page-specific script) wraps its entry point in `document.addEventListener('DOMContentLoaded', () => { init(); })`. All top-level code in other scripts (utils, auth, components, etc.) should be declarations/setup only — no DOM access at import time. This prevents race conditions if script order ever changes
- If moving to ES modules later (v4), this makes the migration straightforward

### Step 18h: Cache busting

GitHub Pages caches aggressively. Ensure users always get fresh assets after a deploy:

- Append `?v=3.0.0` to all `<script>` and `<link rel="stylesheet">` tags (hardcoded in HTML since there's no build step)
- Example: `<script src="app.js?v=3.0.0" defer></script>`
- **On each release**: find-and-replace the old version string in all HTML files. Consider a tiny shell script: `sed -i '' 's/?v=3.0.0/?v=3.0.1/g' */index.html index.html 404.html`
- The SW should also use `APP_VERSION` in cache names so new versions invalidate old caches
- Combined with the SW update flow (Step 21d), this ensures no stale code

### Step 18i: Email enumeration protection

Prevent leaking which emails are registered:

- On failed login, always show "Invalid email or password" — never "No account found" or "Wrong password" separately
- On failed signup with duplicate email, show "Unable to create account. Try signing in instead." (Supabase may already do this, verify)
- On password reset, always show "If an account exists, we've sent a reset link" regardless of whether the email is registered

### Step 18j: Rate limit error handling

Supabase has built-in rate limits on auth endpoints. Catch HTTP 429 responses:

- Show friendly message: "Too many attempts. Please wait a minute and try again."
- Disable the submit button for 60s with a countdown
- Apply to: login, signup, password reset, OAuth attempts
- Don't show raw error objects or Supabase error messages to users

### Step 18k: Password reset cooldown

Prevent spam-clicking "Forgot password":

- After clicking, disable the button for 30 seconds with countdown text: "Check your email (30s)"
- Store the cooldown timestamp in `sessionStorage` so it persists across page refresh within the same session
- Always show "If an account exists, we sent a reset link" (per Step 18i)

**Push after Phase 5. Run all security checks. Verify CSP (including frame-ancestors) doesn't break functionality. Verify no sensitive data in console logs. Test email enumeration (wrong email, wrong password, duplicate signup). Test rate limit handling.**

---

## Phase 6 — Offline + Service Worker

### Step 19: Update SW cache list

Update `sw.js` precache/runtime cache for new URL structure:

- Cache both clean URLs AND their `index.html` variants (GH Pages may serve either): `/carded/`, `/carded/login`, `/carded/login/index.html`, `/carded/library`, `/carded/library/index.html`, `/carded/study`, `/carded/study/index.html`, `/carded/account`, `/carded/account/index.html`, `/carded/signin`, `/carded/signin/index.html`, `/carded/signup`, `/carded/signup/index.html`
- OR: normalize URLs in the SW fetch handler (strip trailing slashes, resolve to index.html) so you only cache one variant
- Also cache: `styles.css`, `app.js`, `auth.js`, `config.js`, `db.js`, `sync.js`, `supabase-db.js`, Supabase CDN, SortableJS CDN, Dexie CDN
- Optional cache: `/carded/tos`, `/carded/privacy`
- Bump SW version to force update on existing installs

### Step 20: Offline session persistence

- On successful login, cache user session info in `localStorage`:
    - `carded_user_email` — for profile initial display
    - `carded_user_id` — for Dexie queries
    - Supabase already persists the session token in localStorage
- When offline:
    - Auth guard checks `localStorage` for cached session instead of hitting Supabase
    - Library/study pages load data from Dexie (IndexedDB) using the cached user_id
    - Sync queue stores changes in `localStorage` (`carded_sync_queue`)
- When back online:
    - Supabase session refreshes automatically
    - Sync queue flushes pending changes to Supabase

### Step 21: Test offline flows

- Sign in → go offline → browse library → study cards → go online → verify sync
- Sign in → go offline → create new set + cards → go online → verify they appear in Supabase
- Sign in via OAuth → go offline → verify app still works with cached session

### Step 21b: iOS standalone PWA session handling

When a user adds Carded to their iOS home screen, it runs in a standalone WebView that does NOT share localStorage/cookies with Safari:

- The login page must work properly in standalone mode
- The offline session caching from Step 20 is critical here — without it, reopening the PWA = re-login every time
- Test: install PWA on iOS → open from home screen → sign in → close → reopen → should still be signed in

### Step 21c: Safari private browsing detection

Safari in private browsing has limited/broken IndexedDB support. Detect and warn:

- On app load, attempt a small Dexie write/read test
- If it throws or fails, show a styled message: "Private browsing detected. Please switch to a normal browsing window to use Carded."
- Don't let the app crash silently — fail gracefully with a clear message

### Step 21d: Service worker update flow

When a new SW version is deployed, existing users might be stuck on old cached version:

- In new `sw.js`: use `skipWaiting()` in the `install` event and `clients.claim()` in the `activate` event
- Clear old caches in the `activate` event (delete any cache names that don't match the current version)
- **Prefer manual refresh** (safer): show a toast "New version available" with a "Refresh" button. Auto-reload is risky — new SW cache + old page code can cause runtime errors mid-session
- Alternative: auto-reload via `controllerchange` event, but only if you're confident the update is backward-compatible

### Step 21e: CDN failure fallback

Supabase, Dexie, and SortableJS are loaded from CDNs. If a CDN is down or blocked:

- The SW should cache CDN responses after first load (runtime caching with cache-first strategy)
- On subsequent loads, even if CDN is unreachable, the cached versions are served
- Add `onerror` handlers on CDN `<script>` tags that show a user-friendly error if scripts fail to load on first visit

### Step 21f: Realtime subscription cleanup

Since Carded is multi-page (not SPA), navigating between pages creates new realtime subscriptions without cleaning up old ones:

- **First: decide what realtime is actually for.** If it's only for multi-tab sync, `BroadcastChannel` (Step 23h) may be sufficient — and you save Supabase's 200 concurrent connection limit. If realtime is used for cross-device live updates (e.g., edit on phone → see update on laptop immediately), document which tables/channels are subscribed to
- If using realtime: on each page load, call `supabase.removeAllChannels()` before setting up new subscriptions
- On `beforeunload`, call `supabase.removeAllChannels()` to clean up
- Without cleanup, you'll get connection leaks that hit Supabase's free tier concurrent connection limit (200)

### Step 21g: Dexie schema versioning

If v3 modifies any Dexie table structure (new indexes, new tables, renamed fields):

- Bump `db.version(N)` in `db.js` — do NOT reuse the same version number
- Add an `.upgrade(tx => { ... })` function to migrate existing data if needed
- Test: open the app with old v2 data in IndexedDB → verify it migrates cleanly without data loss
- If no schema changes in v3, still document the current version number and the process for future changes

### Step 21h: Sync retry with exponential backoff

When a sync queue operation fails (network error, Supabase error, 5xx):

- Retry with exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s → max 60s
- After 5 consecutive failures, pause the queue and show a toast: "Sync paused — will retry automatically"
- When the `online` event fires, reset the backoff and immediately retry
- **401 (token expired)**: do NOT skip — trigger `supabase.auth.getSession()` to refresh the token, then retry the operation. If refresh fails, pause queue and redirect to login
- **Other 4xx** (400, 403, 404, 422 — bad data): log and skip those items, don't retry
- On 429 (rate limit), respect the `Retry-After` header if present

### Step 21i: Sync queue overflow protection

The sync queue is stored in `localStorage` which has a ~5-10MB limit:

- Wrap all `localStorage.setItem` calls for the sync queue in a try/catch
- If `QuotaExceededError` is thrown, show a toast: "Too many offline changes. Please connect to sync before making more edits."
- Consider: if queue exceeds 500 items, show a warning before it hits the limit
- As a future improvement (v4): move the sync queue to IndexedDB which has much larger limits

### Step 21j: Orphaned local data cleanup

If a folder delete partially fails in Dexie (or offline operations create inconsistencies), orphaned sets/cards can exist with missing parent references:

- On app load (after Dexie is ready), run a cleanup pass:
    - Find sets where `folder_id` doesn't match any existing folder → delete them (and their cards)
    - Find cards where `set_id` doesn't match any existing set → delete them
    - Find `user_card_progress` entries where `card_id` doesn't match any existing card → delete them
- Run this cleanup BEFORE sync to avoid pushing orphaned data to Supabase
- Log cleaned-up records count (behind DEBUG flag) for debugging
- Keep it fast — use Dexie's `.where()` with index lookups, not full table scans

### Step 21k: Offline indicator

Show a visual indicator when the user is offline:

- Listen for `online`/`offline` events on `window`
- When offline: show a small banner at the top of the page (below header): "You're offline — changes will sync when you reconnect" (yellow/amber background, dark text)
- When back online: briefly show "Back online — syncing..." (green), then auto-dismiss after 3 seconds
- Also check `navigator.onLine` on page load to show the banner immediately if already offline
- **`navigator.onLine` caveat**: this API only detects network interface, NOT actual connectivity. A device on hotel WiFi with a captive portal reads `true` but can't reach Supabase. Also detect connectivity failures from actual Supabase fetch calls — if a request fails with a network error while `navigator.onLine` is `true`, show the offline banner anyway
- Banner should not block content — use a slim bar that pushes content down slightly

### Step 21l: Sign out clears local data

When a user signs out, clean up ALL local data to prevent the next user on the same device from seeing stale data:

- Clear Dexie tables for the current user only (`db.folders.where('user_id').equals(uid).delete()`, same for sets, cards, user_card_progress, user_stats) — do NOT wipe the entire DB, in case another account was used on the same browser
- **Before clearing sync queue**: if `carded_sync_queue` is non-empty, show a warning modal: "You have X unsynced changes. They'll be lost if you sign out. Continue?" Only proceed after confirmation (or if queue is empty)
- Clear localStorage: `carded_user_email`, `carded_user_id`, `carded_sync_queue`, `carded_return_url`
- Keep: `carded_install_prompt_count` (not user-specific)
- Call `supabase.auth.signOut()` last (clears Supabase session token)
- **Handle signOut() failure**: if `signOut()` throws (network error, offline), the Supabase session token stays in localStorage. Fallback: manually clear `sb-uctnhfasholeuyxqulmd-auth-token` from localStorage. Wrap in try/catch — don't let a failed signOut block the rest of the cleanup
- Redirect to `/carded/login` after cleanup
- Test: sign in as user A → create data → sign out → sign in as user B → should NOT see A's data offline

**Push after Phase 6. Test offline behavior. Test iOS standalone PWA session. Test Safari private browsing detection. Verify SW updates properly. Test with CDN blocked (devtools network throttle). Check realtime connections don't leak. Test sync retry backoff. Verify offline indicator. Check orphan cleanup. Verify sign out wipes all local data (test multi-user on same device).**

---

## Phase 7 — Account Deletion Cascade + Error Testing

### Step 22: Verify deletion cascade

**First**: verify `delete_user()` Postgres function exists in Supabase dashboard → Database → Functions. If missing, create it:

- Should delete all user rows from: `folders`, `sets`, `cards`, `user_card_progress`, `user_stats` (in correct FK order)
- Then delete the auth user via `auth.users`
- Wrap in a transaction so it's all-or-nothing

**Then test**:

- Create a test account
- Add folders, sets, cards
- Delete the account via `delete_user()` RPC
- Verify ALL rows in `folders`, `sets`, `cards`, `user_card_progress`, `user_stats` for that user_id are gone
- If cascade doesn't work, check foreign key constraints and fix

### Step 23: Edge case testing

Test and fix the following edge cases:

- Empty folder/set/card names → should be rejected (show validation error)
- Very long text (1000+ chars) in names/terms/definitions → should be accepted but truncated in UI if needed
- Rapid create/delete of same item → should not cause sync conflicts
- Multiple browser tabs with same account → should not cause data corruption
- Sign out while sync is in progress → pending changes should persist in queue
- Expired session → should redirect to login, not crash
- Offline → create item → delete same item → go online → sync should handle correctly
- v1 migration with 0 items, 1 item, and many items → should all work
- OAuth sign-in → immediately go offline → should work with cached data
- Switch between email and OAuth accounts on same device → should work cleanly
- **Card content format**: v3 treats card terms and definitions as **plain text only** (no rich text, no formatting, no HTML). Use `textContent` for rendering, store as plain strings in Dexie and Supabase. Line breaks within a card are allowed (store as `\\n`, render with CSS `white-space: pre-wrap`). Rich text / markdown support is a v4+ consideration

### Step 23b: Mobile responsiveness audit

- Test ALL pages at phone widths: 375px (iPhone SE), 390px (iPhone 14), 428px (iPhone 14 Pro Max)
- Verify: modals don't overflow, buttons are min 44×44px tap targets, inputs are usable, homepage stacks properly, tables scroll horizontally if needed
- No horizontal overflow on any page, text readable without zooming

### Step 23c: Error message UX

- Replace any remaining `alert()` calls with styled inline errors or toast notifications
- Cover: failed login (wrong password/no account), failed signup (duplicate email/weak password), network errors, sync failures, invalid input (empty names)
- All error messages match dark theme styling

### Step 23d: Session refresh edge cases

- Handle Supabase token refresh failures gracefully
- If refresh fails → clear local session → redirect to `/carded/login` with "Session expired" message
- Don't let the app crash or show blank page on auth errors

### Step 23e: Document last-write-wins sync strategy

Carded uses a **last-write-wins** strategy for offline sync conflicts:

- **How it works**: each sync queue operation is a Supabase upsert. The client sends its local data (including `updated_at` timestamp). Supabase overwrites the row — no server-side timestamp comparison. The last device to sync wins, period
- If two devices edit the same card offline, the one that syncs last overwrites the other entirely — no field-level merge
- This is intentional and acceptable for v3 — v4 may add conflict detection (compare server `updated_at` before upsert, warn if server version is newer than client's base version)
- Add a code comment documenting this decision in `sync.js`

### Step 23f: Sequential sync queue

The sync queue MUST process operations in order:

- Create folder → create set in folder → create cards in set = must sync in this exact sequence
- If a parent operation fails (e.g., folder create fails), skip dependent operations and retry on next sync
- Do NOT process queue items in parallel — sequential only
- Handle cascading failures: if folder create fails, mark all child operations as "blocked" and retry the folder first

### Step 23g: Max content limits / storage full

Handle edge cases with large amounts of data:

- IndexedDB has browser-specific limits (~80% of disk on Chrome, less on Safari). Catch `QuotaExceededError` and show: "Storage full. Please free up space or delete unused sets."
- Supabase free tier has 500MB database limit. If writes start failing with storage errors, show a friendly message
- Add soft validation: warn (don't block) if a single card term/definition exceeds 5000 chars

### Step 23h: Multi-tab data consistency

If a user has Carded open in multiple tabs:

- Supabase realtime handles cross-tab updates for cloud data
- But local Dexie changes in tab A won't auto-reflect in tab B
- Use `BroadcastChannel` API to notify other tabs when local data changes
- Fallback for browsers without BroadcastChannel: listen for `storage` events on a shared localStorage key
- At minimum: when a tab regains focus, re-fetch data from Dexie to catch changes from other tabs

### Step 23i: Error reporting

Add basic error logging for production debugging:

- Create an `error_logs` table in Supabase with RLS (each user can only insert their own errors)
- Columns: `user_id`, `error_message`, `error_stack`, `page_url`, `app_version`, `created_at`
- On unhandled errors (`window.onerror`, `unhandledrejection`), log to this table (fire-and-forget, don't block the app)
- Rate limit: max 10 error logs per user per hour to prevent spam
- Alternative: use Sentry free tier (10k events/month) instead of custom table

### Step 23j: SortableJS mobile touch fix

Drag-to-reorder on touch devices conflicts with scrolling. Fix SortableJS config:

- Add `delay: 200` and `delayOnTouchOnly: true` — user must long-press 200ms before drag activates, normal scroll works immediately
- Add `touchStartThreshold: 5` — small movement threshold before drag starts (prevents accidental drags)
- Consider adding a visible drag handle (⠿ icon on the left side of each item) so it's obvious how to reorder
- Test on actual touch device: scroll the library list, then long-press to drag — both should work smoothly

### Step 23k: Large set performance

Test and optimize for sets with many cards (500+):

- **Quick test first**: create a set with 500 dummy cards via browser console, verify the app remains responsive
- **Study session**: should be fine since it shows one card at a time, but verify
- **Sync**: large sets mean more sync operations — verify the sequential queue handles 500+ card creates without timing out
- **Set editor view — escalation approach** (do NOT jump to virtual scrolling):
    1. **Paginate first**: show 50 cards at a time with a "Load more" button at the bottom. Measure if this is sufficient
    2. **If still sluggish at 200+ visible**: add `content-visibility: auto` CSS on card elements (lets browser skip rendering off-screen cards — zero JS needed)
    3. **Only if both fail**: consider virtual scrolling, but scope it to v4 (too complex for vanilla JS from scratch)
- If performance is acceptable without optimization, document the tested limit and move on

### Step 23l: Card ordering

Define and persist how cards are ordered within a set:

- Default: creation time (`created_at` ascending) — newest cards at the bottom
- If drag-reorder for cards is in scope: add `sort_order` integer to `cards` table in both Dexie and Supabase, update on reorder, sync via queue
- If drag-reorder is NOT in scope for v3: document that card order = creation time, manual reorder is v4
- Make sure study mode respects the same ordering

### Step 23m: Study session state persistence

Save progress so users can resume after closing the tab:

- On each card advance, save to localStorage: `carded_study_session = { setId, cardOrder: \\[cardId1, cardId2, ...\\], currentIndex, totalCards, startedAt }`
- `cardOrder` preserves the exact sequence (including shuffle order) so resuming picks up where you left off — index alone breaks if cards are shuffled or reordered
- On study page load, if saved session exists for this set → offer "Resume where you left off?" or auto-resume
- Clear saved session on completion or explicit navigation away
- If set was modified since session started (cards added/removed — compare `cardOrder` IDs against current set) → discard saved session, start fresh

### Step 23n: Study empty set handling

If user navigates to `/carded/study?set=<id>` and the set has 0 cards:

- Show centered message: "No cards to study yet!" + button: "Add cards to this set" → link to set editor
- Do NOT show blank card, crash, or infinite spinner
- Also handle: set doesn't exist (deleted/invalid ID) → "Set not found" + link back to library

> ⚠️ **Supabase migration before Phase 7 push**: if implementing Step 23i (error reporting with custom table), create the `error_logs` table + RLS policies in the Supabase dashboard BEFORE pushing. Frontend inserts will fail silently if the table doesn't exist.

**Push after Phase 7. Test on mobile viewports (including SortableJS drag on touch). Verify error messages. Test session expiry. Test multi-tab. Verify sync queue ordering. Test 500+ card set. Test study session resume. Test empty/missing set study page.**

> **Regression note**: After each phase, re-run previous phases' smoke tests. Especially after Phase 5 (security/CSP) — verify Phases 1-4 still work. After Phase 6 (offline) — verify auth flows still work online. Quick pass, not full regression.

---

## Phase 8 — Final Cleanup + Merge

### Step 24: Delete old files

- Remove old flat `.html` files that were moved to folders: `signin.html`, `signup.html`, `study.html`, `account.html`
- Remove or move old plan files from repo root: `🃏 Carded Plan v1.md`, `🃏 Carded Plan v2.md` — move to a `docs/` folder or delete (they're in Notion anyway)
- Remove any dead code, unused functions, old comments
- Update `README.md` for v3: new features (homepage, OAuth providers, legal pages, offline improvements, clean URLs), updated screenshots if applicable, current tech stack
- Verify `404.html` still works for GitHub Pages (if it exists)

### Step 25: Final test pass

- Full flow test: homepage → login → Google OAuth → library → create folder → create set → add cards → study → account → sign out
- Full flow test: homepage → signup → email/password → library → same CRUD → account → delete account
- Post-deletion test: after deleting account, sign up again with same email → should create fresh account
- Offline test: sign in → airplane mode → browse + create → reconnect → verify sync
- Offline indicator test: go offline → see amber banner → reconnect → see green banner → auto-dismiss
- Mobile test: check responsive layout on phone-width viewport
- Print test: open library with sets → Cmd+P → verify print stylesheet hides nav, flips to light bg
- Keyboard a11y test: Tab through every page, verify focus rings, skip-to-main link, modal focus trap
- **Run Google Lighthouse** on deployed site: check Performance, Accessibility, SEO, PWA scores. Fix any red flags

### Step 26: Merge to main

```bash
git checkout main
git merge --no-ff v3
git push origin main
git tag v3.0.0
git branch -d v3
git push origin --delete v3
git push origin v3.0.0
```

---

## Manual Steps (after merge)

1. **Google Cloud Console**: go to OAuth consent screen → App domain → add:
    - Homepage: `https://proxsyi.github.io/carded`
    - Privacy policy: `https://proxsyi.github.io/carded/privacy`
    - Terms of service: `https://proxsyi.github.io/carded/tos`
2. **Publish app**: hit "Publish app" button on the Audience page
3. **Supabase**: update redirect URLs if any changed
    - Site URL: `https://proxsyi.github.io/carded/`
    - Redirect URLs: `https://proxsyi.github.io/carded/**`
4. **Supabase email templates**: go to Authentication → Email Templates → verify URLs and branding in password reset, magic link, and confirmation emails. Update any hardcoded URLs or default Supabase branding to match Carded v3
5. **Verify `.gitignore`**: ensure it includes `.DS_Store`, `node_modules/`, `*.log`, and any other OS/editor artifacts