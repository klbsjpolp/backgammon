import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpdateBanner } from './AppUpdates';

describe('UpdateBanner', () => {
  it('names the version that is waiting', () => {
    render(<UpdateBanner version="v1.2.3" onUpdate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByTestId('update-banner').textContent).toMatch(/La version v1\.2\.3 est disponible/);
  });

  it('still announces an update when the poll has not said which one', () => {
    // `latestVersion` is null until `runtime-config.json` answers, and the
    // service worker can have a build staged before that lands — the banner is
    // shown either way, so it needs a sentence with no version in it.
    render(<UpdateBanner version={null} onUpdate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByTestId('update-banner').textContent).toMatch(/Une mise à jour est disponible/);
  });
});
