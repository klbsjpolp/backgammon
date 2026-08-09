import { useState } from 'react';
import { LocalPanel } from '@/components/LocalPanel';
import { OnlinePanel } from '@/components/OnlinePanel';
import { cn } from '@/lib/cn';

type Mode = 'local' | 'online';

export const App = () => {
  const [mode, setMode] = useState<Mode>('local');

  return (
    <div
      className={cn(
        'mx-auto flex min-h-full w-full max-w-3xl flex-col items-center gap-4 px-4 py-4 text-emerald-50',
        // Keep the bottom row of controls clear of the home indicator / gesture bar.
        'pb-[calc(1rem+env(safe-area-inset-bottom))]',
        'compact:max-w-none compact:gap-2 compact:py-2',
      )}
    >
      {/* Phones put the title and the mode switch on one line; there is height to save. */}
      <div
        className={cn(
          'flex w-full flex-col items-center gap-3',
          'max-sm:flex-row max-sm:justify-between max-sm:gap-2',
          'compact:flex-row compact:justify-between compact:gap-2',
        )}
      >
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-amber-300 max-sm:text-xl compact:text-xl">
            Backgammon
          </h1>
        </header>

        <div className="inline-flex rounded-lg bg-emerald-950/60 p-1 text-sm">
          {(['local', 'online'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'touch-manipulation rounded-md px-4 py-1.5 font-semibold capitalize transition select-none',
                mode === m ? 'bg-amber-500 text-stone-900' : 'text-emerald-200/70 hover:text-emerald-50',
              )}
            >
              {m === 'local' ? 'vs AI' : 'online'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'local' ? <LocalPanel /> : <OnlinePanel />}
    </div>
  );
};
