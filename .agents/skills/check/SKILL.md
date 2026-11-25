---
name: check
description: Run the full CI gate (format, peers, lint, typecheck, test, build) and fix what fails. Use when the user asks to run /check, verify the build, or run all CI checks before committing.
---

# CI Gate Check

Read [check.md](../../../.claude/commands/check.md) and run every step in the exact order listed there (`pnpm format`, `pnpm peers check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`), following all rules in that file and reporting each step's result without committing.
