import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/dm-sans'
import { installStorageLinkInterceptor } from '@/lib/storage-link-interceptor'

installStorageLinkInterceptor();

createRoot(document.getElementById("root")!).render(<App />);

// Minimal PWA: register the no-op service worker for installability.
// Errors are swallowed (e.g. unsupported browsers / blocked contexts).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
