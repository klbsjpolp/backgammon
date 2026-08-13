---
description: Run the full CI gate (format, lint, typecheck, test, build) and fix what fails
allowed-tools: Bash(pnpm:*), Read, Edit
---

Run the same gate CI runs, in this order, and fix what fails rather than only reporting it:

1. `pnpm format` — settles every formatting argument; run it first so `format:check` cannot fail the lint step.
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build` (core → runtime → web)

Rules while fixing:

- A failing test is a real signal. Fix the code, not the assertion, unless the assertion is provably wrong — say
  which and why.
- Do not silence eslint with a disable comment; `--max-warnings 0` and unused-disable-directive reporting are both
  on, so an unnecessary one fails too.
- `console.log` is an error by design. Use `console.warn` / `error` / `info`, or take it out.
- If `contrast.test.ts` fails, the theme's colours are wrong, not the threshold.

Report at the end: each step's result, and for anything you changed, one line on what was wrong. Do not commit.
