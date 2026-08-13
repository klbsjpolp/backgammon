import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';

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
  /** Rolls for the player as soon as it is their turn to roll. */
  autoRoll: boolean;
  onRoll: () => void;
  onDouble: () => void;
  onAutoRollChange: (autoRoll: boolean) => void;
  onRespond: (accept: boolean) => void;
}

export const TurnControls = ({
  canRoll,
  canDouble,
  isDoubleToYou,
  autoRoll,
  onRoll,
  onDouble,
  onAutoRollChange,
  onRespond,
}: TurnControlsProps) => (
  <>
    {/* Roll shares its landscape row with the checkbox, and that sidebar column
      is only 11rem at its narrowest: the 7rem minimum would push the two-up
      grid wider than the track it sits in. */}
    <Button onClick={onRoll} disabled={!canRoll} className="min-w-28 text-base compact:min-w-0">
      Roll
    </Button>
    <Checkbox checked={autoRoll} onChange={onAutoRollChange}>
      Auto-roll
    </Checkbox>
    <Button onClick={onDouble} disabled={!canDouble} className="bg-info text-info-fg hover:bg-info-hover">
      Double
    </Button>
    {isDoubleToYou && (
      <>
        <Button onClick={() => onRespond(true)} className="bg-positive text-positive-fg hover:bg-positive-hover">
          Take
        </Button>
        <Button onClick={() => onRespond(false)} className="bg-danger text-danger-fg hover:bg-danger-hover">
          Drop
        </Button>
      </>
    )}
  </>
);
