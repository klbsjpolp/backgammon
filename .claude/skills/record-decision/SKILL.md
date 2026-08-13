---
name: record-decision
description: Write a DECISIONS.md entry, or a commit message body, in this repository's house style. Use after making a trade-off worth defending, or when asked to record, document, or write up why something was done a particular way.
---

# Recording a decision

`DECISIONS.md` is the reference this repo actually runs on — CLAUDE.md points at it, and most of what a newcomer
would get wrong is explained there. The bar for an entry is high and the voice is specific. Read two or three
existing sections before writing one; "Trust boundaries" and "Phone layout" are the calibration.

## What earns an entry

- A trade-off, with the thing given up named.
- A constraint discovered the hard way — the WebKit `:has()` recalc, the live region that has to be mounted before
  its text changes, the schema field that must be `.nullish()` and not `.nullable()`.
- Something deliberately **not** done, and why (XState, match play, `dist/` output nothing consumes).

Not: what you typed, what files you touched, or a feature description. That is what the diff and the README are for.

## How it is written

- **Prose, not bullets of activity.** Bullets are fine when there genuinely are three parallel cases; each one is
  still a paragraph, not a fragment.
- **Lead with what was wrong.** Almost every good entry in that file opens on the failure — "The board was a grid of
  27 buttons that all announced the same way", "The board used to be drawn at a fixed pixel size". The fix reads as
  inevitable once the problem is stated properly.
- **Say why the obvious fix was not the fix.** This is the highest-value sentence in most entries and the one most
  often missing. The `:has()` version read better and was wrong. Hoisting the span out of its `&&` would not have
  helped.
- **Name the cost.** "It costs the board nothing … It costs the title, which was already the item that gives."
- **Numbers where there are numbers.** 2.66 and 1.35 against their points; ~85% larger in landscape; 22rem down to
  18.5rem. Measured, not estimated.
- Present tense for how things are, past tense for how they were. British-ish spelling (`colour`) follows the file.
- Add to an existing section if one fits; new sections go before **Deferred**, and anything knowingly left undone
  goes _in_ Deferred.

## Commit bodies are the same discipline

The subject is lowercase, conventional-commit prefixed, and says what changed in plain words —
`fix(web): announce from a live region that is already there`, not `fix(web): fix a11y issue`. The body is what was
wrong, why the obvious fix was not the fix, and what it costs. `git log` is the reference; commitlint only checks
the subject, so the body is on you.

If a change deserves a DECISIONS.md entry, it usually shares most of its text with the commit body. Write the body
first, then compress or expand it into the entry — do not paste the same paragraphs into both.

## Afterwards

`pnpm format` — prettier checks markdown too, and `pnpm lint` fails on an unformatted `DECISIONS.md`.
