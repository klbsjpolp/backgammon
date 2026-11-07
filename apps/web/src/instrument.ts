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
    // Dedupe drops an event identical to the one before it, and it compares only
    // message, fingerprint and stack trace — every game.completed matches on all
    // three, by design of its fixed fingerprint. It discarded every game after
    // the first in a page session, 15 of 26 in the first week. A real error
    // repeated twice in a row now costs one extra event, which is nothing here.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Dedupe'),
  });
} else if (import.meta.env.DEV) {
  console.info('[sentry] disabled: VITE_SENTRY_DSN is not set');
}
