import { cn } from '@/lib/cn';

export const Button = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={cn(
      'rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  />
);
