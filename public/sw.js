// Minimal no-op service worker for Blynk Terminal installability.
// No caching, no offline behavior, no push handling — install/activate only.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
