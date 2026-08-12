import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/Button';
import { reloadApp } from '@/lib/reload';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * The last line of defence around the app.
 *
 * React unmounts the whole tree when a render throws, so without this any bug
 * that reaches the renderer — a frame the guest could not parse, a board index
 * that came back undefined — shows as a blank white page with no way out but
 * the browser's reload button, and on a phone that is indistinguishable from
 * the app being broken for good.
 *
 * A class is not a style choice: error boundaries are the one thing hooks still
 * cannot express.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing collects these yet (Sentry is deferred), but a crash that leaves
    // no trace at all is not debuggable from a bug report either.
    console.error('Unhandled error in the backgammon app', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center text-fg">
        <h1 className="text-xl font-bold text-heading">Something went wrong</h1>
        <p className="text-sm text-muted">
          The board could not be drawn. Starting over should clear it; a game in progress is lost either way.
        </p>
        {/* The message is for a bug report, not for the player, hence the fold. */}
        <details className="w-full text-left text-xs text-muted">
          <summary className="cursor-pointer">Details</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{error.message}</pre>
        </details>
        <Button onClick={reloadApp}>Reload</Button>
      </div>
    );
  }
}
