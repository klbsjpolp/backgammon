import { createContext, useContext } from 'react';

/**
 * What to draw in the strip of felt between the board's two halves, or null
 * where the board is drawn flat — see `GameLayout`, which fills this in
 * fullscreen, and the `body[data-fullscreen]` rule in `index.css`, which opens
 * the gap it sits in.
 *
 * It reaches the board through context rather than a prop because the panels
 * build `<Board>` and hand it to `GameLayout` already constructed, while it is
 * `GameLayout` that owns what goes around the board. And it has to be drawn
 * *inside* `.board-fit`: that element declares `--pt`, so it is the only place
 * the band can be sized in the same unit as the points it lines up with.
 */
export const BoardBandContext = createContext<React.ReactNode>(null);

export const useBoardBand = (): React.ReactNode => useContext(BoardBandContext);
