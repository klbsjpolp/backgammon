---
description: Run the full CI gate (format, peers, lint, typecheck, test, build) and fix what fails
allowed-tools: Bash(pnpm:*), Read, Edit
---

Run the same gate CI runs, in this order, and fix what fails rather than only reporting it:

1. `pnpm format` — settles every formatting argument; run it first so `format:check` cannot fail the lint step.
2. `pnpm peers check` — only fails after a dependency change, and then it is the step CI fails on first.
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build` (core → runtime → web)

Rules while fixing:

- A failing test is a real signal. Fix the code, not the assertion, unless the assertion is provably wrong — say
  which and why.
- Do not silence eslint with a disable comment; `--max-warnings 0` and unused-disable-directive reporting are both
  on, so an unnecessary one fails too.
- `console.log` is an error by design. Use `console.warn` / `error` / `info`, or take it out.
- An unmet peer is fixed by moving the packages together (`pnpm-workspace.yaml`'s `catalog:` pins the ones that must
  share a release), not by adding an override.
- If `contrast.test.ts` fails, the theme's colours are wrong, not the threshold.

Report at the end: each step's result, and for anything you changed, one line on what was wrong. Do not commit.
