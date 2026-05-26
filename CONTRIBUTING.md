# Contributing to Open-QR

Thanks for your interest. The project is small and welcomes bug reports,
focused fixes, and feature proposals.

## Ground rules

- **MIT, no CLA.** Contributions are accepted under the same MIT license as
  the rest of the project ([LICENSE](LICENSE)). You retain copyright in your
  contributions — there is no Contributor License Agreement.
- **One concern per PR.** Smaller diffs are easier to review and land.
- **Don't break the test suite.** `npm run test`, `npm run test:e2e`, and
  `npx svelte-check` should all be clean.

## Development setup

```bash
git clone https://github.com/henrikogaard/open-qr.git
cd open-qr
npm install
npm run dev
```

Open <http://localhost:5173>. With no SMTP configured, OTP login codes are
printed to the dev-server stdout — the first email that completes login is
promoted to admin automatically.

## Running checks locally

```bash
npm run test       # vitest unit tests
npm run test:e2e   # Playwright E2E (builds + boots a preview server)
npx svelte-check   # types + a11y
npm run build      # production build
```

CI runs the same set on every PR.

## What kinds of PRs are likely to be merged

- Bug fixes with a regression test.
- Small, self-contained features that match the project's stance: privacy by
  default, no third-party calls during scans, runs as a single container.
- Documentation fixes — typos, clarifications, missing operator notes.

## What's less likely

- New third-party integrations that phone home on scans.
- Large rewrites that touch many areas at once — open an issue to discuss
  before starting.
- Features that only make sense if you're not self-hosting.

## Security

If you find a vulnerability, please **do not open a public issue**. Email the
maintainer through the address on the [Terms page](https://openqr.xyz/terms)
or via the contact listed on the maintainer's GitHub profile.

## Hosted instance

The maintainer runs [openqr.xyz](https://openqr.xyz) as a reference instance.
It uses this codebase plus a `TERMS_OPERATOR` / `TERMS_CONTACT_EMAIL`
configuration; see the README's "Operations" section if you want to run your
own instance with the same posture.
