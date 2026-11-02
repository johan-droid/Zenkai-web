# Zenkai — Global Header & Footer Audit

Date: 2026-11-03
Scope: `Zenkai Website/frontend` — shell, navigation, search, auth surface, footer.
Method: static inspection of routes, layouts, components, config, tokens, providers and tests. No code was modified in this phase.

---

## 1. Existing structure

### 1.1 Layout tree

```
app/layout.tsx                       RootLayout — <html suppressHydrationWarning class="dark">
 └─ AppProviders                     Theme → PWA → Query → Auth → Tooltip → Toaster
    └─ app/(main)/layout.tsx         MainLayout (all 16 routes live here)
       ├─ IntroAnimation             full-screen cinematic intro
       ├─ AuroraBackground           static crimson bloom, fixed, -z-10
       ├─ Navbar                     sticky header          (client)
       ├─ main.container-page        pb-28 md:pb-16
       ├─ Footer                     server component
       └─ MobileNav                  fixed bottom bar, md:hidden (client)
```

There is exactly **one** shell. All 16 routes are inside the `(main)` route group:

| Route | Kind | Header | Footer | Bottom bar |
|---|---|---|---|---|
| `/` | discovery | full | yes | yes |
| `/anime`, `/manga`, `/novel` | catalogue | full | yes | yes |
| `/anime/[id]`, `/manga/[id]`, `/novel/[id]` | detail | full | yes | yes |
| `/schedule` | discovery | full | yes | yes |
| `/browse` (component only, no route) | — | — | — | — |
| `/search` | discovery | full | yes | yes |
| `/library`, `/history` | personal | full | yes | yes |
| `/settings` | account | full | yes | yes |
| `/user/[username]` | profile | full | yes | yes |
| `/watch/[id]/[ep]` | **immersive** | full (unchanged) | yes | **hidden** |
| `/read/[id]/[chapter]` | **immersive** | full (unchanged) | yes | **hidden** |
| `/read-novel/[id]/[chapter]` | **immersive** | full (unchanged) | yes | **hidden** |

### 1.2 Missing route shells

- **No `error.tsx`** anywhere (root or nested).
- **No `not-found.tsx`** anywhere — unknown routes fall to Next's default 404, which renders **outside** `(main)`, so it has **no header, no footer, no brand**.
- **No `loading.tsx`** anywhere; loading is handled per-page.
- Only `app/(main)/template.tsx` exists (route transition wrapper, client + motion).

### 1.3 Components in play

| File | Client? | Responsibility |
|---|---|---|
| `components/layout/navbar.tsx` | yes | brand, desktop nav row, PWA install, 2 search triggers, drawer |
| `components/layout/mobile-nav.tsx` | yes | fixed bottom bar, 5 hardcoded items, motion `layoutId` indicator |
| `components/layout/footer.tsx` | **no** | brand, `navSections` link dump, copyright |
| `components/layout/brand.tsx` | yes | logo mark SVG + wordmark + tagline |
| `components/layout/page-header.tsx` | no | per-page editorial masthead (unrelated to global header) |
| `components/layout/aurora-background.tsx` | no | static background bloom |
| `components/search/search-command.tsx` | yes | ⌘K command palette, trending shelf + anime search |
| `components/ui/sheet.tsx` | yes | Radix Dialog side sheet (drawer) |

### 1.4 Navigation configuration — `config/nav.ts`

```ts
navSections = [
  { items: [Home, Anime, Manga, Novels, Schedule, Library] },   // no title
  { title: "Personal", items: [History, Settings] },
]
primaryNav = navSections.flatMap(s => s.items)   // 8 items, flattened
mobileNav  = primaryNav.filter(i => i.mobile)   // DEAD — never imported
isActivePath(pathname, href)
```

### 1.5 Design tokens — `app/globals.css`

Already exist and already match the requested dark streaming palette almost exactly:

| Requested | Existing token | Value |
|---|---|---|
| Main background | `--background` / `--surface-0` | `#08090C` ✅ |
| Secondary surface | `--surface` / `--surface-1` | `#111319` ✅ |
| Elevated surface | `--surface-secondary` / `--surface-2` | `#191C24` ✅ |
| Hover surface | `--surface-hover` / `--surface-3` | `#222632` ✅ |
| Primary text | `--text-primary` / `--ink-1` | `#F55F7` → `#F5F5F7` ✅ |
| Secondary text | `--text-secondary` / `--ink-2` | `#A5A9B5` ✅ |
| Muted text | `--text-muted` / `--ink-3` | `#777D8B` ✅ |
| Border | `--border-subtle` / `--line` | `#292D37` ✅ |
| Accent | `--accent` / `--signal` | `#C51F3A` (crimson — existing brand) ✅ |

**Conclusion: no new colour tokens are required.** The header/footer must consume `surface-*`, `ink-*`, `signal`, `line`. Introducing a second palette would break `test/responsive-design-system.test.ts`, which pins these exact hex values.

Also present: `container-page` utility (max 90rem), global `:focus-visible` outline in `signal`, global `prefers-reduced-motion` block, `env(safe-area-inset-*)` padding on header and bottom bar.

### 1.6 Authentication

- `AuthProvider` (`components/providers/auth-provider.tsx`) — single `fetchCurrentUser()` on mount, exposes `user`, `isLoading`, `isAuthenticated`, `login`, `register`, `logout`, `syncNow`, `refreshUser`.
- `UserProfile` has `username`, `displayName`, `email`, `avatarUrl`, `bio`, `createdAt`.
- **Login and registration forms exist only inside `/settings` → `preferences-panel.tsx`.** There is **no `/login` or `/register` route.**
- `useAuth()` is consumed in exactly **2** places: `preferences-panel.tsx` and `user/[username]/page.tsx`. **The header has no account surface at all.**
- `admin-dashboard.tsx` exists but is **not mounted by any route** — dead component.

### 1.7 Search

- Single implementation: `SearchCommand` (⌘K / Ctrl+K palette) backed by `lib/api/zenkai` → `fetchDiscovery("trending")` + `fetchAnimeSearch()`.
- Loading / empty / error states all handled (`Loader2`, `CommandEmpty`, `WifiOff`).
- Route `/search` also exists as a full page. Header never links to it (palette only).
- Two separate trigger buttons render inside the navbar (desktop pill, mobile icon).

### 1.8 Icons / animation / breakpoints

- Icons: `lucide-react` only. No icon system of its own.
- Animation: `motion` v14 (`motion/react`), `tw-animate-css` keyframes, `EASINGS` in `config/animations.ts`.
- Breakpoints: Tailwind defaults (sm 640 / md 768 / lg 1024 / xl 1280). Header desktop nav switches at **`xl`**; bottom bar at **`md`**.

---

## 2. Findings

### 2.1 Visual problems

1. **Three navigation surfaces, three different item sets.**
   - Desktop row: 8 items (Home, Anime, Manga, Novels, Schedule, Library, History, Settings).
   - Drawer: same 8, grouped.
   - Bottom bar: 5 items — **hardcoded**, ignoring config.
   - Footer: all 8 again, in a different grouping.
2. **No scrolled state.** The header is `bg-surface-0/90 backdrop-blur-md transition-all` from the first pixel — no feedback when content passes beneath it, and `transition-all` animates properties that never change.
3. **`transition-all` on the header** is a needless repaint risk.
4. **Bottom-bar labels are `text-[0.62rem]` (≈9.9px)** — below comfortable readability for a primary navigation label.
5. **Drawer backdrop is `bg-black/10` + `backdrop-blur-xs`** — far too weak for a full-height drawer; content behind it reads as if the drawer were floating over live page.
6. **Brand mark SVG is labelled twice**: the `<a>` carries `aria-label="Zenkai home"` while the inner `<svg role="img" aria-label="Zenkai logo mark">` also announces itself.
7. **Footer is a flat link dump.** It renders `navSections` verbatim, which puts the **"Personal" group (History, Settings)** into a public global footer — private destinations in public navigation.

### 2.2 Navigation / IA problems

8. **`mobileNav` export is dead code.** The bottom bar hardcodes `Home, Anime, Manga, Schedule, Library`, while config marks `Schedule` as *not* `mobile`. Config and component have already drifted.
9. **`/novel` is unreachable from the mobile bottom bar** and from the desktop row it *is* present — but on mobile a user must open the drawer. Acceptable, but it means Novels has no persistent mobile home.
10. **No account area in the header** despite a working session model — authenticated users get no avatar, no profile link, no sign-out. Guests get no sign-in entry.
11. **No back affordance on immersive routes.** `/watch`, `/read`, `/read-novel` hide the bottom bar, so the *only* way out is browser-back or tapping the logo. No `ArrowLeft` exists in any player or reader component.

### 2.3 Broken / fabricated route and link targets

12. **`siteConfig.links.discord = "https://discord.gg"`** and **`telegram = "https://t.me"`** are **bare-domain placeholders**, not real invite/profile URLs. They are currently unused by any component — they must **not** be rendered in the footer until verified.
13. `siteConfig.links.github = "https://github.com/Nyyrox/Zenkai"` is a real, verifiable destination → safe to render.
14. **No About, Help, Contact, Feedback, Privacy, Terms or Copyright-reporting page exists.** The footer must not link to them. They are recorded below as missing requirements.
15. No `not-found.tsx` ⇒ unknown routes render an unbranded page outside the shell.

### 2.4 Mobile usability problems

16. **Bottom bar and footer both reserve bottom space** (`main` has `pb-28`, `footer` has `pb-24`) — two independent paddings compensating for one fixed bar. Fragile: any change to either breaks the other.
17. **Drawer trigger only appears below `xl`**, but the desktop nav row also requires `xl`. Between `md` and `xl` (tablet/laptop) users get the drawer — correct, but the drawer is styled as a *mobile* panel (`bg-[#0e0e13]/98`) with no differentiation.
18. **Search on mobile is an icon-only button** with `aria-label` but no visible affordance of what it does; acceptable, but it competes with the menu button of identical size and styling — two identical-looking 44px icons side by side.

### 2.5 Accessibility problems

19. Bottom-bar label size (see #5).
20. Nested/duplicated accessible name on the brand (see #6).
21. Footer has **no `<nav>` landmark** — link columns are bare `<div>`s, so screen-reader users cannot jump to footer navigation.
22. Drawer and desktop nav use different landmark labels (`"Primary Navigation"` vs `"Site Navigation"`) for overlapping content — confusing when both exist in the DOM at different breakpoints (only one is visible, but both can be announced).
23. Header search triggers are `<button>`s inside a `<span onClick className="contents">` — the wrapper span is a non-semantic click target. Harmless today (the button handles the event) but it is a latent pattern that breaks if the trigger content ever becomes non-button.
24. No `aria-expanded`/`aria-controls` owned explicitly by the drawer trigger (Radix supplies it — acceptable, noted for completeness).

### 2.6 Performance problems

25. `navbar.tsx` is a client component that transitively imports `SearchCommand` → `@tanstack/react-query` + the whole search API surface, plus Radix `Sheet`, plus `PWAProvider`. It ships on **every** route.
26. `mobile-nav.tsx` imports `motion/react` solely for a `layoutId` spring on the active hairline.
27. `footer.tsx` is correctly a **server** component — this must be preserved.
28. Auth is fetched **once** by `AuthProvider`; the header must consume `useAuth()` and must not trigger its own request. (Currently trivially true — the header doesn't use auth at all.)

### 2.7 Duplicate components

29. Two search triggers for one palette (desktop pill + mobile icon) duplicated inline in `navbar.tsx`.
30. PWA install button rendered **twice** — once inline in the header (desktop only) and once inside the drawer.
31. `page-header.tsx` is unrelated to the global header and must not be confused with it.

---

## 3. Recommended architecture

### 3.1 Information architecture

| Surface | Contents | Source |
|---|---|---|
| **Desktop top nav** | Home, Anime, Manga, Novels, Schedule, Library | `primaryNav` |
| **Account menu** (both guest and signed-in) | Profile · Library · History · Settings · Sign out / Sign in | `personalNav` + session |
| **Mobile bottom bar** | Home, Anime, Manga, Schedule, Library | `bottomNav` |
| **Mobile drawer** | Browse group + You group + PWA install | `navSections` |
| **Footer — Explore** | Home, Anime, Manga, Novels, Schedule, Library | `primaryNav` |
| **Footer — Account** | History, Settings | `personalNav` |
| **Footer — legal row** | © year · disclaimer · GitHub | `siteConfig` |

Rationale: the top bar becomes *discovery only* (what a streaming platform's chrome should say), personal destinations move behind the account avatar (standard, and it frees horizontal room), and History/Settings stay reachable everywhere via the footer and drawer.

### 3.2 Component structure

```
components/layout/
  navbar.tsx            Header shell: sticky, scrolled state, landmarks,
                        standard + immersive variants, and the drawer
                        (kept inline — see note below)
  header-search.tsx     both search triggers inside one SearchCommand
  account-menu.tsx      avatar + dropdown (guest / signed-in)
  mobile-nav.tsx        bottom bar, derives from bottomNav
  footer.tsx            GlobalFooter — stays a server component
  brand.tsx             a11y label fix only
```

**Deliberately not split out:**

- The drawer stays inside `navbar.tsx`. `test/responsive-design-system.test.ts`
  asserts that `navbar.tsx` itself contains `xl:hidden`, so moving the trigger
  to its own file would either break the test or force the responsive rule to
  be duplicated across two files.
- A separate `desktop-nav.tsx` was not created. The row is ~25 lines of
  presentational markup with no state of its own; splitting it would buy
  nothing.

Kept deliberately **separate**: auth/API logic stays in `AuthProvider` / `lib/api/*`; the header only reads context. No component touches the database.

### 3.3 Header variants

Implemented only where a real route needs it:

- **Standard** — everything else.
- **Immersive** (`/watch`, `/read`, `/read-novel`) — no desktop nav row, no PWA install, adds an explicit **Back** control. These routes genuinely have no back affordance today (finding #11).

Not built (no route justifies them): compact content header, authentication header, a variant configuration system.

### 3.4 Motion

- Header scrolled state: CSS transition on `background-color` / `border-color` only (replaces `transition-all`).
- Drawer: existing Radix slide + fade (already respects the global reduced-motion block).
- Bottom bar: keep `layoutId` hairline, but gate it behind `useReducedMotion()`.
- Footer: existing `transition-colors` on links. **No entrance animation** — the footer should be inert.

### 3.5 Missing requirements (reported, not faked)

These are **not** implemented because no route or verified resource exists. Each should be built before any footer link to it is added:

1. `/login` and `/register` routes (today sign-in lives inside `/settings`).
2. Privacy Policy page.
3. Terms of Service page.
4. About / Help / Contact / Feedback destinations.
5. Copyright or content-reporting route.
6. `not-found.tsx` (and ideally `error.tsx`) so unknown routes stay inside the branded shell.
7. Verified Discord and Telegram URLs — `siteConfig.links` currently holds bare-domain placeholders.

---

## 4. Constraints carried into implementation

- `test/responsive-design-system.test.ts` **pins**:
  - `globals.css` token hex values → do not change tokens.
  - `navbar.tsx` must contain `primaryNav.map`, `env(safe-area-inset-top)`, and an `xl:hidden` or `lg:hidden` drawer trigger.
  - `mobile-nav.tsx` must contain `env(safe-area-inset-bottom)`, `min-h-[44px]`/`h-11`, and `isImmersiveMedia`.
  - `layout.tsx` must keep `viewportFit: "cover"` and must not disable zoom.
  - `sheet.tsx` must keep `h-dvh` and `w-[min(88vw,22rem)]`; `dialog.tsx` must keep `max-h-[calc(100dvh-2rem)]`; `command.tsx` must keep `dvh`.
- Repo rule: **`main` branch only.**
- No new dependencies, no new accent colour, no new routes.
