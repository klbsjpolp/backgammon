import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from '@/App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { registerServiceWorker } from '@/lib/serviceWorker';

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
