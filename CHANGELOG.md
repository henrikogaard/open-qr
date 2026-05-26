# Changelog

All notable changes to Open-QR will go here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semver](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-05-27

### Added
- Per-QR analytics pages with daily scans, country/device breakdowns, and recent scan events.
- Campaign grouping for QR codes, including dashboard campaign summaries and filters.
- Optional custom slugs with admin-only enforcement by default.
- Public abuse-report flow and an admin report review queue.
- Optional destination interstitial before redirecting scanners.
- Admin privacy profile showing enabled external processors and privacy-notice guidance.
- Public `/status` page and `/api/v1/status` operational endpoint.
- Optional external URL reputation checks for Google Web Risk, URLhaus, PhishTank, and Spamhaus DBL.
- Optional Plausible Analytics integration with configurable domain and script URL.

### Changed
- QR preview/rendering now validates the target URL separately from the generated local short URL, so localhost previews are not blocked by IP-literal target protection.
- `db:init` now seeds the full runtime settings set, including the v1.2.0 feature flags.
- Privacy copy now says integrations are disabled by default and operator-controlled, rather than claiming no third parties can ever be enabled.

## [1.1.0] — 2026-05-26

Initial public release. Open-QR is now considered ready to run as a
multi-user hosted instance; the reference deployment lives at
[openqr.xyz](https://openqr.xyz).

### Added
- **Terms of Use page** at `/terms`, GDPR-friendly with an explicit
  prohibited-uses list (CSAM, malware, phishing, fraud, regulated goods,
  IP infringement, harassment, NCII, spam).
- **Terms acceptance gate** on the QR generator. Logged-in users persist
  acceptance against `terms_accepted_version`; anonymous users persist
  the same value in `localStorage`. Bumping `TERMS_VERSION` re-prompts
  everyone.
- **Resend email provider** as a first-class alternative to SMTP. Set
  `RESEND_API_KEY` and OTP emails go through Resend's HTTP API.
- **`MAIL_FROM`** env var as the provider-neutral `From:` address.
  `SMTP_FROM` still accepted as a fallback.
- **`PROTOCOL_HEADER` / `HOST_HEADER` / `ADDRESS_HEADER`** documented for
  reverse-proxy deployments so `Secure` cookies and rate-limit keying
  reflect user-facing values.
- **`MAX_QR_PER_USER` quota** enforced on every creation path including
  bulk import.
- **Bulk import caps**: 512 KB body, 1000 rows per request.
- **URL scheme allow-list**: `http`, `https`, `mailto`, `tel`, `sms` only.
  `javascript:`, `file:`, `data:`, `ftp:` are now rejected at every entry
  point including the live preview.
- **Style presets and copy-from-existing-QR** for logged-in users, in
  the create flow.
- **Live preview** in both the create and edit flows. Style changes redraw
  the QR without persisting until the user clicks Generate / Save.
- **Country and device-class breakdowns** in admin analytics. Country is
  derived from upstream-proxy headers (Cloudflare, Vercel, Fly, Netlify);
  device class is derived from User-Agent before it's hashed.
- **Bot detection** — Slack, WhatsApp, Telegram, and search-engine
  crawlers are classified as `bot` and surfaced separately in stats.
- **API keys**: issue and revoke tokens from the dashboard; accepted as
  `Authorization: Bearer oqk_…` or `X-API-Key: oqk_…` on `/api/*`.
- **CSV bulk import** at `/dashboard/bulk` with per-row results.
- **Rate limiting** on `/api/*` (per user / per IP-hash, sliding 60s
  window), 429 with `Retry-After` + `X-RateLimit-*` headers.
- **LICENSE** (MIT) and **CONTRIBUTING.md** added to the repo root.

### Changed
- **Cookie `Secure` flag** is now set only when the request is actually
  HTTPS. Previously hardcoded `true`, which silently broke login on
  local HTTP installs.
- **SVG export** now renders the decorative border, center text, and
  center image — previously these only appeared in PNG output. Center
  images are fetched and base64-inlined so the SVG is self-contained.
- **QR images encode the short URL** (`/go/<code>`) rather than the raw
  target. Scans now route through the redirector and get logged. Existing
  QR images created before this change still encode the direct target.
- **Templates actually do something** — `rounded`, `minimal`, `colorful`,
  `dark` now render visually distinct module shapes / colour treatments.
  Previously the field was stored but ignored by the renderer.
- **scan_logs** now populates `country` and a new `device_class` column.
  Migration 002 adds the column on upgrade.
- **`SMTP_PORT=465`** now correctly uses implicit TLS; other ports use
  STARTTLS.

### Removed
- **`SESSION_SECRET`** env var. It was declared in `.env.example` and
  `docker-compose.yml` but never read by the codebase. Sessions use
  opaque 256-bit random IDs.
- **`uploads` volume mount** from docker-compose — no code referenced it.

### Fixed
- Test cleanup in `qr.test.ts` was violating the `scan_logs → qr_codes`
  foreign key. Full suite was failing in `beforeEach`; now 30/30 green.
- Dockerfile didn't copy migration SQL into the runtime image, so a
  fresh container would crash on first request with `ENOENT` on the
  migrations directory.
- Tailwind directives were emitted to the browser unprocessed because
  there was no `postcss.config.js`. The entire UI rendered unstyled.
- HttpError thrown from the QR endpoint's try block was being swallowed
  and re-thrown with a generic `"Error: 400"` message.

### Security
- URL scheme allow-list closes the obvious `javascript:` / `file:` /
  `data:` QR-payload vector.
- Bulk import body cap (512 KB) + per-user quota close the trivial
  anonymous DoS / disk-exhaustion vector.
- Cookie `Secure` flag now correctly applied behind a TLS-terminating
  proxy when `PROTOCOL_HEADER=x-forwarded-proto` is set.

## [1.0.0] — unreleased

Internal pre-release. Never tagged or pushed publicly.
