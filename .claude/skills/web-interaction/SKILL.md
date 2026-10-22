---
name: web-interaction
description: Change how the web app's game is played or heard — the turn status and controls, selecting, clicking or dragging a checker, the screen-reader announcer, fullscreen, or moving the app onto a new release (service worker, reload). Use when editing LocalPanel, OnlinePanel, TurnStatus, TurnControls, TurnAnnouncer, useCheckerSelection, useCheckerDrag, useAppUpdates or lib/serviceWorker.ts.
---

# Playing a move, hearing it, and updating under it

Each section below is a rule `CLAUDE.md` states in one line, with the failure that made it a rule. They are the
parts of the web app where the obvious change compiles, passes a quick look, and breaks something nobody tests by
hand: a screen reader, an iPhone, or a deploy.

## One announcer, mounted before it speaks

There is exactly **one** always-mounted `sr-only` polite live region, `TurnAnnouncer`, and it carries everything
worth hearing. A live region must be in the tree _before_ its content changes or nothing is announced, so never
render one together with its text.

That is why the panels mount it as a **sibling of `GameLayout`** rather than inside `TurnStatus`. Fullscreen draws
the status inside the board's frame, and a subtree that changes position in the tree is rebuilt, not moved — which
put the region back on screen together with its text on every toggle, and the toggle went silent. Anything that
relocates the status must leave the announcer where it is.

Points out of play are `aria-disabled` with `tabIndex={-1}`, not `disabled`, which drops them from the accessible
tree in some readers. DECISIONS.md → **Accessibility**.

## Both game modes share their chrome

`TurnStatus` and `TurnControls` are common to `LocalPanel` and `OnlinePanel`; only the wiring differs. Don't write
status text in a panel — that is exactly how the two drifted apart before. The same goes for holding a checker and
playing it: `useCheckerSelection` is the one copy, and the two games differ only in what playing a move does (apply
it locally, or relay it to the host).

The rules engine is the state machine (`phase`: rolling → moving → doubleOffered → gameOver). React hooks drive it;
there is no XState here on purpose.

## A drag is the click flow entered from the other end

Not a second way to play a move. `useCheckerDrag` holds the source with `selectFrom` and plays with `moveChecker`,
so letting go over nothing leaves the checker selected, exactly as a click on the source would have.

- **The scroll lock is load-bearing**: `touch-action: none` on the drag sources plus a `touchmove` that is cancelled
  for the length of a touch gesture. Without both, iOS hands the drag to the page scroller half way through.
- **A release resolves against `data-drop-zone` rects**, and a zone under the pointer answers for itself. The points
  tile the board, so reaching past the zone under the finger to a neighbour plays a move nobody aimed at.

`Board.drag.test.tsx` fakes the rects; DECISIONS.md → **Checkers you can pick up** has the rest.

## Moving the app onto a new release

A service worker precaches the bundle, so **`location.reload()` no longer picks up a deploy** — it re-serves the
precached build. `reloadApp` hands over to the waiting worker first and only then reloads; anything that wants to
move the app onto a new version goes through it.

- The worker is registered in `prompt` mode because `useAppUpdates` owns _when_ a reload is safe — never mid-game.
  `autoUpdate` would reload out from under a player's turn, and also turns on `skipWaiting`, which removes the
  listener `lib/serviceWorker.ts` posts its handover to (see the comment in `vite.config.ts`).
- `runtime-config.json` must stay out of every cache, or a tab can never notice a new release.

DECISIONS.md → **Installable, and offline**.

## Checking it

`pnpm --filter @backgammon/web test` covers the logic of all of the above in jsdom: what is rendered where, which
handler a simulated pointer reaches, when the update hook decides a reload is safe. It does not run a screen reader,
iOS's scroll handoff, the Fullscreen API or a real service worker, so it cannot say any of those behave. For what you
can see, run `pnpm --filter @backgammon/web layout` and look at the screenshots; for the rest — an announcement being
heard, a drag surviving on an iPhone, a deploy being picked up — only the real thing on a device answers.
