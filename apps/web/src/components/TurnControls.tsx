import { Button, type ButtonProps } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { cn } from '@/lib/cn';

/**
 * Roll, double, and the take/drop pair — the buttons both game modes carry, in
 * the order and with the colours they had in each. They were written out twice;
 * only the wiring behind them differs, and that is what the props are.
 */
export interface TurnControlsProps {
  canRoll: boolean;
  canDouble: boolean;
  /** A double is pending *this* player's answer, so take/drop belong on screen. */
  isDoubleToYou: boolean;
  /** A checker is in the player's hand, so the way to put it back belongs there. */
  isHolding: boolean;
  /** Rolls for the player as soon as it is their turn to roll. */
  autoRoll: boolean;
  onRoll: () => void;
  onDouble: () => void;
  onAutoRollChange: (autoRoll: boolean) => void;
  onRespond: (accept: boolean) => void;
  onClearSelection: () => void;
}

/**
 * The width of a slot, held whatever button is standing in it. The row is
 * `justify-center`, so a slot that took its width from its own label would slide
 * every other control sideways the moment one swapped — which is the same
 * button-moves-under-the-thumb bug the swap is here to avoid.
 *
 * `min-w` rather than `w`: the landscape sidebar lays these out as grid cells
 * narrower than the reservation, and there the grid is what holds them still.
 */
const SLOT = 'min-w-24 compact:min-w-0';

const Slot = ({ className, ...props }: ButtonProps) => <Button className={cn(SLOT, className)} {...props} />;

/**
 * Three controls, always, in the same three places.
 *
 * Take/drop and clear-selection used to be *added* to this row, which on a
 * portrait phone wrapped it onto a second line: picking a checker up moved the
 * new-game button 52px down the screen, and putting it down moved it back. They
 * are not extra actions, though — they are what the first two slots mean at that
 * moment. Rolling and doubling are both impossible while a double is pending or
 * a checker is in hand, so the buttons standing in for them cost nothing:
 *
 *   slot 1 — Roll, or Take while a double is yours to answer.
 *   slot 2 — Double, or Drop for that same answer, or Cancel while holding.
 *   slot 3 — auto-roll, which is a setting and never changes.
 */
export const TurnControls = ({
  canRoll,
  canDouble,
  isDoubleToYou,
  isHolding,
  autoRoll,
  onRoll,
  onDouble,
  onAutoRollChange,
  onRespond,
  onClearSelection,
}: TurnControlsProps) => (
  <>
    {isDoubleToYou ? (
      <Slot onClick={() => onRespond(true)} className="bg-positive text-positive-fg hover:bg-positive-hover">
        Prendre
      </Slot>
    ) : (
      <Slot onClick={onRoll} disabled={!canRoll} className="text-base">
        Lancer
      </Slot>
    )}

    {isDoubleToYou ? (
      <Slot onClick={() => onRespond(false)} className="bg-danger text-danger-fg hover:bg-danger-hover">
        Refuser
      </Slot>
    ) : isHolding ? (
      // Named for what it does to the checker in hand rather than for the
      // selection model behind it, and short enough to share slot 2's width.
      //
      // The spoken name leads with that same word rather than replacing it
      // ("Annuler la sélection", as it first did). WCAG 2.5.3 asks that the
      // accessible name contain the visible label, because a speech-input user
      // says what they can see: "cliquer Annuler" has to reach the one control
      // on screen for putting a checker back down. The rest of the phrase is
      // the elaboration the one word cannot carry.
      <Slot
        onClick={onClearSelection}
        aria-label="Annuler, reposer le pion"
        className="bg-neutral text-neutral-fg hover:bg-neutral-hover"
      >
        Annuler
      </Slot>
    ) : (
      <Slot onClick={onDouble} disabled={!canDouble} className="bg-info text-info-fg hover:bg-info-hover">
        Doubler
      </Slot>
    )}

    <Checkbox checked={autoRoll} onChange={onAutoRollChange} label="Lancer auto">
      {/*
       * A phone drops the word rather than the row. The three controls need
       * 342px and a 360px screen offers the row 328, so it wrapped onto a
       * second line there and cost the board 52px that `index.css` had not
       * reserved — the same 52px the three fixed slots above were introduced to
       * stop moving. At 375px it fit by a single pixel, which is not a fit: it
       * is the system font's metrics agreeing with us on the phones we happened
       * to measure.
       *
       * "Lancer" is the button immediately to the left, so the shorter form
       * loses nothing a player can see. This is two spans rather than one
       * element moved by CSS, which the dice deliberately are not — but the
       * rule there is about a control a screen reader would find twice, and
       * there is one input and one name here whatever CSS shows: `label` above
       * pins it to the full phrase.
       */}
      <span className="max-sm:hidden">Lancer auto</span>
      <span className="hidden max-sm:inline">Auto</span>
    </Checkbox>
  </>
);
