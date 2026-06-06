import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the board and opening status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /backgammon/i })).toBeDefined();
    expect(screen.getByText(/white to roll/i)).toBeDefined();
    // 24 points are rendered.
    expect(screen.getAllByLabelText(/^point \d+$/)).toHaveLength(24);
  });

  it('rolls into the moving phase', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^roll$/i }));
    expect(await screen.findByText(/to move/i)).toBeDefined();
  });
});
