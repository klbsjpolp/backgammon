import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { reloadApp } from '@/lib/reload';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('@/lib/reload', () => ({ reloadApp: vi.fn() }));

const Boom = ({ explode }: { explode: boolean }) => {
  if (explode) throw new Error('board points are undefined');
  return <p>the board</p>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself; the boundary adds its own line. Neither
    // is a test failure, and both would otherwise drown the run.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('the board')).toBeDefined();
  });

  it('shows a way out instead of a blank page when a render throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    // The message is what a bug report needs; the player gets the button.
    expect(screen.getByText(/board points are undefined/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /recharger/i }));
    expect(vi.mocked(reloadApp)).toHaveBeenCalled();
  });
});
