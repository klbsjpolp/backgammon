import * as Sentry from '@sentry/react';
import { APP_VERSION } from '@/lib/appVersion';

// Imported first from main.tsx, so an error thrown while the rest of the app
// loads is already caught. No DSN — dev, previews, forks — means no Sentry at
// all, rather than events sent nowhere.
const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: APP_VERSION,
    // Every finished game is a span (see gameAnalytics.ts); sampling would drop
    // games, not just traces. Page-load tracing and session replay are left out:
    // nothing here needs them yet, and replay is the heavy part of the SDK.
    tracesSampleRate: 1.0,
  });
} else if (import.meta.env.DEV) {
  console.info('[sentry] disabled: VITE_SENTRY_DSN is not set');
}
