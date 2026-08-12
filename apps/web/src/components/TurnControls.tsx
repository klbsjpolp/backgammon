import { Button } from '@/components/Button';

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
  onRoll: () => void;
  onDouble: () => void;
  onRespond: (accept: boolean) => void;
}

export const TurnControls = ({ canRoll, canDouble, isDoubleToYou, onRoll, onDouble, onRespond }: TurnControlsProps) => (
  <>
    <Button onClick={onRoll} disabled={!canRoll} className="min-w-28 text-base compact:col-span-2">
      Roll
    </Button>
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
