import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a board font size alongside a text colour', () => {
    // `text-*` covers both sizes and colours, so an unregistered size key gets
    // filed as a colour and dropped by the one that follows it — silently, since
    // the utility itself is still generated. That is how the checker count on a
    // point of six lost its size and rendered at the inherited body font.
    const merged = cn('size-board-checker text-board-checker font-bold', 'bg-stone-100 text-stone-900');

    expect(merged).toContain('text-board-checker');
    expect(merged).toContain('text-stone-900');
  });

  it('still collapses conflicting text colours and conflicting board sizes', () => {
    expect(cn('text-stone-100', 'text-stone-900')).toBe('text-stone-900');
    expect(cn('text-board-label', 'text-board-count')).toBe('text-board-count');
    expect(cn('text-sm', 'text-board-count')).toBe('text-board-count');
  });

  it('leaves the board spacing keys alone — they cannot be mistaken for a colour', () => {
    expect(cn('w-board-point h-board-depth gap-board-gutter')).toBe('w-board-point h-board-depth gap-board-gutter');
  });
});
