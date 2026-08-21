/**
 * The geometry of a checker drag: how far a press has to travel before it is a
 * drag, and which square of the board a release lands on.
 *
 * Kept apart from the gesture itself so it can be tested without a layout
 * engine — jsdom has no layout, and a hit test that only runs in a browser is a
 * hit test nobody checks.
 */

export interface DragPoint {
  x: number;
  y: number;
}

/** Movement that turns a press into a drag, for a cursor or a stylus. */
export const PRECISE_DRAG_THRESHOLD_PX = 4;
/**
 * The same, for a finger. Higher because a touch contact drifts a few pixels
 * while the player is merely tapping, and at the precise threshold every tap on
 * a point promoted itself into a drag that then had to be aimed.
 */
export const TOUCH_DRAG_THRESHOLD_PX = 8;

export const dragThresholdFor = (pointerType: string): number =>
  pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD_PX : PRECISE_DRAG_THRESHOLD_PX;

/**
 * How far outside every zone a release still counts.
 *
 * Small on purpose, and the same for a finger as for a cursor: the points tile
 * the board, so the only places a pointer is outside all of them are the gutters
 * between them (a fraction of one point) and the air past the frame's edge. It
 * has to bridge those and reach no further — a tolerance wide enough to matter
 * inside the board would be a tolerance that plays the neighbouring point.
 */
export const DROP_TOLERANCE_PX = 16;

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 0 when the point is inside, otherwise the shortest distance to the edge. */
export const distanceToBounds = (point: DragPoint, bounds: Bounds): number => {
  const dx = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
  const dy = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
  return Math.hypot(dx, dy);
};

/**
 * Every square of the board carries `data-drop-zone` (written by `Board`): a
 * point's index, `BAR`, `OFF`, or `none` for a square that can never be moved to,
 * which is the opponent's tray. `null` here is that last case — a zone that is
 * not a destination, as opposed to no zone at all.
 */
const zoneIndex = (element: Element): number | null => {
  const index = Number.parseInt(element.getAttribute('data-drop-zone') ?? '', 10);
  return Number.isNaN(index) ? null : index;
};

/**
 * Where a release lands, or `null` for nowhere.
 *
 * Rect-based rather than `document.elementFromPoint`, because the ghost the
 * player is holding sits under their own pointer and would answer every hit test
 * itself — and because rects can be stubbed, where a paint order cannot.
 *
 * A zone under the pointer answers for itself, target or not. That is the whole
 * difference from a board of scattered piles: the points tile, so a release over
 * a point that is *not* a legal destination has to be a release over nothing, or
 * the tolerance below would quietly play the point next door.
 */
export const resolveDropTarget = (
  point: DragPoint,
  targets: readonly number[],
  root: ParentNode = document,
  tolerancePx: number = DROP_TOLERANCE_PX,
): number | null => {
  let nearest: { index: number; distance: number } | null = null;

  for (const element of root.querySelectorAll('[data-drop-zone]')) {
    const rect = element.getBoundingClientRect();
    // A collapsed rect has no position worth comparing — which is every rect in
    // jsdom, and is what keeps an unstubbed test from matching anything.
    if (rect.width <= 0 || rect.height <= 0) continue;

    const index = zoneIndex(element);
    const distance = distanceToBounds(point, rect);
    if (distance === 0) return index !== null && targets.includes(index) ? index : null;

    if (index === null || !targets.includes(index)) continue;
    if (distance <= tolerancePx && (nearest === null || distance < nearest.distance)) {
      nearest = { index, distance };
    }
  }

  return nearest?.index ?? null;
};
