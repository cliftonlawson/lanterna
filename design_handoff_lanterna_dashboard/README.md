# Handoff: Lanterna — Video & Photo Delivery Dashboard

## Overview
Lanterna is a delivery platform for wedding videographers (and any film/photo creator).
The vendor uploads films and photos into per-client **galleries**, brands the client-facing
page, and shares one link. This handoff covers the **vendor-side dashboard**: managing
galleries, uploading/organizing media, editing a film, branding, and delivery.

The aesthetic is intentionally cinematic: deep-ink dark UI, a warm "lantern" amber accent,
a soft ambient glow, and generous spacing. A full **light theme** is included.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype that
shows the intended look, layout, and behavior. They are **not** production code to copy
verbatim. The task is to **recreate these designs in the target codebase's environment**
(React, Vue, SwiftUI, etc.) using its established patterns, component library, and routing —
or, if no environment exists yet, to pick an appropriate stack (React + your CSS approach of
choice works well here) and implement them there.

The prototype is authored as a single component with inline styles for streaming/preview
reasons; in a real codebase this should be broken into proper components and the design tokens
below should live in your theme system, not inline.

## Screenshots
Rendered reference images live in `screenshots/` (both themes + key screens):
- `01-all-galleries-dark.png` — main dashboard, dark theme (status badges, search + sort)
- `02-all-galleries-light.png` — main dashboard, light theme
- `03-create-gallery-modal.png` — the New Gallery setup step (name, client, date, type, slug, access)
- `04-gallery-studio-videos.png` — Gallery Studio, Videos tab + sub-nav
- `05-deliver-preflight-history.png` — Deliver tab: status, pre-flight checklist, link + send
- `06-photos-albums.png` — Photos tab, album chips + Manage/Select
- `07-settings-access-password.png` — Settings: gallery details + Access + password field
- `08-video-detail-drawer.png` — the stacked film-card edit drawer (wired actions, live-save)
- `09-account-billing-storage.png` — Account: profile, plan & billing, team, storage states
- `10-vendor-dashboard.png` — branding & delivery; **editable** studio profile (name/tagline/logo)
- `11-deliver-gate-draft.png` — Deliver gate on a draft with 0 films (disabled Send, amber checks)

For anything not pictured, open `Lanterna Dashboard.dc.html` in a browser to see it live.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, and interactions are final and
intentional. Recreate the UI faithfully using the exact tokens in the Design Tokens section.
Imagery in the prototype uses gradient placeholders — replace with real thumbnails/stills.

## Theming (read first — it drives everything)
The entire app is driven by a set of CSS custom properties switched between two themes via a
**Dark / Light toggle** (top-right of the All Galleries header). Implement these as theme
tokens; almost every surface/text/border value references one.

The **ambient glow** behind the UI is **vendor-facing only**: it renders on the Vendor
Dashboard in dark mode, and as a soft full-app haze in light mode. It is a cool periwinkle/blue
haze (NOT the amber accent). Gallery/upload/studio screens have no glow in dark mode.

The **brand accent** (`#FFB24D` amber) is global app chrome. Separately, each **gallery** has
its own **client-facing accent** (default amber, user-selectable incl. a color picker and a
Dark/Light client theme) that only affects that gallery's client preview — it does not change
app chrome.

## Screens / Views

### 1. App shell — left sidebar (persistent)
- **Width** 272px, full height, `--sidebar` gradient background, right border `--border`.
- **Logo block**: animated lantern mark (SVG, ~42px) + "Lanterna" (19px/700) + studio name
  (12px `--muted`). The lantern mark is a lantern whose flame is a play triangle — see
  `#lant` SVG symbol in the file.
- **All Galleries** nav button (active state = `navOn`), trailing count badge.
- **Projects** group: Weddings / Engagements / Portraits, each a nav row with a colored dot
  and active count. Clicking filters the gallery grid.
- **Vendor Dashboard** nav button sits **below** the Projects group (deliberate placement).
- **User card** pinned to bottom: avatar (gradient), name, email, chevron.
- Active nav style (`navOn`): dark = amber tint gradient bg + `#FFB24D` text; light = blue
  tint gradient + `#1577C0` text.

### 2. All Galleries (main dashboard)
- **Header**: kicker (13px `--muted`) + H1 "All Galleries" (30px/700, -0.025em). Right side:
  a **Dark/Light segmented toggle** and a **New Gallery** primary CTA.
- **Stat cards** (4-up grid, 20px gap): icon chip (46px, tinted), big value (32px/700,
  tabular-nums), label (13.5px `--muted`); each has a soft colored glow blob top-right.
  Stats: Total galleries, Total videos, Total views, Storage used.
- **Controls row**: Active/Archived segmented tabs (left), "Last updated" sort button (right).
- **Gallery grid**: `repeat(auto-fill, minmax(300px, 1fr))`, 24px gap. Card = 20px radius,
  `--surface-solid` bg, `--border`. Thumbnail `aspect-ratio:16/10` with a gradient + dark
  scrim; top-left "N videos" pill (play glyph). Body: name (16.5px/600), kebab, then date +
  views with eye icon. Hover: translateY(-4px), amber border, lift shadow.

### 3. Gallery Studio (opens when you click a gallery)
Breadcrumb header (Back button, lantern + "Galleries / {name}") and a primary **Deliver** CTA.
A **secondary left sub-nav** (214px, sticky) groups:
- **Upload**: Videos (count), Photos (count)
- **Design**: Layout, Heading, Background, Music, Styles
- **Publish**: Settings, Deliver

Active sub-nav item uses the same `navOn` style. Content panels:

- **Videos**: header count + grid (`minmax(248px,1fr)`, 22px gap). Cards like gallery cards but
  with a centered hover play button and a duration pill. Clicking a card opens the **Video
  Detail drawer** (screen 4).
- **Photos**: a banner ("Films & photos live in this one gallery — single link …"), a row of
  **album filter chips** (All + each album, with counts) plus a dashed **+ New album** chip and
  a **Select** button. Then a **masonry grid** (`columns:5; column-gap:14px`) of photo tiles
  with varied aspect ratios; first tile is a dashed **Add photos** tile.
  - **Select mode**: each tile shows a circular checkbox; selecting reveals a floating bottom
    action bar ("N selected" + **Move to…** + cancel). The Move popover has two sections —
    **Album in this gallery** (re-categorize) and **Another gallery** (move out). A success
    **toast** confirms. Moving updates counts live.
- **Layout**: a row that opens a **full-screen layout chooser** (templates) — see file.
- **Heading**: Title + Subtitle inputs (left), live client preview (right).
- **Background**: Image/Video source toggle, an upload dropzone (adapts label to image/video),
  and a sample-image picker. (No solid-color option — image or video only.)
- **Music**: **upload-your-own** track (MP3/WAV) panel + a **Featured film** radio list (which
  film the music plays over). No stock-track list.
- **Styles**: client **Theme** (Dark/Light) segmented, client **Accent** (preset swatches +
  native color picker), Typography (Hanken Grotesk / Playfair Display / Georgia), and **Top
  buttons** toggles (Share / Embed / Download) — all reflected live in the preview.
- **Settings**: gallery name, gallery link (slug), Public/Password/Private access segmented,
  allow-download + auto-expire toggles.
- **Deliver**: "Ready to deliver" hero, copy-link field (Copy → "Copied!"), send-to-clients
  email field.

**Live client preview** (right column on Design tabs): a browser-chrome card showing the
client gallery — logo + studio name, the enabled top buttons, the heading title/subtitle, a
"Watch film" button in the gallery accent, and a 3-up thumbnail strip. It re-renders as you
edit heading/background/theme/accent/font/buttons. Honors the gallery's Dark/Light client
theme (scrim + text colors flip).

### 4. Video Detail drawer (stacked "film card" — deliberately NOT a split/right-rail layout)
Full-screen dark scrim (`rgba(6,4,10,0.84)`, blur). Top bar: scope label
("{gallery} · Film N of M") left; a **Close** button (always light-on-glass since the scrim is
always dark). Centered card (max-width 940px, scrollable):
- **Hero player** (height 358px, gradient bg, centered play button). The **title is edited
  inline on the film** (lower-third input, 27px/700) with a char counter; metadata chips
  (date, size, views, downloads) below.
- **Action bar**: Share / Embed / Download / Replace video (chip buttons using `--chip` bg +
  `--text2`) and a primary **Save changes**.
- **Two-column body**: left = **Thumbnail** (current + a 6-frame filmstrip picker +
  "Upload your own image"); right = **Details** (Public-in-gallery + Allow-download toggles,
  Tags input, Delete link).

### 5. Upload (films and photos)
Reached from New Gallery, Add Video, or Add Photos. Header: Back, kicker ("Uploading to" /
"Adding photos to"), gallery name, and an **Open gallery** CTA.
- **Photo mode only**: an **Add to album** selector (album chips + inline **+ New album**
  create with ✓/✕, Enter/Esc).
- **Dropzone**: dashed, lantern mark, title/hint adapt to films vs photos, a Select files/
  Select photos button, and Dropbox / Google Drive import buttons.
- **Drag anywhere**: dragging files over the window shows a full-screen "Drop to upload"
  overlay.
- **Queue**: rows with thumbnail, filename (tabular), size, a progress bar, and status —
  Uploading (shimmer + %), Paused (resume), Processing/Optimizing, Done. Pause/resume + remove
  controls. Films when done are clickable → open the detail drawer; photos show "Added to
  {album}". Progress is **simulated** in the prototype (a setInterval ticker).
- A floating **background-upload pill** (bottom-right) appears when uploads are active and
  you've navigated away, showing aggregate progress; clicking returns to the queue.

### 6. Vendor Dashboard
Branding & delivery. Left column: Studio profile (logo, name, tagline; Replace logo / Save),
Brand accent swatches, Custom domain (connected state), Client-space toggles
(Allow downloads / Password protect / Studio watermark). Right column: a sticky **live client
preview** card ("Powered by Lanterna" footer). This screen shows the warm ambient glow in dark
mode.

## Lifecycle & flows (added after the flow audit)
These close the gaps an earlier audit found. All reuse the existing tokens/components.

- **Gallery creation (before upload).** New Gallery opens a setup modal — name, client/couple,
  event date, project type (drives sidebar grouping), auto-generated editable slug, and access
  (Public / Password / Private; password field shown when Password). Submit creates a real record
  in the right project group and routes into upload **for that gallery**; "Open gallery" then opens
  it (never a fallback). Cancel creates nothing.
- **Gallery status.** Every gallery carries `draft → published → delivered`, shown as a badge on
  cards and in the Studio header. The Deliver tab runs a **pre-flight** (access set, ≥1 film, cover
  chosen) and only reads "Ready to deliver" when all pass.
- **Delivery record (proof of delivery).** The Deliver tab logs each send: recipient, sent/opened
  status + timestamps, with resend / copy-link / remove and an empty state. "Send to clients"
  validates emails, supports multiple recipients (comma-separated) + an optional message, and writes
  to the record with toast confirmation.
- **Card menus + lifecycle.** Working kebab menus on gallery cards (rename, duplicate, copy link,
  archive, delete) and video cards (rename, set as cover, copy link, replace, delete). Archive moves
  a gallery to the Archived tab; archived cards open **restore-first**; delete always confirms.
  Menus stop propagation so they don't trigger the card's open.
- **Access & password.** Password access reveals a set/change password field (Settings + create),
  with set/unset indication; unset warns it blocks clients.
- **Account, billing, storage.** The sidebar user card opens an Account screen: profile, plan &
  billing, team, notifications, logout, and a storage panel with a usage bar plus **near-cap**
  (warn) and **over-cap** (uploads paused) states + upgrade path. Separate from the Vendor Dashboard
  (which stays client-facing branding only).
- **Save model.** One model everywhere: **live-save** with a "Saving… / All changes saved"
  indicator (editor, drawer, vendor, settings). No ambiguous Save buttons; Close is unambiguous.
- **Per-film actions (drawer).** Share (copy link), Embed (copy snippet), Download, Replace video
  (swaps file, keeps metadata/position), Delete (confirm → back to grid).
- **Search & sort.** All Galleries: live search (name / client / date) + working sort (last updated,
  date created, name, most viewed), with no-match empty state.
- **Album management.** Photos tab "Manage" panel: rename, reorder, delete albums (delete moves
  photos to All/uncategorized, with confirm); reflected across chips, uploader selector, Move menu.
- **Empty / first-run states.** Zero galleries, empty Videos, empty Photos (per album), and
  no-search-match — each points to the right next action.
- **Cross-cutting.** Destructive actions confirm; success uses the shared toast; the prototype's
  upload progress is simulated (wire to real upload/transcode events with pause/resume/auto-resume).

## Round 2 — enforcement & editable branding (latest)
These refine the flows above; same tokens/patterns, no new visual language.

- **Pre-flight is a real gate (not advisory).** Hard block: a gallery with **zero films** can never be
  sent or published — the Send button is disabled with an amber helper ("Add at least one film to
  deliver"), the draft→published transition is blocked, and the studio-header Deliver CTA dims to
  match (the two entry points never disagree). Soft checks (cover chosen, password set when access is
  Password): Send stays enabled but clicking opens a **"Send anyway?"** confirm. All checks pass →
  unchanged behavior. Failing checks use the existing amber warning treatment.
- **`delivered` is reachable. Chosen trigger: first successful send.** A gallery advances
  `draft/published → delivered` when at least one recipient is successfully sent. Re-sending a
  `delivered` gallery does not regress it. The badge updates live on the card and Studio header.
  (If production prefers "delivered = client opened it," switch the trigger to the first recipient
  whose status flips to `opened` — single point of change in the send handler.)
- **Vendor studio profile is editable.** Studio name + tagline are real inputs; Replace logo and
  Save changes are wired (live-save + "Saved" indicator + toast). Edits flow live to the sidebar, the
  on-screen client preview, and the gallery client preview. This is the studio's **client-facing
  brand** — distinct from the Account screen's owner profile.
- **Stubs wired:** Log out → confirm + auth-handoff toast; Invite collaborator → email + role modal;
  "Upload your own image" custom thumbnail → same path as Replace video. Edit profile / Manage
  payment / Invoices / Upgrade remain intentional stubs that wire to profile editing and the billing
  provider in production.

## Interactions & Behavior
- **Routing** is state-driven (`view` + `studioTab`), not URL-based in the prototype — wire to
  your router. Views: galleries, gallery (studio), upload, vendor, account; overlays: create-gallery
  modal, video detail
  drawer, layout chooser, drag overlay.
- **Theme toggle** swaps the full token set; transitions on bg/color ~.3s.
- **Hover** lifts on cards (translateY(-4px) + amber border + shadow); buttons brighten.
- **Upload progress**: simulated; in production wire to real upload events (uploading →
  processing/transcoding → done), with pause/resume/cancel and auto-resume on disconnect.
- **Photo select → move**: multi-select, move to another album (re-tag) or another gallery
  (removes from current), toast confirmation, live count updates.
- **New album**: inline create from both the uploader's "Add to album" and the Photos tab;
  appears immediately in album chips, uploader selector, and the Move menu (one shared list).
- **Copy link** shows transient "Copied!" feedback.

## State Management
Prototype uses one component with a single state object. Key state to model in production:
- `view`, `studioTab` — navigation
- `activeId`, `tab` (active/archived), `folder` (project filter)
- `appTheme` ('dark' | 'light')
- `uploads[]` ({ id, name, size, pct, status, speed, kind: 'film'|'photo', cat })
- `editor` (per-gallery client branding: type, title, subtitle, bgKind, bgImage, fontName/font,
  accent, theme, musicTrack, featured, privacy, buttons{share,embed,download},
  allowDownload, autoExpire)
- `detail` ({ open, tab, index, total, video }) + `detailTitle`
- Photos: `albums[]`, `photoCat`, `selected[]`, `photoCatOverride{}`, `movedIds[]`,
  `newAlbumWhere`, `newAlbumName`
- `vendor` toggles, `copied`, `toast`, `dragging`
- Data fetching (production): galleries list, gallery media (films + photos by album), upload
  session/status, vendor branding.

## Design Tokens

### Dark theme
- bg `#0C0A12`, bg2 `#0B0910`, input `#0C0A12`
- surface `linear-gradient(180deg,#16121F,#100D18)`, surface-solid `#100D18`
- sidebar `linear-gradient(180deg,#100D17,#0B0910)`
- text `#EDE7DD`, text2 `#C7C0B4`, muted `#8E8678`, dim `#6F6856`
- border `rgba(201,168,106,0.12)`, border-strong `rgba(201,168,106,0.16)`
- hover `rgba(255,255,255,0.05)`, raise `rgba(255,255,255,0.03)`, chip `rgba(255,255,255,0.06)`
- cta `linear-gradient(135deg,#FFC56B,#FF7A2F)`, cta-shadow `0 6px 24px rgba(255,122,47,0.32)`

### Light theme
- bg `#F3EDE3`, bg2 `#E9E1D3`, input `#FFFFFF`
- surface `linear-gradient(180deg,#FFFFFF,#FBF7EF)`, surface-solid `#FFFFFF`
- sidebar `linear-gradient(180deg,#FFFDF7,#EFE8DA)`
- text `#241B2E`, text2 `#52493B`, muted `#7E7668`, dim `#A99F8E`
- border `rgba(74,54,40,0.14)`, border-strong `rgba(74,54,40,0.20)`
- hover `rgba(40,28,16,0.05)`, raise `rgba(120,88,40,0.05)`, chip `rgba(40,28,16,0.07)`
- cta `linear-gradient(135deg,#6D8AC1,#169FEC)`, cta-shadow `0 6px 24px rgba(22,159,236,0.30)`
- nav-active text `#1577C0`

### Shared
- Brand accent (app): `#FFB24D`. Client accent presets: `#FFB24D #FF7A2F #C9A86A #E8843C
  #7BC47F #7AA7E8` + free color picker.
- Glow (vendor/light only): periwinkle radial blends, e.g. `rgba(96,140,235,…)`,
  `rgba(22,159,236,…)`.
- Success green `#7BC47F`.
- Radii: chips/pills 99px; buttons 11–13px; cards 18–22px; inputs 11px.
- Type: **Hanken Grotesk** (UI, weights 400–800). **Playfair Display** available as a client
  gallery heading option. Sizes: H1 30px, section 16–17px, body 13.5–15px, meta 12–12.5px.
  Never below 12px.
- Motion: hovers .2–.25s ease; theme .3s; lantern "breathe" glow keyframe ~5s; progress bar
  shimmer 1.6s.

## Assets
- **Lantern logo**: inline SVG (`#lant` full-color, `#lantMono` monochrome symbols in the
  file). Recreate as an SVG component. No external logo files.
- **Icons**: inline stroke SVGs (feather-style, ~2px stroke). Swap for your icon set.
- **Imagery**: gradient placeholders stand in for thumbnails/stills/photos — replace with real
  media. Photo tiles use varied aspect ratios for a masonry feel.
- **Fonts**: Google Fonts — Hanken Grotesk, Playfair Display.

## Files
- `Lanterna Dashboard.dc.html` — the full prototype (all screens, theming, interactions).
- `support.js` — runtime that powers the prototype's component/templating. **Reference only**;
  not needed in the target codebase.

To explore the prototype, open `Lanterna Dashboard.dc.html` in a browser. Use the Dark/Light
toggle (top-right) to see both themes; click a gallery to enter the Studio; open a film to see
the detail drawer; use Add Photos → album selector to see the photo flow.
