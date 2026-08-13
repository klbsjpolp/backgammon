import { useState } from 'react';
import { LocalPanel } from '@/components/LocalPanel';
import { OnlinePanel } from '@/components/OnlinePanel';
import { cn } from '@/lib/cn';

type Mode = 'local' | 'online';

export const App = () => {
  const [mode, setMode] = useState<Mode>('local');

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col lg:max-w-5xl items-center gap-5 px-4 py-6 text-emerald-50">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-amber-300">Backgammon</h1>
      </header>

      <div className="inline-flex rounded-lg bg-emerald-950/60 p-1 text-sm">
        {(['local', 'online'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md px-4 py-1.5 font-semibold capitalize transition',
              mode === m ? 'bg-amber-500 text-stone-900' : 'text-emerald-200/70 hover:text-emerald-50',
            )}
          >
            {m === 'local' ? 'vs AI' : 'online'}
          </button>
        ))}
      </div>

      {mode === 'local' ? <LocalPanel /> : <OnlinePanel />}
    </div>
  );
};
