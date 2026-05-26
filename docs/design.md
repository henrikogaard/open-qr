# Open-QR Design System

A modern, minimal, terminal-inspired design language for a self-hosted QR tool.
Dark theme is the **canonical experience** (Gruvbox Dark Hard). Light theme is a
clean, warm, paper-like counterpart that preserves the same hierarchy and rhythm.

---

## 1. Design Principles

1. **Content first.** The QR code and the URL are the heroes. Chrome stays quiet.
2. **Calm density.** Generous spacing, restrained color, one strong accent per view.
3. **Honest surfaces.** No glassmorphism, no synthetic gradients, no fake depth.
   Borders + flat elevation only.
4. **Typographic system, not decoration.** Use weight, size, and tracking — not
   color — to create hierarchy.
5. **Two themes, one structure.** Every component renders identically in dark
   and light; only tokens change.
6. **Accessible by default.** AA contrast minimum on every text/background pair,
   focus rings always visible, motion respects `prefers-reduced-motion`.

---

## 2. Color Tokens

All colors are defined as CSS custom properties with `R G B` triplets so they
compose with Tailwind's `<alpha-value>` syntax (`bg-bg/80`, `text-fg/60`).

### 2.1 Dark theme — Gruvbox Dark Hard

| Token            | RGB                 | Hex       | Use                                  |
| ---------------- | ------------------- | --------- | ------------------------------------ |
| `--bg`           | `29 32 33`          | `#1d2021` | App background                       |
| `--bg-soft`      | `40 40 40`          | `#282828` | Section background                   |
| `--surface`      | `50 48 47`          | `#32302f` | Cards, inputs                        |
| `--surface-2`    | `60 56 54`          | `#3c3836` | Hover, raised surface                |
| `--surface-3`    | `80 73 69`          | `#504945` | Pressed, dividers heavy              |
| `--border`       | `60 56 54`          | `#3c3836` | Default border                       |
| `--border-strong`| `102 92 84`         | `#665c54` | Input border, emphasized divider     |
| `--fg`           | `235 219 178`       | `#ebdbb2` | Primary text                         |
| `--fg-muted`     | `189 174 147`       | `#bdae93` | Secondary text                       |
| `--fg-dim`       | `146 131 116`       | `#928374` | Tertiary text, placeholders          |
| `--accent`       | `250 189 47`        | `#fabd2f` | Primary action, brand mark           |
| `--accent-fg`    | `29 32 33`          | `#1d2021` | Text on accent                       |
| `--accent-hover` | `254 128 25`        | `#fe8019` | Hover state for accent               |
| `--success`      | `184 187 38`        | `#b8bb26` | Active, positive                     |
| `--warning`      | `250 189 47`        | `#fabd2f` | Caution                              |
| `--danger`       | `251 73 52`         | `#fb4934` | Destructive, errors                  |
| `--info`         | `131 165 152`       | `#83a598` | Neutral information, links secondary |

### 2.2 Light theme — Warm Paper

A muted, warm off-white palette inspired by Gruvbox Light but pulled back for a
minimalist, editorial feel.

| Token            | RGB                 | Hex       |
| ---------------- | ------------------- | --------- |
| `--bg`           | `251 249 244`       | `#fbf9f4` |
| `--bg-soft`      | `244 240 232`       | `#f4f0e8` |
| `--surface`      | `255 255 255`       | `#ffffff` |
| `--surface-2`    | `237 230 215`       | `#ede6d7` |
| `--surface-3`    | `213 204 184`       | `#d5ccb8` |
| `--border`       | `229 220 199`       | `#e5dcc7` |
| `--border-strong`| `189 174 147`       | `#bdae93` |
| `--fg`           | `40 40 40`          | `#282828` |
| `--fg-muted`     | `80 73 69`          | `#504945` |
| `--fg-dim`       | `124 111 100`       | `#7c6f64` |
| `--accent`       | `214 93 14`         | `#d65d0e` |
| `--accent-fg`    | `251 249 244`       | `#fbf9f4` |
| `--accent-hover` | `175 58 3`          | `#af3a03` |
| `--success`      | `121 116 14`        | `#79740e` |
| `--warning`      | `181 118 20`        | `#b57614` |
| `--danger`       | `157 0 6`           | `#9d0006` |
| `--info`         | `7 102 120`         | `#076678` |

### 2.3 Color usage rules

- **One accent per surface.** Buttons, links, focus rings share `--accent`.
- **State colors are flat.** Use the solid token at 100% for text/icons; use the
  same token at `/15` opacity for backgrounds (badges, alerts).
- **No raw Tailwind palette colors** (`bg-blue-500`, `text-gray-700`) in app
  code — tokens only. Native form controls inherit via `accent-color`.

---

## 3. Typography

- **Sans (UI):** `Inter`, system-ui, -apple-system, "Segoe UI", sans-serif.
- **Mono (codes, hashes, short URLs):** `JetBrains Mono`, ui-monospace, Menlo,
  monospace.

### Scale (rem / px @ 16px root)

| Token       | Size           | Line | Use                       |
| ----------- | -------------- | ---- | ------------------------- |
| `text-xs`   | 0.75 / 12      | 1.4  | Meta, badges              |
| `text-sm`   | 0.875 / 14     | 1.5  | Body small, labels        |
| `text-base` | 1.00 / 16      | 1.6  | Body                      |
| `text-lg`   | 1.125 / 18     | 1.5  | Lead paragraphs           |
| `text-xl`   | 1.25 / 20      | 1.4  | Section subhead           |
| `text-2xl`  | 1.5 / 24       | 1.3  | Card title                |
| `text-3xl`  | 1.875 / 30     | 1.2  | Page title                |
| `text-4xl`  | 2.5 / 40       | 1.1  | Hero (mobile)             |
| `text-5xl`  | 3.5 / 56       | 1.05 | Hero (desktop)            |

- **Weights:** 400 body, 500 UI, 600 emphasis, 700 headings (sparingly).
- **Tracking:** `-0.02em` on headings ≥ `text-3xl`. `0.08em` uppercase on eyebrow
  labels (`text-xs` uppercase).
- **Numerals:** `font-variant-numeric: tabular-nums` on metrics, scan counts,
  tables.

---

## 4. Spacing & Layout

- 4 px base unit. Tailwind spacing scale.
- **Container widths:** `max-w-3xl` for forms, `max-w-5xl` for editors,
  `max-w-7xl` for dashboards / marketing pages.
- **Section rhythm:** `py-20` between marketing sections (`py-12` mobile),
  `py-10` between app sections.
- **Card padding:** `p-6` default, `p-8` for primary cards.
- **Grid gaps:** `gap-6` cards, `gap-4` form fields, `gap-2` inline controls.

---

## 5. Radii, Borders, Elevation

- **Radii:** `rounded-md` (6px) inputs/buttons, `rounded-lg` (10px) cards,
  `rounded-xl` (14px) hero panels, `rounded-full` badges/avatars.
- **Borders:** 1px `--border` default. 1px `--border-strong` on inputs.
  Dividers use `--border`, never `currentColor`.
- **Elevation:** No drop shadows in dark mode (relies on surface ladder).
  Light mode uses one subtle shadow: `0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.04)`.

---

## 6. Components

### 6.1 Buttons

| Variant     | Background     | Foreground       | Border           | Hover                       |
| ----------- | -------------- | ---------------- | ---------------- | --------------------------- |
| `primary`   | `--accent`     | `--accent-fg`    | none             | bg `--accent-hover`         |
| `secondary` | `--surface-2`  | `--fg`           | `--border-strong`| bg `--surface-3`            |
| `ghost`     | transparent    | `--fg-muted`     | none             | bg `--surface-2`, fg `--fg` |
| `danger`    | transparent    | `--danger`       | `--danger`/40    | bg `--danger`/15            |

- Height 40px (default), 32px (compact), 48px (large).
- Always show a visible focus ring: `outline: 2px solid var(--accent); outline-offset: 2px`.
- Disabled: `opacity: 0.5`, `cursor: not-allowed`, no hover state.

### 6.2 Inputs / Selects / Textareas

- Background `--surface`, border `--border-strong`, text `--fg`, placeholder `--fg-dim`.
- Focus: border `--accent`, soft ring `0 0 0 3px rgb(var(--accent) / 0.25)`.
- Native color and date inputs adopt `--surface-2` and tokenized border.
- Labels: `text-sm font-medium text-fg-muted`, 4px below sits the control.

### 6.3 Cards

- `bg-surface border border-border rounded-lg p-6`.
- Hover (interactive cards only): `border-border-strong`, slight `bg-surface-2`.
- Section header inside card: `text-lg font-semibold` + `text-sm text-fg-muted`
  description.

### 6.4 Badges / Pills

- `text-xs font-medium px-2 py-0.5 rounded-full`.
- Status background uses token `/15`, text uses the solid token.
  - `success`, `warning`, `danger`, `info`, `neutral` (= `--fg-muted`).

### 6.5 Navigation

- Top bar: `h-16`, `border-b border-border`, `bg-bg/80 backdrop-blur` (subtle).
- Logo lockup: square 28×28 accent tile with `□` glyph + wordmark
  `Open<span class="text-accent">·</span>QR` in 600 weight.
- Nav links: `text-sm text-fg-muted hover:text-fg`. Active link uses `text-fg`
  and 2px accent underline.

### 6.6 Tables

- Header row: `text-xs uppercase tracking-wider text-fg-dim`.
- Cells: `py-3 px-4 text-sm`, divider `border-b border-border`.
- Hover row: `bg-surface-2`.
- Mono font for `short_code`, hashes, IDs.

### 6.7 Alerts

- 1px border, token `/40`. Background token `/10`. Padded `p-4 rounded-md`.
- Icon at left in solid token color.

### 6.8 Theme toggle

- Icon button in navbar (sun / moon). Persists choice in `localStorage` under
  `open-qr-theme` (`dark` | `light` | `system`). Defaults to `system` →
  resolves via `prefers-color-scheme`.
- Inline boot script in `app.html` applies the class before first paint to
  eliminate flash.

---

## 7. Motion

- Transitions: `transition-colors duration-150 ease-out` on interactive surfaces.
- Hover lifts are color-only — no transforms.
- Page transitions: none. Trust SvelteKit's default snappiness.
- Respect `@media (prefers-reduced-motion: reduce)` — disable all transitions.

---

## 8. Page Templates

### 8.1 Landing (`/`)

1. **Navbar** (sticky, transparent over bg).
2. **Hero** — Eyebrow label, h1 in `text-5xl`, supporting paragraph, two CTAs
   (primary: "Create a QR", secondary: "View on GitHub").
3. **Generator panel** — The actual `<QRGenerator />`. Two-column on lg:
   form + live preview.
4. **Features grid** — 6 cards, 3×2 on lg. Icon + title + 2-line description.
5. **How it works** — 3-step numbered list, monospace step numerals.
6. **Privacy & tracking** — Two-column: left a heading + lede, right a bullet
   list of what is and isn't tracked.
7. **Self-hosting / API teaser** — Code block snippet of a `curl` to the API.
8. **Footer** — Wordmark, version, MIT license link, GitHub link.

### 8.2 Auth (`/login`, `/verify-otp`)

- Centered single card, `max-w-md`. Logo above heading.

### 8.3 Dashboard (`/dashboard`)

- Page header with title + primary action.
- Filter row (segmented control instead of native select).
- Card grid of `QRCard`s. Empty state shows a dashed-border drop card.

### 8.4 Edit QR (`/dashboard/qr/[code]`)

- Two-column on lg: form on the left, sticky preview aside on the right.

### 8.5 Admin (`/admin`)

- Same header pattern. Tab strip styled like terminal tabs: bottom border on
  inactive, accent underline on active, mono labels.
- Stats grid uses metric cards (label + tabular numerals).

### 8.6 `/go/[code]` password gate

- Single centered card, terminal-ish padlock glyph, mono short code echoed.

---

## 9. Iconography

Use inline SVG (Lucide-style: 1.5px stroke, 24×24). Never import an icon
library — define icons inline at usage site to keep bundle small. Stroke uses
`currentColor`.

Core icons: `qr-code`, `copy`, `edit`, `trash`, `power`, `shield`, `eye`,
`eye-off`, `sun`, `moon`, `lock`, `arrow-right`, `check`, `x`, `external-link`.

---

## 10. Anti-patterns (do not do)

- Don't use Tailwind palette colors directly (`bg-gray-50`, `text-blue-600`).
- Don't add gradients, glass blurs, or neon glows.
- Don't introduce a third accent color.
- Don't use transform-based hover effects (`scale`, `translate`).
- Don't ship icons via webfonts.
- Don't lock the user into one theme — always offer the toggle.
