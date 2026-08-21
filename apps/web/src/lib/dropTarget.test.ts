import { describe, expect, it } from 'vitest';
import { distanceToBounds, dragThresholdFor, resolveDropTarget } from './dropTarget';

/** A row of zones, each 40 wide with a 6px gutter between — the board, flattened. */
const boardOf = (zones: (number | 'none')[]): HTMLElement => {
  const root = document.createElement('div');
  zones.forEach((zone, i) => {
    const element = document.createElement('button');
    element.setAttribute('data-drop-zone', String(zone));
    const left = i * 46;
    element.getBoundingClientRect = () =>
      ({
        x: left,
        y: 0,
        left,
        top: 0,
        right: left + 40,
        bottom: 40,
        width: 40,
        height: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    root.append(element);
  });
  return root;
};

describe('drag thresholds', () => {
  it('asks a finger to travel further than a cursor', () => {
    // A touch contact drifts a few pixels while the player is merely tapping, and
    // at the cursor's threshold every tap promoted itself into a drag.
    expect(dragThresholdFor('touch')).toBeGreaterThan(dragThresholdFor('mouse'));
    expect(dragThresholdFor('pen')).toBe(dragThresholdFor('mouse'));
  });
});

describe('distanceToBounds', () => {
  const bounds = { left: 10, right: 20, top: 10, bottom: 20 };

  it('is nothing at all inside', () => {
    expect(distanceToBounds({ x: 15, y: 15 }, bounds)).toBe(0);
    expect(distanceToBounds({ x: 10, y: 20 }, bounds)).toBe(0);
  });

  it('is the shortest way back in from outside', () => {
    expect(distanceToBounds({ x: 25, y: 15 }, bounds)).toBe(5);
    expect(distanceToBounds({ x: 23, y: 14 }, bounds)).toBe(3);
  });
});

describe('resolveDropTarget', () => {
  it('lands on the zone under the pointer', () => {
    const root = boardOf([0, 1, 2]);
    expect(resolveDropTarget({ x: 66, y: 20 }, [1, 2], root)).toBe(1);
  });

  it('refuses a zone that is not a destination rather than reaching past it', () => {
    // The points tile the board, so a tolerance able to see over the one under the
    // pointer would play its neighbour — the move nobody aimed at.
    const root = boardOf([0, 1, 2]);
    expect(resolveDropTarget({ x: 20, y: 20 }, [1], root)).toBeNull();
  });

  it('never lands on a square nothing can be moved to', () => {
    // The bar and the opponent's tray are real squares that no checker is ever
    // moved to. Being zones at all is what stops a release there snapping to a
    // point that is only a few pixels away.
    const root = boardOf(['none', 1]);
    expect(resolveDropTarget({ x: 20, y: 20 }, [1], root)).toBeNull();
  });

  it('bridges the gutter between two points', () => {
    const root = boardOf([0, 1]);
    // 42 is inside the 6px gap; the nearer side of it wins.
    expect(resolveDropTarget({ x: 42, y: 20 }, [0, 1], root)).toBe(0);
    expect(resolveDropTarget({ x: 45, y: 20 }, [0, 1], root)).toBe(1);
  });

  it('gives up beyond the tolerance', () => {
    const root = boardOf([0]);
    expect(resolveDropTarget({ x: 50, y: 20 }, [0], root)).toBe(0);
    expect(resolveDropTarget({ x: 400, y: 20 }, [0], root)).toBeNull();
  });

  it('ignores zones with no size, which is every zone without a layout engine', () => {
    const root = document.createElement('div');
    const element = document.createElement('button');
    element.setAttribute('data-drop-zone', '3');
    root.append(element);
    expect(resolveDropTarget({ x: 0, y: 0 }, [3], root)).toBeNull();
  });
});
