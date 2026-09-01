# Backgammon — recorded decisions

Decisions made while scaffolding this repo (autonomously, per the user's "do what
you think and record it" instruction). Open questions are at the bottom.

## Architecture

- **Separate repo**, pnpm workspace, mirroring skip-bo's structure and stack. Reuses
  the shared multiplayer infra from
  [`realtime-infra`](https://github.com/klbsjpolp/realtime-infra) by consuming
  `@klbsjpolp/realtime-core` from npm.
- **Internal package scope `@backgammon/*`**: `@backgammon/core` (rules),
  `@backgammon/runtime` (host-authoritative binding to the relay), `@backgammon/web`.
- **Host-authoritative online play**, identical model to skip-bo: one client (seat 0)
  runs `@backgammon/core` and relays state through the game-agnostic server. Backgammon
  is a **perfect-information** game, so unlike skip-bo there is **no hidden-information
  redaction** — the host relays the full board to every seat.

## Rules scope (v1)

- Standard backgammon: 24 points, 15 checkers/side, standard starting position.
- Full move rules: direction per player, two dice, **doubles play four moves**, entering
  from the bar before any other move, hitting blots (send to bar), bearing off (all 15 in
  home board; overshoot allowed only from the highest occupied point).
- Legal-move generation enforces the "must use both dice if possible; if only one can be
  played, play the higher" rule.
- **Doubling cube** is modelled in core (value, owner, offer/take/drop) and detected in
  the runtime/UI. Win detection includes **single / gammon (2×) / backgammon (3×)** and
  multiplies by the cube. The AI turns the cube too — see below.
- **Single games** (play to a win), not match play.

## AI

- **Checker play**: full search over every legal move sequence for the dice (capped at
  60k nodes), keeping the sequence whose resulting board evaluates highest. The evaluation
  weighs the pip race, made points, home-board structure, primes, direct shots at blots,
  checkers stacked past the point of being useful, and what a loss is about to cost.
- **Cube play**: `winProbability` estimates the AI's chances from the pip race, corrected
  by primes, blot exposure and checkers on the bar, then squashed through a logistic scaled
  by how much race is left. It is a heuristic for cube decisions, not a rollout — it puts
  the opening position at ~0.54 for the player on roll. `shouldDouble` fires inside the
  classic window (0.68–0.85: strong enough to gain, not so strong that playing on for the
  gammon beats cashing) and `shouldTakeDouble` uses a take point of 0.22, a little under the
  textbook 25% to account for owning the cube after taking.

### Losing well

The evaluation scored a position by how likely it was to win, and that makes every loss worth the same. So the AI
played a game it could no longer win exactly as it played one it had already lost: it sat on its anchor in the
winner's home board while the winner bore off around it, and was backgammoned in 81 of 1000 games. A backgammon is
three points, and it was giving away the third one for nothing.

`backgammonStakes` prices the third point, and only the third point. A loss with nothing borne off pays double, and
one with nothing off and a checker still on the bar or in the winner's home board pays triple; both are read off the
position at the instant the winner's fifteenth checker comes off, so both are still there to be played for. The
second point is nevertheless left to the `off * 120` bonus, which already dwarfs anything else the search can reach
for and needs no help hunting the first checker off — four gammon-specific terms were tried (rushing checkers home,
weighting the ones still outside, at four weights) and every one measured as nothing. So with no checker trapped this
term is silent however far gone the game is. It counts trapped checkers rather than firing all-or-nothing — the stake
only really falls when the last one leaves, but a search four half-moves deep needs a slope to walk down, not a cliff
at the end of it.

The threshold is the whole decision and it is not a safety margin. An anchor in the winner's home board is the last
thing that can still win the game outright, because they have to bear off around it and will eventually be forced to
leave a shot. Running early throws away real winning chances to protect a point that was never in danger; running
late throws away the point. `BACKGAMMON_ALARM` is 8 and the ramp is zero at eight, so nine of the opponent's fifteen
off is where the AI stops playing to win and starts playing to save the third point. That measured best: leaving at
five costs games it should win, and waiting until eleven leaves twice as many backgammons on the board. Targeting only the deep anchors, where
the winning chances are thinnest, was tried and just scaled the whole effect down.

The range it reads is `homeRange`, now the single definition in `board.ts` that `allHome`, `inHomeBoard`,
`detectResult`'s backgammon test and this term all share. It used to be spelled out in four places, and one of those
was `loserTrappedInWinnerHome` — the function that actually decides whether a game _is_ a backgammon. An evaluation
playing for one transcription of a rule while the engine scores another is a bug waiting for someone to touch the
rule, and nothing would have failed when they did.

It costs gammons, and that is the honest price. Breaking the anchor gives up the shots that would sometimes have
saved those too, so the AI is now gammoned in 23.5% of the games it loses rather than 18.8% — while being backgammoned
in 2.6% rather than 14.9%. Per game lost it hands over 1.29 points instead of 1.49.

### Two ties the pip count could not break

Both of the AI's other endgame habits were the same bug wearing different clothes: two plays scored identically, and
the search kept whichever it happened to reach first.

Nothing in the evaluation disliked a tall stack. A made point scored the same holding two checkers or six, and the
pip count does not care _which_ checker moves, so bringing an outfield checker round and dropping another checker
onto a home-board point the AI already owned came out exactly equal. `buriedCheckers` charges 2 for every checker
past the fourth on a point. The obvious alternative — counting quadrant crossings, so that a checker coming home
outscores one shuffling inside the home board — is the more orthodox heuristic and measured as nothing at all,
because a crossing is coarse: it cannot tell 23 → 18 from 8 → 3.

`directShots` read hits off `points` alone, so a checker on the bar was not a hitter. It is the loudest one on the
board: it enters on the far quadrant, it enters before anything else can be played, and all six faces are candidates.
The AI was therefore blindest to the danger exactly when it was greatest, spreading blots across its own home board
while the opponent waited on the bar to land on one. `entryShots` is six lines and worth more than the other two
changes together: at weight 0 the package wins 0.143 points per game against the evaluation it replaces, and with the
term 0.277.

It is charged less than a board shot, at 6 against 8, and the reason is worth keeping. The two counts are not the
same measurement — `directShots` counts single faces and ignores the combinations that also reach a blot, so it
undercounts a hitter in play, while entry is exact, because a checker on the bar arrives with one die or not at all.
More to the point, the only way to put a checker on the bar is to hit it, so every entry shot the AI is charged for
is one its own hit created, and the term can only ever argue it _out_ of hitting. At 8 it did: it declined a hit that
left four blots on the entry points — blots with no shots against them at all beforehand — for a quiet play worth 2.6
less, and refused 7 hits in 376 chances that the old evaluation took. At 6 that is 3.

Six buys back the hits that matter rather than all of them, and it is worth being plain about that: the refusals
fall, they do not stop, and no positive weight stops them, because a term that can only subtract can never argue
_for_ a hit. Nor is 6 the stronger number — played directly against 8 over 400 games it is 197-203 on games and
249-262 on points, a tie leaning the wrong way, which is what +0.277 against +0.268 being noise looks like. The
hitting is the reason for the weight; the points are not.

It is a term of its own rather than a fix inside `directShots`, and that is the interesting part. `directShots` has a
second caller: `winProbability` weighs it at 1.5 against a bar term at 6, both tuned against a count that never saw
the bar. Folding entry shots in there re-tunes every cube decision — 31 doubling calls flipped across 800 games, and
a player _on the bar_ can come out ahead on the two terms combined, since six entry shots outweigh the six pips being
on the bar costs. Measured, the cube came out level either way, which is not evidence that it is safe so much as
evidence that 800 games cannot see it. The checker-play gain says nothing about the cube, so the cube keeps the input
it was tuned for and `evaluateBoard` adds the new term at its own call site. A test pins the two positions that would
drift apart if anyone folds them back together.

### Caution in a race is already free

Once the two sides have passed each other nothing can be hit again, and the obvious move is to stop paying for
safety — drop the made points, the primes and the shot penalty and race. Measured, every version of that loses:
dropping all three costs 2 points of win rate, dropping the primes or the made points alone costs about 1.5.

The shot term was never the cost. `directShots` only counts an opponent checker that sits _behind_ a blot, and once
the sides have crossed there is no such checker by construction — over 300 self-play games, 6488 positions where the
sides had crossed and not one with a shot in it. It is already zero and has been all along. What the race branch
actually removed was the made-point and prime bonuses, and those are not caution: spread across consecutive points is
how a bear-off avoids gaps and wasted pips, and a `prime²` that peaks at six home points made is a distribution
heuristic that happens to be spelled like a blockade. There is nothing cautious left in a race to remove, so there is
no race branch.

## Trust boundaries

Three places take input that the rest of the code cannot vouch for, and each is
now checked at the edge rather than assumed correct further in.

- **`playMove` validates.** It used to apply whatever `Move` it was handed. An
  illegal one could not fail loudly — it wrote a board the rules can no longer
  produce and play carried on from there: a die that was never rolled went
  unconsumed (so the turn could never end), and landing on a made point
  overwrote every checker standing on it, which is checkers _deleted_ from a
  game whose whole invariant is that there are thirty of them. Nothing reached
  it that way in practice — the host looks moves up in the legal set and the
  hooks only offer what the generator returned — but "no caller does this" is
  not a property anything was checking, and the failure mode was silent
  corruption rather than an error. `playMove` now checks the move against
  `legalMoves` and throws otherwise. `applyMove` reads whether a move hits off
  the board instead of trusting `Move.hit`, which is an _output_ of the
  generator describing what the move will do, not an instruction to it.

  The AI search would pay for that check at every node, having just taken its
  move out of `currentLegalMoves` — so `applyLegalMove` is the unchecked path,
  documented as being for callers that did exactly that, and `playMove` is
  validate-then-`applyLegalMove`. "Unchecked" has one exception: it still
  insists the die is among the remaining ones, because at `indexOf === -1` the
  two slices that remove it overlap and `remaining` _grows_ instead — handing
  the mover a die nobody rolled and a turn that cannot end. That check costs the
  `indexOf` it was already doing. The one caller that could go either way is the
  host, which keeps the validating one: it is the online trust boundary, it pays
  the cost once per network action rather than once per search node, and it
  should stay correct even if the lookup above it ever drifts.

- **Relayed state is parsed, in both directions.** The host already refused to
  apply any action a guest sent that was not legal (`backgammonActionSchema` and
  `BackgammonHost`); the other direction had nothing. A guest rendered whatever
  arrived as `msg.payload as GameState`, so a truncated or malformed frame
  reached the board as `undefined` and took the page down with it.
  `gameStateSchema` and `hostSnapshotSchema` in `@backgammon/runtime` close
  that: a view that does not parse is dropped and the last good board stays on
  screen, and a snapshot that does not parse is refused rather than resumed
  from. They check that the state is _renderable_, not that it is reachable by
  legal play — the host stays authoritative over what is true. The declared
  return types of `parseGameState` and `parseHostSnapshot` are what keep them in
  step with the types: add a field to `GameState` and forget the schema, and it
  stops compiling.

  **A schema on a wire is also a compatibility contract**, which is the easier
  half to get wrong. Both ends are versioned independently and updates are
  deferred while a game is in progress, so a host on the previous release
  talking to a guest on the current one is ordinary rather than exotic. A field
  this project _adds_ must therefore be tolerated as absent — `noPlay` is
  `.nullish().transform((v) => v ?? null)`, not `.nullable()`, because requiring
  the key would have rejected every frame an older host sends and frozen the
  guest's board for the rest of the game. A dropped frame is also `console.warn`ed:
  "the next broadcast repairs it" is true of a corrupt packet and false of an
  incompatibility, and the silent version of that failure is the worst one to
  debug.

  A snapshot answers a harder question than a view — not "can this be drawn" but
  "can the game be resumed from this" — so `hostSnapshotSchema` checks across
  fields that the seating and the colours line up. `BackgammonHost.setSeating`
  builds its maps and only then commits them, so a host that refuses a snapshot
  is still the host it was; it used to clear the live maps before validating and
  leave itself with no colours at all.

- **An `ErrorBoundary` wraps the app.** React unmounts the whole tree when a
  render throws, so anything that got past the two checks above still showed as
  a blank white page with no way out but the browser's own reload — on a phone,
  indistinguishable from the app being broken for good.

## A roll nobody can play

Rolling into a position with no legal move — usually a failed entry from the bar
— passes the turn straight back, and passing it clears `roll`. The dice were
therefore gone before anything had drawn them: the player was told nothing at
all and simply found that it was suddenly not their move. The same in reverse
hid the AI's dances completely.

`GameState.noPlay` carries the roll that could not be played, and the status line
says so. It is held until the player who rolled it rolls again, rather than being
cleared by the next roll of any kind, so it stays up for the whole of the
opponent's reply instead of flashing past inside the AI's think time.

A double taken in that reply ends it too, which is not symmetry for its own sake.
`respondDouble` returns to `rolling` with the same player still on turn, so the
state it hands back is otherwise indistinguishable from the one right after the
failed roll — same turn, same phase, same record — and anything reading that
shape as "this just happened" says so a second time, seconds after the cube
changed hands. The exchange is an answer to the roll as surely as a roll is, and
one the player drove themselves, so there is nothing left to tell them.

That half of it is the host's, and online the guest is the one drawing the dice,
so a guest on this build against a host one release behind still sees the old
behaviour once per cube exchange — the dice redrawn, an auto-roll taking the long
hold. It is the bug this removes rather than a new one, it is cosmetic, and it
ends when the host updates. There is deliberately no client-side guard: the only
thing separating the two states is the cube, and a test on the cube is wrong
whenever it was already the dancer's — taken a turn or more before the dance, a
legitimate `pendingNoPlay` such a guard would suppress. Nothing else in the state
distinguishes them, which is the whole reason the fix belongs at the transition.

### Saying it in words was not enough

A sentence naming the pips is not the same as seeing them, and on a phone the whole
episode was still over before it registered: the turn passed back inside the same
state update, so the dice reached no frame at all, and the AI answered 600ms later.
The player was left reading about a roll they never saw, on a board that had already
moved on.

Two things fix that, and neither is in `core` — the rules are right, it is the
presentation that was missing.

The **dice are drawn**, from `noPlay` rather than from `roll`, which by then is null.
They go in the cell the live dice already have, because that cell is reserved at four
dice wide and one die high whether or not a roll is on screen — anywhere else would
have cost the board height to say something that happens a few times a game. That cell
holds one roll, so this is a choice and not a stack: the roll on play whenever there
is one, and otherwise the roll that failed. `pendingNoPlay` narrows the record to the
beat it is news in — nothing rolled since, and the failure is the other seat's — since
`noPlay` deliberately outlives that beat for the sentence's sake, and a turn later it
would be redrawing dice the player on turn is about to replace.

They are marked on the **rim**, dashed, and nowhere else — inset by the half-width
the heavier stroke gains, since a stroke straddles its path and a non-root `<svg>`
is `overflow: hidden`, so the live die's `x=2` at width 6 would lose a unit off
all four sides and flatten the rounded dash caps the mark is carried by. The obvious mark is a strike
through the face, which is what cancelled looks like — and at the ~30px a phone draws a
die, the stroke swallows the pips it crosses. Both diagonals run through the centre pip
and two others of a 5; cutting the line thinner only made it merge with the pips
instead of erasing them, and drawing it in the face's own colour under a narrower one
cut a clean channel through pips that then could not be counted. A struck 5 reads as a 3. That is the exact opposite of the point — these dice are drawn _because_ the player
never got to read them — so the mark went to the one part of the die carrying nothing:
its edge. Fading them was the other candidate and was rejected for a smaller version of
the same reason, plus one of its own: faded already means _spent_, which is the one
thing these dice are not.

And the answer to them **waits**. `NO_PLAY_HOLD_MS` is 1.5s, and it is the delay both
of the automatic rolls take when a roll has just gone unplayed: the AI's reply, and an
auto-roll for the player who asked not to be asked. Without it the pause is the AI's
usual 600ms think time or auto-roll's 300ms, which is not enough time to look down at
the dice cell and back. The hold is presentation only — the guard inside `roll` is what
makes both safe — and it costs nothing in the ordinary case, because a roll that could
be played never enters it.

## Watching the AI move

`applyAiTurn` plays a whole turn in one call, which is right for the engine and wrong
for the screen: two to four checkers changed places in a single render and nothing
said which ones. A human's own move is one they just made and are expecting; the AI's
is the only account they get of it, and it was arriving as a fait accompli. Hitting was
the worst of it — a checker could be sent to the bar in a turn nobody saw happen.

The local hook therefore spends one die per beat, 400ms apart, against the 600ms pause
before the turn that reads as the AI deciding something. This is also the half of
"animate the board" that is not animation: whatever motion is added later is an echo of
a state that now changes one move at a time, and without this there is nothing for it
to echo.

The move is re-decided from the board in front of it — `chooseTurn` on the current
state, first move, `playMove` — rather than searching once and walking the sequence
that came back. A stored sequence is derived state that can disagree with the board it
was derived from, and it would want invalidating on a new game, on unmount, and on
anything else that moves the state under the timer; re-deriving needs nothing beyond
the guard the other AI timers already carry. It does not weaken the play either: a
partly-played turn has a subset of the dice left, so the search from there still
reaches every continuation the first search was choosing between — and where that one
hit the 60k-node cap, the shorter ones may not. The cost is up to four searches per
turn instead of one, each smaller than the last.

`applyAiTurn` stays in core regardless. A caller with nothing to draw — a test, a
rollout — wants the turn, not the beats.

## Checkers that travel

Playing a move changed a board; it did not move a checker. One point had one
fewer and another had one more, and the eye was left to work out which two — on
the AI's turn, four times over, against a board it had not been watching. The
beats added by "Watching the AI move" above bought the time for motion; this is
the motion.

What travels is a stand-in on the page, not the checker on the board. The board
draws itself from signed counts, so there is no node that goes from one point to
another to animate — but the deciding reason is the portrait phone. The whole
board there sits under a `rotate(90deg)`, and a transform on a checker inside that
frame is applied in the frame's turned coordinates, so an offset measured on
screen would send it off at right angles. A `position: fixed` element on the body
is outside the rotation, and one set of screen coordinates is then right in both
orientations. It is also above every point it crosses, which a checker inside its
own point can never be.

The checker that landed is hidden for the length of the trip rather than the board
being held back a frame. React commits the truth — the count, the stack depth, the
label a screen reader reads — and only the paint is deferred; a board that lagged
its own state by 220ms would be a second source of truth, and the live region would
be announcing a move whose checker had not arrived.

The origin cannot be read off the board once the move is on screen, because the
checker that left is no longer standing there. So every commit records where the
free end of each pile was and the next one flies against that: the previous frame is
the only place the starting point still exists. The one thing that invalidates it is
the board moving underneath — a rotated phone, a resized window — so the root's own
rect is kept alongside, and a board that is not where it was animates nothing.

Which end is free is not the same end on both halves of the board, and assuming it
was got half the points wrong. A pile is pinned at its point's base and grows away
from it, but it is the _point_ that is reversed along the bottom row, never the stack
inside it — that is always drawn top-down. React appends, so on a bottom-row point
the appended node is the one at the base and the three checkers already there shift
up a slot to make room. The checker that arrived is the first child there and the
last child along the top row, and a stand-in aimed at the last child on a bottom
point flew into the base of the pile and read as sliding underneath it.

Ending a flight early settles it on the spot rather than leaving that to the
animation. `Animation.cancel()` only queues its event, and the layout effect that
supersedes a flight runs immediately after the one that cancelled it — so it would
read a checker that is still hidden, record _that_ as the state to restore, and hide
it for good when it finished. Two checkers landing on a pile already showing five
reach for the same node and were enough to do it.

Which checker moved is derived by diffing the two boards rather than carried beside
them. Locally the `Move` is in hand and it would have been easy to pass down, but a
guest is handed a state and never sees the move that produced it, and adding one to
the wire would have meant a field every mismatched host had to be tolerated for
omitting. A diff is the one account both games can give, and it costs the wire
nothing. It also fails in the right direction: anything that is not exactly one
checker moving — the opening position, a board that jumped because a relayed frame
went missing — describes nothing and simply appears, which is what the board did
before any of this.

Bearing off is the one move with no checker to stand in for, because a tray draws a
number. It gets one drawn from scratch, which shrinks away on arrival instead of
landing on a checker that is not there.

## Checkers you can pick up

Click the checker, then click where it goes, was the whole of it. It is precise, and
it is what the keyboard has to do anyway — but it asks for a move in two steps that
the hand already knows as one, and on a phone, where a point is forty pixels across
and the two taps land a board apart, it is the second tap that goes wrong. Dragging
says the same thing in the gesture the board is a metaphor for.

The drag does not replace the click flow; it _is_ the click flow, entered from the
other end. Picking a checker up holds it exactly as a first click does, and letting
go over a destination plays it exactly as a second click does. Which is why letting
go over nothing leaves the checker held rather than throwing the gesture away: a
drag that ran out of nerve half way has already made the first click, and the
destination is one tap from there. Escape is the one thing that gives the checker
back, because a player who wants out says so.

Both flows now come out of one hook, `useCheckerSelection`, instead of one per game
mode. Local and online had written the same hold-and-play logic twice over,
differing only in what playing a move _does_ — apply it, or relay it and wait — and
those two are exactly the pair that had drifted apart before. A gesture added to one
is now a gesture in both.

`clickPoint` could not be the drag's two ends, because it has to guess. A click on a
point that is both a legal source and a legal destination of the checker already
held means "play the move"; the same point grabbed means "pick this up". So the drag
holds and plays outright — `selectFrom`, `moveChecker` — and only the click flow is
left guessing. `targetsFrom` is there for the same reason: a drag has to light the
destinations up inside the gesture that picks the checker up, and cannot wait for
the selection to come back around through a render.

Pointer events rather than HTML5 drag-and-drop, which has no touch implementation to
speak of on iOS and cannot draw its own checker. A press only becomes a drag once it
has travelled — further for a finger than for a cursor, because a touch contact
drifts a few pixels while the player is merely tapping, and at the cursor's threshold
every tap on a point promoted itself into a drag that then had to be aimed. Until
then the press falls straight through to the click flow, and after it the click the
browser fires at the end of the gesture is swallowed, or it would reach the point the
drag started on and undo the selection the drag just made.

**The scroll lock is the thing that makes it work on a phone at all.** By default a
finger travelling down a point is a page scroll, and the browser decides so a few
frames in: the pointer stream ends in a `pointercancel` and the checker is dropped in
mid-air — "it starts moving and then the page scrolls instead". `touch-action: none`
is the cheap half, and it is set only on the points that can actually be played, so
every other part of the page still scrolls and pinches with the same finger that has
to reach the buttons under the board. On iOS `touch-action` is advisory: Safari
re-decides and hands the gesture to the scroller anyway, so the gesture also cancels
`touchmove` outright for its own duration. That is scoped to one drag and released on
`pointerup`, `pointercancel`, Escape _and_ window blur — an app switch can end a
pointer stream without ever delivering an up, and a lock left armed leaves the whole
board inert.

Skip-bo, where this gesture came from, also auto-scrolls the board when a card is
held near the edge of the viewport. Deliberately not copied: `--pt` sizes the board to
the room the viewport has, so there is never a destination off screen to scroll to.

**Where a release lands is decided by rects, and a square under the pointer answers
for itself.** That last part is the difference from a board of scattered piles: the
points _tile_, so a release over a point that is not a legal destination has to mean
nothing at all. A nearest-target tolerance able to see over the square under the
pointer would quietly play the point next door. The tolerance that remains is small
and only ever reaches across the gutters between points, or in from just outside the
frame — and the bar and the opponent's tray are squares too, carrying no index of
their own, precisely so that a release over one of them stops there instead of
snapping to a point a few pixels away. Rects and not `elementFromPoint`, because the
checker the player is holding sits under their own pointer and would answer every hit
test itself — and because rects can be stubbed, where a paint order cannot.

**A dragged move flies from the hand, not from the point.** "Checkers that travel"
above flies every move from where the checker was standing one commit ago, which for
a drag is the one move it must not do: the checker the player has just put down would
snap back to its point and fly to the destination they had already reached, on the
only move they made themselves. So the gesture records the square it let go over and
the flight effect reads it — and clears it in the same breath, because a release that
outlived its own commit would send some later move off from a place no checker has
been since.

## The move that has nothing to decide

Some moves have no second half to choose. A double gives all four dice the same pip,
a blocked die leaves a point one destination, a checker on the bar usually has one
place it can enter — and the player was still being asked to name it, with a second
click or by carrying the checker over to it. A double click on such a point plays it
outright.

It is a shortcut over the click flow rather than a third way to move: the two clicks
and the drag still do exactly what they did, so nothing is reachable only by
double-clicking and neither the keyboard nor the screen reader story changes. Like
the drag it goes in `useCheckerSelection` and so arrived in both game modes at once.

"One move" means one _destination_, not one entry in `currentLegalMoves`: a checker
low enough in the home board bears off with either die, and those are two moves that
put it in the same place. `soleMoveFrom` compares destinations and then takes the
first move that lands there — which is the move the second click would have played,
since `clickPoint` picks a destination's die the same way.

Wiring it to `onDoubleClick` and stopping there plays a move the player never asked
for. A double click delivers its two clicks first, so clicking a source and then
double-clicking the _destination_ is three clicks: the first lands the checker, the
second selects the point it landed on, and the double click then spends another die
on the checker that just arrived. Driven in Chromium, a roll of four dice came back
with two left instead of three, and this game has no undo to take the second one
back.

So `Board` keeps the last two clicks with the board that was underneath each, and a
double click is only the shortcut when both landed on this point over one board. The
board object is the witness that costs nothing to consult: `playMove` returns a new
one and selecting a point does not, so a pair of clicks that straddles a move is
exactly the pair whose boards differ. A press that became a drag cannot be half of a
pair either, for free: the gesture swallows the click at its end, so it never reaches
the tally. What it gives up is the online case where the host's frame arrives between
the two clicks and replaces the board without anything having moved; that double
click does nothing, and the clicks it was made of have already selected the point, so
the destination is one click away.

## Accessibility

The board was a grid of 27 buttons that all announced the same way and all sat in
the tab order, whether or not they could be played, saying nothing about what was
standing on them. It now reads as a board:

- Every point names its occupancy (`flèche 13, 5 pions blancs`) and its role in
  the move being made — holding the checker, having one you can move, or being
  somewhere it can go. The bar counts both sides in its name, since being on it
  decides the entire turn.
- Points that are not in play are `aria-disabled` and out of the tab order, so a
  Tab lands on the two or three points that can actually be played rather than
  on all 24. They stay in the accessible tree — a screen reader still reads the
  whole board — which is why this is `aria-disabled` and `tabIndex={-1}` rather
  than `disabled`, which drops the button out of the tree in some readers.
- **One** polite live region carries everything worth hearing — whose turn it
  is, what was rolled and what is left of it, and a roll nobody could play. It
  is `sr-only` and always mounted, and the visible spans carry no `aria-live` of
  their own, so nothing is said twice.

  Always mounted is the load-bearing part. A live region has to be in the
  accessible tree _before_ its content changes for the change to be announced;
  one that appears together with its text is silent in NVDA, JAWS and VoiceOver
  alike. The first cut of this put `aria-live` on the no-play line and inside
  `<Dice>`, both conditionally rendered — and `<Dice>` is unmounted altogether
  until a roll lands, so it could never announce the roll that mounts it. That
  is why the dice are spoken from the status line rather than from the component
  that draws them: the board has nothing permanently on screen to say them from.

The colour side of this was already covered — `contrast.test.ts` holds every
theme to WCAG 3:1 for the board's state rings — which is what makes the gap
worth closing: the palette was being checked and the semantics were not.

## Board orientation

The board is drawn from the point of view of whoever is looking at it: `BoardController`
carries a `you` color, and black's layout is white's mirrored across the middle so that
**both players see their own home board bottom-right, next to their own bear-off tray**.
The near tray is always the viewer's, which is what lets either color bear off.

The points are **numbered the way the viewer counts them** — 1 is the point they bear off
from, 24 the furthest away — so the two players disagree about every point, which is how a
real board works. What was drawn before was the engine's array index (0..23, always in
white's direction): no backgammon board has a 0-point, and for black every number was
counting the wrong way.

## Phone layout

The board used to be drawn at a fixed pixel size (40px points), which overflowed any
phone in portrait. It is now derived from a single CSS length, `--pt` (the width of one
point), computed in `apps/web/src/index.css` as the largest unit that fits both the
width and the height the viewport still has free. Everything else — checkers, bar,
trays, labels, gaps — is a multiple of `--pt`, so one number rescales the whole board
and it never overflows. This is the same shape as Tailwind's own spacing scale
(`calc(var(--spacing) * n)`), with the base unit derived from the viewport rather than
constant; a fixed scale with breakpoint steps cannot express "fill exactly what is
left", which is the property that removes the overflow.

Those multiples are named `board-*` tokens declared in **`@theme inline`**, so the
markup reads `w-board-point` / `size-board-checker` / `gap-board-gutter` and contains no
arithmetic — the interlocking ratios (12 points + bar + tray + gutters must add up to
the 17 the width divisor assumes) all sit together in one block. `inline` is required
rather than incidental: `--pt` is declared on `.board-fit`, not `:root`, so the
utilities have to carry the expression and evaluate it on the element that inherits
`--pt`. A plain `@theme` would resolve them against `:root`, where `--pt` does not
exist. It also keeps the global surface empty — `inline` emits no variables, only the
utilities the board actually uses.

Three cases, all CSS-only (no resize observers, no JS breakpoints):

- **Portrait phone** (`≤640px` wide): the board is **turned a quarter turn** — a board
  is twice as wide as it is tall, the worst possible fit for a portrait screen, and laid
  out flat it leaves most of the height empty while shrinking the checkers to a couple of
  millimetres. Rotating swaps the axes and buys ~50% larger points. Your home board and
  tray land bottom-left; `.board-label` turns the text back upright. Hit testing follows
  the transform, so clicking is unaffected.
- **Landscape phone** (`compact` variant: landscape and `≤640px` tall): the controls move
  into a column _beside_ the board instead of under it, where they used to sit below the
  fold and under the thumb rest. The primary buttons are a two-up grid there so take/drop
  and clear-selection still fit; the hint line is dropped.
- **Anything roomier**: unchanged — `--pt` caps at the original 40px.

`--pt` is only ever as large as the room left over, so every fixed thing on the page is
paid for by the checkers. Three rounds of that, after the board still came out too small
to play on a phone:

- **A checker fills its point** (0.85 × `--pt`, less the point's own border and padding,
  which are fixed pixels and so eat a growing share as `--pt` shrinks). The 0.68 it used
  to be left a margin all the way around every checker — the single largest waste on the
  board, and the one nothing else could buy back.
- **Deep stacks overlap**, so a point is 3.85 × `--pt` deep rather than the ~4.6 five
  full-size checkers laid flat would need: `.board-stack` closes the gap at four and
  overlaps at five, and sizing every point for the deepest case instead would cost the
  whole board ~20% for a case that arises on two or three points at a time. Two point
  depths plus the gutters and padding are what the height divisor (8.6) counts.

  How deep the stack is comes from a **`data-stack` attribute the component writes**, not
  from `:has(> :nth-child(n))` counting the children in CSS. The `:has()` version read
  better and was wrong on WebKit: landing a checker on a point did not re-evaluate it, so
  a point that grew to five kept the flat spacing and spilled past its own border until
  something forced a full style recalc — rotating the phone, most visibly. The attribute
  is invalidated by the same DOM write that changes the count, so the two cannot disagree.

- **The page chrome was measured, not guessed.** The dice moved out of the board's own
  column into a row every layout already pays for, the status line and the header row
  were tightened, and the version footer is dropped in landscape. What is left is what
  `--avail-h` / `--avail-w` reserve, down from 22rem to 18.5rem in portrait and from
  7.5rem to 3.5rem in landscape, and the board now has the full width of the screen
  (portrait) or of everything but the sidebar (landscape) to be drawn in.

  Anything riding in such a row still costs the board height, so the dice are drawn as
  **pips with the ones already played faded**, rather than spelled out beside a
  "remaining: 6, 5" line: the same information in a third of the width, and four pips on
  doubles say what four moves are coming better than the text did.

  On a phone the dice are set to **the height of a control row** (1.875rem), and they are
  **drawn** rather than typed. The first version set the
  Unicode pip characters, ⚀..⚅, in a larger font, and that is why the roll still read as a
  smudge at arm's length: a glyph's ink is a fraction of its em box and the rest is padding
  the font chose, its outline is a hairline the font chose, and whether the platform draws
  the character as text or as an emoji is a third thing the font chose. Every one of those
  is out of our hands, so raising the font size buys only a fraction of itself: at 30px,
  Chromium's fallback draws 22px of ink, and how much less a phone draws is again the
  font's business. A face drawn as a rounded rect and up to six circles fills the box it
  is given — at the same 1.875rem it is a solid 30px of `--dice` with `--dice-pip` pips,
  the same on every platform.

  That costs one more variable in every theme and a line in the contrast gate, which now
  holds the pips to 3:1 against the face and the face to 3:1 against `--canvas` — a die
  floats on the page with nothing but its own fill to draw its edge, so a theme that gives
  it the page's luminance loses it.

- **The dice sit with the buttons, and every layout wants that somewhere else.** They rode
  in the page header first, which is the far end of the screen from the thumb that rolls
  them — you watch the bottom of a phone and the roll lands at the top. Moving them down is
  a width problem, not a taste one: the primary row on a 390px portrait screen has 33px
  spare once Roll, auto-roll and Double have taken theirs, and four dice on a double need 132. There is no arrangement of that row that holds them.

  So `Controls` is a three-column grid, the outer two `1fr`, and the dice are one cell that
  each layout places for itself — beside Roll on a roomy screen, in the bottom row hard
  left on a portrait phone (the row that holds one button and has the 132px going spare),
  and on a line of its own at the top of the sidebar in landscape, where height is what is
  going spare. One element moved by CSS, not a copy per breakpoint: a copy is a second
  `aria-label="dice"` for a screen reader to find, and the one that is hidden is hidden by
  a media query a test environment does not evaluate.

  The cell is reserved at the width of a **double**, four dice, not of the two an ordinary
  roll draws. That is what keeps the buttons still: they sit in the middle column, and a
  cell that grew when a double landed would slide them sideways between the two taps the
  new-game button needs. The cost is paid in symmetry — on a phone the reservation is
  wider than the column would otherwise be, so the bottom row's button sits ~22px right of
  the page's centre. It costs no height anywhere: every row the dice land in is already a
  44px control row and a die is 30px. The board is untouched, `--avail-h` unchanged, and
  the header, with nothing left in it but the title, stops truncating "Backgammon" on a
  phone.

- **A reservation the markup cannot break.** All of the above is a count of what the
  chrome measures, which is only true while the chrome cannot decide to measure more. It
  could: the primary control row is `flex-wrap`, and its three controls need 342px against
  the 328 a 360px phone gives them, so it wrapped onto a second line there and every
  portrait screen narrower than 375px scrolled by exactly the 52px that cost. Not for one
  state of the game — for all of them, the whole way through.

  375px is the tell. It fit by **one pixel**, which is not fitting; it is the system font's
  metrics agreeing with us on the handset we happened to measure, and the same row on a
  phone whose font is a hair wider was already broken. So the row is now `flex-nowrap` on a
  phone and the 44px is true by construction, the auto-roll checkbox says "Auto" there
  rather than "Lancer auto" (the word is the button immediately to its left, and dropping it
  buys 57px), and it is the checkbox that shrinks and ellipsises if a font still runs long —
  never the two buttons beside it, whose slot width is what keeps them from sliding under a
  thumb already on its way down. `CONTROL_BASE` carries `whitespace-nowrap` for the same
  reason one step further out: "Nouvelle partie" broke onto two lines at 344px, and a
  control's height here is a promise made to the board rather than a consequence of its
  label.

  Every portrait and landscape phone from 344px up now fits its viewport exactly. 320px
  does not, by 15px: four dice on a double reserve 132px beside a 157px button in a row
  300px wide, and the only ways out are shrinking the dice — which would undo the
  legibility the drawn faces were introduced for, on every phone, to serve one below the
  360px floor this file has documented throughout — or letting the reservation go and
  having the buttons slide when a double lands. Left as it is, deliberately.

- **The reservation is not slack.** `--avail-w` in portrait was cut from 19.875rem to
  2rem in passing, during work on fullscreen, and the comment above it went on
  describing the chrome it had stopped reserving, so the file read as though nothing had
  changed. A portrait phone then drew `--pt` at its 2.5rem cap rather than the 30.9px
  that fits: the board came out ~30% too tall, 997px of page in an 844px viewport on a
  390px handset, with the roll button and everything under it past the fold. Nothing failed, because nothing
  can: `--avail-w` is a hand-maintained count of what the chrome measures, and CSS has no
  opinion about whether the count is true. The one check that catches it is
  `document.scrollHeight === document.clientHeight` on a phone-sized viewport, which is
  what "check a portrait phone and a landscape one" in the layout skill is asking for —
  it is a one-line reading in devtools, and it is the only reason any of these numbers
  can be trusted. Restoring the 19.875rem puts every portrait phone from 360px up back to
  fitting its viewport to the pixel.

Between them the checkers came out ~85% larger in landscape and ~40% in portrait on a
modern phone, with the page still fitting the viewport exactly (no scroll). Where the
screen's height is what binds — a tall phone, either way up — the board is already using
every pixel of it and the last round bought nothing; the width it freed shows up on the
phones where width was the limit instead, ~15% on a small landscape screen. The
reservations subtract `env(safe-area-inset-*)` where the padding they stand for does:
the page is `viewport-fit=cover`, so a board that claims its full width in landscape
would otherwise claim the notch as well.

Destructive controls (**new game**, **leave**) are separated from the primary row and are
`ConfirmButton`s: one tap arms, a second confirms, and it disarms after four seconds or on
blur. On a phone they are a thumb-width from the board and a stray tap used to be
unrecoverable. **Once the game is over, new game confirms nothing** — there is no game
left to throw away, and the guard was then only friction between the result and the next
game. Every button carries a 44px minimum touch target, and the page reserves
`env(safe-area-inset-bottom)`.

## The abandon button rides in the header

On a desktop screen the board was drawn at its 2.5rem cap with the page half empty
below it, and a 44px row holding one button — **Nouvelle partie**, or **Quitter** online —
sat under the board spending height the board was not allowed to use. Moving that row into
the header costs the page nothing there: the switch cluster is already 40px tall for the
mode buttons, so taking the button grew it by 4px and gave the board back the row, the rule
above it and both grid gaps — 69px out, 4px back, **65px** measured rather than estimated,
which is what `--avail-h` drops by (20.25rem → 16.25rem windowed, 18.75rem → 14.75rem in
fullscreen).

It is a **portal**, not a copy hidden by a media query. The rule the dice already
established holds here for the same reason — a second copy is a second "Nouvelle partie"
for a screen reader to find, and the media query that hides one does not run in jsdom, so
the tests would not see the duplicate they were meant to catch. The header lends out a DOM
node and `Controls` renders into it; there is exactly one such button in the accessible
tree at any width.

It is **not**, however, the same React element across the move, and an earlier version of
this entry claimed it was. The two branches are a portal and a fragment at the same child
position, and React reconciles by type-at-position: crossing the breakpoint unmounts the
button and mounts a new one, so a `ConfirmButton` left armed is disarmed by the resize.
Changing the portal's target does the same thing, so there is no arrangement of portals
that preserves it — only lifting the `armed` state out of the button would. That is not
worth doing: disarming is the fail-safe direction (the guard can only be lost, never
spuriously gained), and the button already disarms on `blur`, so anything the player
touches next clears it anyway. What matters is that the accessible tree never holds two of
these, and that survives the move.

That makes this the one placement on the page CSS cannot decide, which is why
`useRoomyScreen` exists and why it is the only JS breakpoint here. The dice are moved
between layouts by grid placement because their three homes are all cells of one grid; the
header is a different container entirely, and nothing in CSS moves an element between
containers. `display: contents` on the whole chain would, and would take the panel's
layout and its accessible tree with it. The cost is a media query string that duplicates
the `max-sm` and `compact` breakpoints and has to be kept in step with them by hand — noted
where it is written, and the reason that hook does nothing else.

jsdom implements no `matchMedia` at all, so the hook answers false without one. That is
deliberate rather than incidental: the phone layout is the branch that needs no slot to
exist, so every test that does not ask about placement sees the arrangement it always saw,
and the one that does installs a `matchMedia` of its own.

Not done: hoisting the header itself into the panels so both rows could be siblings of one
grid, which would have been the CSS-only answer. Online opens on a room picker with no
`GameLayout` at all, so the header would have had to be rendered from two places, or from
inside a panel that does not always draw a board — a worse trade than one media query.

## Full screen

On a desktop monitor `--pt` was still capped at the 2.5rem chosen for a windowed browser, so
a 1920×1080 screen and a 13" laptop drew the identical board — all the extra room outside the
cap went to nothing. The toggle (`FullscreenButton`, `useFullscreen`) requests the real
Fullscreen API on `document.documentElement` rather than adding a CSS-only "big board" mode:
the browser's own chrome (tabs, address bar) is gone once it succeeds, and `100svh` reports
the difference for free, without a second formula to keep in step with the first.

Raising the cap alone overflowed the page: `--avail-h`'s reservation was tuned for the header,
hint line and version footer all still on screen, and those numbers do not shrink just because
fullscreen is active. So the hint and the footer go, on the same `body[data-fullscreen]`
attribute selector the drag lock already sets on `<body>` — a `@custom-variant fullscreen
(body[data-fullscreen] &)` reads exactly like `compact`, and `--avail-h`'s reservation drops
with them, from 20.25rem windowed to 18.75rem in fullscreen. The header and its mode/theme
switches stay, on purpose: the one thing still needed once the game is the only thing on
screen is a way back out, and hiding it too would strand the toggle itself as a fixed-position
exile with nowhere natural to sit once the row that held it collapsed.

The state lives on the DOM attribute wherever the consumer is a CSS selector, matching
`data-drag-active` and `data-stack` — the `--pt` cap, the header's columns, the page's own
padding. It is also read once in `App` and handed down through `FullscreenContext`, because
two consumers do not change how something looks but _where it is drawn_: the version line,
which moves into the header row, and the controls and status, which move inside the board.
Neither is a move CSS can make, and a second `useFullscreen()` would put two effects on the
same attribute, racing to set and clear it.

### Everything that can be, is inside the board

The first version kept the page's own rows and only grew the board into what was left. That
was still three things stacked outside it — header, status, controls — each costing the board
its height, on the one screen with height going spare. So fullscreen now leaves **one** row
outside: the title, the switches and the version line share it, as a three-column grid rather
than `justify-between`, or the switches would only sit on the page's centre when the title and
the version happened to be the same width.

The status and the controls move into the board, into a band opened between its two halves.
Nothing places that band: the frame is a row of columns that are each `justify-between`, so
height given to the frame opens between every column's top and bottom row at once — points,
bar and trays together — and `GameLayout` draws into the gap. It costs the board a strip of
felt that was drawing nothing, against two rows of chrome that were costing it real height:
at 1920×1080 the board went from 1532×763 through 1657×824 to **1579×974**, and at 2560×1440
to 2144×1324.

Three things had to be true of that band, and each was found by getting it wrong first:

- It is drawn **inside `.board-fit`**, reaching `<Board>` through `BoardBandContext` rather
  than a prop, because the panels build the board and hand it to `GameLayout` already
  constructed. That is not indirection for its own sake: `--pt` is declared on `.board-fit`,
  so anywhere else the band's widths silently resolve to nothing — the first version's
  `left-board-pad` was dropped by the browser as an invalid `calc`, and the band quietly
  spanned the page instead of the frame.
- Its columns are **the frame's own**, in the frame's own unit: six points and their five
  gutters, then the bar, then what is left. The middle one is empty on purpose. The bar
  centres its checkers, so a player entering from the bar has them exactly where a band laid
  across the full width would hide them — along with the target they have to be dropped on.
- The controls collapse to a single unwrapped row there. `Controls` is a three-column grid so
  that the buttons stay on the page's centre whatever the dice take; inside half a board there
  is nothing to centre against, so the grid becomes a flex row and the dice simply lead it.

`--avail-h` then reserves that one header row and nothing else, and the divisor grows from 8.6
to 10.7 because the board itself is taller. The band's own floor is `max(3.5rem, 2.1 × --pt)`:
the multiple is what pays for it on a real fullscreen screen, and the 3.5rem is there so a
short window still gets a band a 44px button fits in.

### What a relocation costs, and the one case where that mattered

Moving the status into the board is a change of _position in the tree_, and React reconciles
by position: the two layouts are structurally different, so entering fullscreen unmounts the
status subtree and builds a new one. Three pieces of local state ride on that, and only one
of them was worth defending.

The one that was is the **live region**. `TurnStatus` documented it as load-bearing and
`CLAUDE.md` states it project-wide: a region has to be in the accessible tree _before_ its
content changes, or the change is announced to nobody. Rebuilding it on every toggle put it
back on screen together with its text, which is precisely the silent case. So it is now
`TurnAnnouncer`, mounted by each panel as a **sibling of `GameLayout`** — outside every
layout `GameLayout` can choose, and therefore outside anything that can take it down. The
test asserts the DOM node's _identity_ across the toggle rather than that a region exists on
both sides, because the second is true of the broken version too.

The other two are left alone, deliberately. A `ConfirmButton` caught mid-arm is disarmed by
the move, which is the fail-safe direction — the two-tap guard can only be lost, never
spuriously gained — and the button already disarms on `blur`, so the next thing the player
touches would clear it anyway. `VersionLine`'s "À jour" flash is two seconds of cosmetic
feedback about a check the player just ran by hand. Preserving either would mean lifting
state out of a component to survive a layout change, which is a real cost against no real
failure.

The general shape is worth keeping in mind: **a portal keeps an element out of the tree
twice, not its state across a move.** Changing a portal's target unmounts it just as a
branch swap does. Anything whose state must outlive a relocation has to be mounted somewhere
the relocation does not reach.

The cap itself moved twice: to 6rem, then to 9rem. 6rem turned out to already be the binding
limit on a 1920×1080 screen (`--avail-h` gives less than that once the reservation is paid),
but a 2560×1440 or 4K display was hitting the cap rather than the geometry, so the extra
headroom was free — measured at 1532×763 (1920×1080), 2236×1111 (2560×1440) and 2428×1206
(3840×2160), all with zero scroll overflow. The number came from measuring, not guessing:
each reservation change was checked against real viewport sizes with a headless browser before
being kept, the same discipline the phone breakpoints above were tuned with.

Restricted to screens roomy enough to be worth it — `max-sm:hidden compact:hidden` on the
button, stacked on `isSupported` dropping it outright where the API does not exist (iOS
Safari) — since a phone is either already using its whole screen through the portrait/compact
layouts above, or cannot ask for fullscreen at all.

## Nothing on the page moves during a game

The board was measured at every resolution it is drawn at, playing a real game rather
than looking at a static screenshot, and four things on the page moved while it was
being played. None of them was the board's own doing; all four were chrome around it
that grew or shrank as the game changed state, and each moved the board or the
buttons under the player's hand.

- **The status line was one wrapping row** — turn on the left, cube and pip counts on
  the right — so it was one line or two depending on how long the two happened to be.
  "black to roll (AI)" fits beside the counts at 360px and "white to move (you)" does
  not, which means the board moved 20px every time the turn changed there: a 0.11
  layout shift, the largest on the page, and it landed mid-move. A roll nobody could
  play added a third line on top of that, on every screen. It is **two lines now,
  always**: the turn on the first, and on the second either the roll that could not be
  played or the cube and pip counts. Reserving a line for the news and leaving it empty
  the rest of the time would have cost the board another 20px of height forever.
  Both lines truncate rather than wrap, which is what the 11rem landscape sidebar
  needs — there is no width at which both halves fit, so one of them has to end in an
  ellipsis rather than take a line nobody budgeted for.

  Which meant deciding what the second line gives up when it cannot hold everything,
  and the first answer — the news displaces the counts — was wrong. `noPlay` is held
  until the player who rolled it rolls again (see "A roll nobody can play" above), so
  that is not a moment, it is the whole of the opponent's reply: the counts would have
  been gone for the turn you decide the cube on, and a double taken inside that window
  would have left the ×2 you are now playing for invisible until the opponent rolled.
  The cube is drawn nowhere else on the page. So the line is **cube, then the news,
  then the pips**, in the order they can least afford to be cut, and `truncate` does
  the cutting: everything fits on a desktop, the pips run off the end of a phone that
  has news to report, and the sidebar keeps the cube. The pips are last because they
  are the one thing there that the board itself carries.

  The exception is the result. "black wins a backgammon — 3 points" needs three lines
  in the sidebar and clipping it loses the win kind and the points — the sentence the
  game was played for, and the only one with no later state that brings it back. So at
  game over the turn line wraps, the counts stand down beside it, and the box is
  allowed to grow. It is the one place the no-shift rule is relaxed and the one where
  relaxing it costs nothing: there are no more moves to make under a board that moved.
  A phone and a desktop do not move even then — the sentence fits the line the
  reservation already pays for; only the sidebar grows.

- **The truncating line did not truncate**, and that is the one shift that survived the
  measurement above — because a roll nobody can play is rare enough not to have come up
  in the games that were played to take it. `truncate` is `white-space: nowrap`, whose
  min-content width is the whole sentence, and the automatic minimum size of a grid item
  is its min-content: with nothing between the sentence and the column allowed to shrink,
  the column sized itself to the longest thing the status could ever say. So the news
  about an unplayable roll made the page 464px wide inside a 390px phone. The board slid
  53px to the right as the message appeared, took a sideways scroll with it, and slid
  back a turn later — the shift the two-line reservation was measured to prevent, in the
  axis nobody had measured. One `min-w-0` on the cell that holds the status fixes it, and
  the ellipsis the line was written for finally appears. The band in fullscreen had
  carried that `min-w-0` from the start, for the same reason, which is the other half of
  why this was never seen there.

- **Take, drop and clear-selection were added to the primary control row**, which on a
  portrait phone wrapped it onto a second line. Picking a checker up moved the new-game
  button 52px down the screen and putting it down moved it back — on the single most
  frequent interaction in the game, and onto the control the two-tap confirmation
  exists to protect. They are not extra actions, though: **rolling and doubling are
  both impossible while a double is pending or a checker is in hand**, so they stand in
  for those two buttons instead of joining them. The row is three controls at every
  moment of every game — Roll or Take, Double or Cancel or Drop, and auto-roll — and
  the two action slots hold a fixed width so a shorter label does not slide the row
  sideways either. `TurnControls` owns all of it now, which is also how online play
  got the clear-selection button it never had.

- **The dice cell reserved its width but not its height.** That was true when it rode
  in a row it shared with the buttons — a control row is 44px and a die is 30px — but
  in landscape the dice have a line of their own at the top of the sidebar, and an
  empty cell collapsed there: rolling pushed the whole sidebar 30px down and the next
  player's turn pulled it back. The cell now holds one die's height everywhere, which
  costs nothing in the two layouts where it shares a row and 30px of the sidebar's
  spare height in the one where it does not.

- **The confirm button resized when armed.** "New game" is 115px and "Start over?" is
  120px, so the target moved 5px between the two taps it asks for — and swapping in a
  plain button once the game was over moved it again. Both labels sit in one grid cell
  now, the inactive one hidden, so the button is always as wide as the longer of them;
  `confirm={false}` drops the second tap without swapping the element out.

  Keeping one element across that flip took away a reset that the remount used to give
  for free. Arm "New game" mid-game, let the AI win inside the four seconds, and the
  button sat there red, reading "Start over?" and announcing that a second tap was
  needed — over an action that now took one. Everything drawn therefore reads a derived
  `isArmed`, rather than the state being cleared in an effect afterwards, so there is no
  frame in which the two disagree.

  The **accessible name follows the visible word** in both states rather than staying
  pinned to `label` — "Start over?, confirm New game" while armed. WCAG 2.5.3 asks that
  the name contain the visible label, because a speech-input user says what they can
  see, and a two-tap button is the worst place to break that: the first tap works, and
  it is that tap which relabels the button, so the confirming one — the one under a
  four-second timer — could not be spoken at all. The pinned name was meant to keep the
  action findable, which it only had to do for those four seconds, during which the
  visible word is the one the user would reach for anyway. The `role="status"` span
  stays alongside it: an `aria-label` changing under a focused element is not reliably
  announced in NVDA, JAWS or VoiceOver, so speech input and screen readers are served by
  two different things on purpose. The same rule put "Cancel, put the checker back" on
  the button that puts a held checker down, where the name and the label had no word in
  common at all.

What is left is the game itself: checkers moving between points, and a stack
respacing as it crosses four and five (see the point depth above). Across a full
game at seven resolutions, from 1920×1080 down to a 320px phone, the page now has
exactly **one** geometry — board, controls and document height identical in every
state — and cumulative layout shift is under 0.001 everywhere, all of it inside the
board.

Two things the measurement turned up along the way. The portrait height budget was
**5px short before any of this** — the page had always overflowed its own viewport by
a hair — so `--avail-w` in the portrait block is now what the chrome actually
occupies rather than what it was thought to. And below ~360px the row cannot hold
three controls on one line whatever width they are given: it wraps there, stably, and
the page scrolls, which costs nothing because `--pt` is already pinned at its 1rem
floor on a screen that small and no reservation could buy the board anything back.

## Themes

Three themes ship: **Classic** (green felt and brass, the original look),
**Midnight** (indigo, dark) and **Parchment** (cream paper and a wooden board — the
one light theme). The choice is remembered in `localStorage` under
`backgammon:theme`.

Everything hangs off one CSS layer, `apps/web/src/theme/themes.css`. Each theme is a
single block of semantic variables — `--surface`, `--muted`, `--danger`, `--felt`,
`--point-even`, `--checker-light`, `--pick`, … — and `@theme inline` maps them to
Tailwind utilities (`bg-surface`, `ring-pick`, `border-point-line`). No component
names a palette colour any more, so a fourth theme is one block plus one entry in
`themes.ts`; nothing else changes. Alpha is baked into the values rather than left
to `/60` modifiers in the markup, because how translucent a point sits on the felt
is a property of the theme and a light theme wants different numbers than a dark one.

Two consequences of declaring the variables on `[data-theme='…']` rather than only
on `:root`:

- The **switcher** is three swatches, each drawn _in_ the theme it selects: the
  swatch sets `data-theme` on itself, so the variables resolve inside it and you see
  the felt and accent you would get instead of a legend to decode. It also fits the
  header on a phone, where the mode switch has already eaten most of the width —
  a second header row would push the board past the height budget in
  `--avail-h`.
- `color-scheme` is set per theme, so the UA's own widgets (scrollbars, focus rings,
  form controls) follow along; Parchment is the only one that reports `light`.

The board's state signals are held to WCAG's 3:1 for non-text UI against **both**
point colours, and `contrast.test.ts` asserts it for every theme in the catalogue
rather than leaving it to the eye. Two rules fall out of that and are worth knowing
before adding a theme:

- **A ring's emphasis is distance from the surface, and the direction depends on the
  board.** On a dark felt "stronger" is lighter; on Parchment it is darker, because a
  mid-toned point leaves no room above it. `--pick-strong` must out-contrast `--pick`,
  not out-brighten it, which is the second thing the test checks.
- **A checker's edge is drawn by whichever of its body and its rim can be seen.** A
  pale checker on a dark point needs no rim; the same checker on cream, or a dark
  checker on a dark felt, is invisible without one, so the rim carries the 3:1 alone.
  Both dark themes needed their rims lifted for this — black checkers on a dark board
  were 2.66 and 1.35 against their points.

### Rings also have to be legible against each other

Every ring cleared 3:1 against both point colours and the board was still hard to
read on Parchment, because clearing the surface you are drawn on says nothing about
clearing the _other ring_. `--pick-strong` (the point you are holding) and `--move`
(where it can go) are on screen together and mean opposite things, and Parchment ran
`--pick` and `--move` two L\* apart — a brown ring and a navy one of identical
darkness. Different colours; the same ring. Midnight had the same defect wearing a
better disguise: indigo rings against a cyan `--move` look distinct until you
simulate protanopia, where they land 3 apart on ΔE2000 and become the same colour
twice.

So the gate now asserts two more things about `--move` against each of `--pick` and
`--pick-strong`, and they are deliberately different in kind. **A step of at least 10
in L\*,** because a ring is two pixels wide and the eye resolves lightness at that
width far better than hue — no hue difference rescues two equally dark strokes.
**And at least 25 ΔE2000 under simulated protanopia, deuteranopia and tritanopia,**
because whatever hue is left has to be a hue a dichromat still sees. `--pick` and
`--pick-strong` are exempt from each other: they are one signal at two strengths and
are supposed to look related.

Meeting that on a light board cost something, and it is worth knowing what.
Parchment only ever has room _below_ its darker point, so all three rings share one
band, and `--point-even` at #c89a63 was mid-toned enough to leave only 24 points of
L\* to hold three of them — which is precisely why they ended up stacked. Lightening
it to #d6ac74 opens the band to 33 and buys `--pick` a real margin (3.41 → 4.13) as
well as the room to ladder, at the price of some alternation between the points: 1.98
down to 1.64, still well clear of Midnight's shipped 1.17. Midnight paid a different
price — its `--move` is now gold on an otherwise entirely blue board, since yellow
against blue is the one axis dichromacy leaves standing.

Parchment came back anyway, still reading as one ring drawn twice, and the second
look found the part the first one had measured around. `--move` was #001b2e: a navy
whose chroma is 16, which is to say no hue at all. Lightness was the only channel it
had left, so the gate's L\* step was not a floor it cleared on its way to being
different — it was the whole of the difference, and 23 points of "one dark thing
against another dark thing" is not a signal. The fix is chroma, not more distance:
#002864 carries a chroma of 41 and is blue on sight, and since that costs 9 points of
L\*, the pick family had to move up to keep the ladder inside the band (#7d3708 →
#983c00, #64260a → #743206). `--pick` pays for it against the darker point, 4.13 down
to 3.36 — the thinnest ratio Parchment has, and still the right trade, because a ring
that clears its own point comfortably and means the same thing as the ring next to it
has failed at the only job it has.

The ΔE floor moved with it, 25 to 35. 25 was chosen as "clearly not the same colour"
and Parchment passed it at 30 while looking exactly like the same colour, so it was
never measuring what it claimed to. The three themes now sit at 38 to 60, so 35 is
not a target anyone has to design toward; it is a floor that a theme can only land on
by making `--move` too dark to have a hue, which is the defect it exists to catch.

Classic keeps `--move` at 3.07, the thinnest ratio on the board, and that is not an
oversight. Every ring has to clear the _lighter_ point, so lifting `--move` means
darkening `--point-even` — and by the time that point is dark enough for 4:1 it sits
1.09 against the felt and the even points dissolve into the cloth. 3.07 clears WCAG;
a board you cannot read would not. What Classic did get is its pick family lifted
clear of `--move` in lightness (#f0b429 → #f9cd53, #fcd34d → #fde68a), which also
takes `--pick` from 3.53 to 4.35.

A small inline script in `index.html` applies the stored theme (and the matching
`<meta name="theme-color">`) **before first paint**, so a reload does not flash
Classic on its way to the chosen palette. It duplicates the storage key and the
theme ids from `themes.ts` on purpose — it has to run before any module loads.
Storage failures (Safari private browsing) degrade to "the theme switches but is
not remembered" rather than throwing.

## Stack

- Same primary libraries as skip-bo: React 19, Vite 8, Tailwind 4, Vitest 4, zod 4,
  immer 11, TypeScript 6, pnpm.
- **XState was intentionally omitted** (skip-bo uses it). Backgammon's turn FSM
  (rolling → moving → doubleOffered → gameOver) is already owned by `@backgammon/core`
  as pure transitions, so the web app drives it with a thin React hook instead of
  duplicating the machine in XState. Revisit if the online turn loop needs it.
- **The two game modes share their chrome.** `TurnStatus` and `TurnControls` are
  what the local and online panels have in common; both used to write the status
  string, the status bar and the roll/double/take/drop cluster out for
  themselves, which is exactly how they drifted — only the local one named the
  cube's owner, and only the local one spelled out the stake when a double was
  offered to you, though neither is a local concern. What is genuinely different
  is the wiring, and that is what the props are. The panels are the two hooks
  and the pieces they hand to `GameLayout`, nothing else.

## Online / realtime-infra integration

- The runtime is **transport-agnostic** and host-authoritative, deliberately shaped to
  plug into `@klbsjpolp/realtime-core`: `BackgammonAction` is the opaque `relay.move`
  payload, the host validates+applies and rolls dice authoritatively, and `serializeView`
  produces the per-seat view the host relays. This mirrors skip-bo's split.
- The runtime itself stays transport-agnostic (no realtime-core import). The **web app**
  wires the relay: `apps/web/src/online/` consumes `@klbsjpolp/realtime-core` for the HTTP
  room API and the WebSocket relay protocol.

## Online multiplayer — IMPLEMENTED

- `apps/web/src/online/useOnlineGame.ts` is the host-authoritative online hook:
  - HTTP create/join room (`api.ts`), WebSocket auth, lobby presence, `startGame`.
  - On `gameStarted` the host seat builds a `BackgammonHost` (seating + the server's
    `currentSeatIndex` as the first turn) and broadcasts the full state via `relay:view`;
    guests render relayed views and send action intents via `relay:move`.
  - Dice are rolled by the host only. The host keeps the server's turn pointer in sync
    via `setTurn`, stores a `snapshot` for reconnect, and sends `endGame` on a win.
  - Backgammon is perfect-information, so the broadcast view is the full `GameState`.
- The web app depends on `@klbsjpolp/realtime-core ^0.1.0`, now resolved from the registry;
  the `file:` override that stood in for it while it was unpublished is gone.
- **Online play has no default relay, and that is the deploy's job to supply.** `getApiBaseUrl`
  throws rather than guessing at a URL: a wrong guess would fail later, on a request, as a
  network error nobody can act on. Its cost is that the value has to arrive from outside the
  code, and Vite bakes it in at build time — so a deploy that never sets
  `VITE_BACKGAMMON_API_URL` ships a bundle that is complete, passes every check, plays the AI
  perfectly, and answers "Online play is not configured" to the first player who hosts a game.
  That is exactly what happened to the Pages site: releases kept going out green while online
  was dead. The workflow now refuses up front when the value is missing, and reads a
  repository variable as well as a secret — the URL travels to every visitor inside the
  bundle, so it was never secret, and a variable can be read back from the settings UI, which
  is what makes "is it set?" answerable without cutting a release to find out.
- A `Deploy` workflow ships the web app to GitHub Pages.

## Releasing under a branch ruleset

- The `Deploy` workflow cuts the release itself — version bump, CHANGELOG, tag, and a
  push straight to `main` — so protecting `main` puts the workflow on the wrong side of
  its own ruleset. `GITHUB_TOKEN` cannot satisfy a ruleset, so `RELEASE_PUSH_TOKEN` is
  **required**, not an optimisation. It used to fall back to `github.token`, which read
  as a graceful degradation and was not one: it only moved the failure from checkout to
  the push, by which point `commit-and-tag-version` had already written the commit and
  the tag. The job now refuses before checkout when the secret is missing.
- **The release push is `--atomic`.** `git push --follow-tags` updates the branch and the
  tag as independent refs, so the declined push still published `v0.1.17` while leaving
  its release commit unreachable — and every run after that recomputed the same version
  and died on `fatal: tag 'v0.1.17' already exists`. A half-applied release is worse than
  a failed one, because it poisons the next one; all-or-nothing is the only shape that
  degrades safely here.
- **The relay-URL check runs before the release, not before the build that reads it.** The
  natural place for it is next to the `Build` step whose `env` it feeds, and that place is
  wrong: the `build` job only starts once `release` has computed the version, written the
  CHANGELOG, and pushed the commit and the tag. Failing there leaves a published tag with no
  deploy behind it — the same half-applied release the `--atomic` push exists to prevent, just
  reached from the other end. The check therefore sits with the `RELEASE_PUSH_TOKEN` guard, in
  the only window where a refusal still costs nothing.

- **`workflow_run` fires on completion, not on success.** Chaining Deploy to CI that way
  reads as "deploy what CI proved", but the event carries a `conclusion` that has to be
  checked or a red CI ships anyway. The gate lives in the `release` job's `if`, alongside
  the `github-actions[bot]` actor guard, rather than in a separate job — one condition,
  and skipping `release` skips everything downstream of it.

## Installable, and offline

The app is a PWA: `vite-plugin-pwa` generates the manifest and a Workbox service
worker that precaches the bundle, so the board is playable against the AI with no
network and installs to a home screen. The icons are one drawing —
`public/icon.svg`, a felt board with three points and a checker — rasterized to the
192/512 maskable PNGs and a 180px Apple icon; `public/favicon.svg` is the same mark
redrawn at 64px, because at 16px only the triangles survive. `start_url` and
`scope` come from Vite's `base`, which on GitHub Pages is a project path rather
than the origin root.

The interesting part is the collision with the update flow that was already here.
`useAppUpdates` polls `runtime-config.json`, notices a newer release and reloads —
and its comment, that a reload re-fetches the document past the HTTP cache, stops
being true the moment a service worker is installed: the document then comes from
the precache, so the reload serves the very build it is trying to leave. Two things
follow. The worker is registered in **`prompt` mode**, never `autoUpdate`, because
the app already owns the question of _when_ it is safe to reload — `autoUpdate`
would activate a new worker and reload mid-turn, which is exactly what the deferral
exists to prevent. And `reloadApp` now goes through `activateWaitingServiceWorker`
first: it asks the registration for an update, waits out a worker still
`installing` (`registration.update()` resolves before the new worker is ready, and
a bare `waiting` check therefore reports "nothing staged" for one that was seconds
away), hands over, and reloads onto it. It answers `false` when there is genuinely
nothing to take over from — no worker at all, or a build the deploy has not served
yet — and only then does the plain `location.reload()` still apply.

**The handover is written by hand, and that is the whole point.** vite-plugin-pwa's
`updateServiceWorker(true)` reads as "activate and reload" and is neither: it
ignores its `reloadPage` argument outright and only posts skip-waiting. The reload
comes from a `controlling` listener the plugin attaches when workbox fires
`waiting` — and workbox fires that from a 200ms timer it _clears_ as soon as the
worker reaches `activating`. Skip-waiting inside that window therefore activates
the new worker, cancels the event the listener was waiting for, and reloads
nothing; the tab keeps running the old build while `applyUpdate` has already
written the version into `APPLIED_UPDATE_STORAGE_KEY`, so the automatic path will
not try again. That window is the common case, not an exotic one — it is "the
player pressed Update shortly after opening the tab". So the message goes straight
to `registration.waiting`, a `controllerchange` listener is attached _before_ it is
posted (control can change immediately, and a listener added afterwards waits for
an event that has already fired), and the reload is ours. `true` now means the page
reloaded, which is what the caller was already assuming it meant.

Two smaller versions of the same mistake, both "an answer that never comes is not
the same as no answer": `registration.update()` is bounded by a deadline, because a
captive portal or a proxy holding the connection open leaves it pending rather than
rejecting — the `.catch` never runs and the Update button does nothing at all. And
the registration is read from `navigator.serviceWorker.getRegistration()` when the
plugin's `onRegisteredSW` has not fired yet, since it defers `wb.register()` to
`window.load` and the first version poll can easily beat it; without that, "our
callback is late" was indistinguishable from "this browser has no worker", and the
fallback reload went straight back into the precached build.

`runtime-config.json` is deliberately in neither the precache globs nor any runtime
cache. It is how a running tab learns it is out of date; served from a cache it
would answer with the version the tab is already running, and the app could never
notice a deploy.

## The interface is French

Every word on the screen was English, in a game whose players are French. It is
all French now — the visible text, the placeholder in the room-code field, the
accessible names, the `<html lang>`, the manifest's description and the error
banners the online panel puts up.

There is no i18n layer, and that is the decision rather than an omission. A
catalogue of keys buys nothing while there is one locale: it would add a lookup
between every sentence and the place it is read, and the sentences here are not
literals — they are assembled from engine values (`white`, `gammon`,
`never-ready`) at three or four points in a template. A key table would have to
carry a variant per gender and per number to say `une partie simple` and
`un gammon` from the same line, which is a translation framework's whole job and
a cost worth paying only for the second language. What it costs to have skipped
it is that a second language means threading a lookup back through every
component, rather than adding a file.

What the engine's own vocabulary needed instead is one table, `lib/french.ts`.
`core` speaks in `white` / `black` and `single` / `gammon` / `backgammon`, and
those names reach the screen in the turn line, on the trays and next to the cube
— translated at each point of use, a colour ends up said three different ways.
`WIN_KIND` carries its article with it (`une partie simple`, `un gammon`),
because the three kinds do not share one and a template with the article written
into it is wrong for a third of the results it renders. The turn line also lost
its `capitalize`: CSS title-cases every word, which is how an English headline is
set and not a French sentence — `Noir Gagne Un Gammon`. The sentences capitalise
their own first word now.

French is longer, and the two places that costs something were already the
places designed to give. `Contre l'IA` and `En ligne` are ~40px wider than
`vs AI` and `online`; the header row is nowrap with the title as the item that
shrinks, so at 375px the heading truncates to `Bac…` — a title the browser tab
still spells out in full, against a mode switch that has to stay on one line or
the board loses ~36px it never gets back. And `Lancer auto` wraps to two lines
in the landscape sidebar where `Auto-roll` held one. That one is free: the label
is a `min-h-11` control (44px) and two lines of `text-xs`/`text-sm` are 40px, so
the row does not grow — checked at 568 × 320, where the document is still
exactly the height of the viewport.

The one thing still not in French is what the relay says. A `close` frame's
`reason` is shown as it arrives, because it is the server's word and not this
app's; everything this app can put in that banner — the connection errors, the
state that could not be restored, the missing configuration — is translated.
The lobby's `readyState` is mapped rather than printed, since only `ready` means
anything to someone waiting to start.

## Deferred

- Match play, Crawford rule, Jacoby rule.
- Opening roll to decide who starts (white starts locally; online the server's
  `currentSeatIndex` decides).
- Undoing a checker move before the turn is committed.
- Stronger AI still possible: checker play is a full move-sequence search with a shot-aware
  evaluation, and cube decisions come off a heuristic win-probability estimate — neither is
  equity-based, and rollouts would beat both.
- Sentry, Playwright e2e.
- Online polish: reconnection/resume parity with skip-bo, richer lobby (names,
  kicking). A dropped socket still ends the
  game for that seat: `useOnlineGame` reports `disconnected` and stops there,
  though the seat token it would need to resume is sitting in `sessionRef`.
- The `dist/` output of `@backgammon/core` and `@backgammon/runtime` is built by
  `pnpm build` and consumed by nothing: both packages point `exports` at their
  TypeScript sources, which is what lets the web app's dev server and HMR reach
  into them. The build is therefore a second type-check of what `pnpm typecheck`
  already checks. Left as it is on purpose — pointing `exports` at `dist` would
  buy nothing until one of these packages is published, and would cost the
  source-level dev loop.
