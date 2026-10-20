import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Capture beforeinstallprompt early in case it fires before React mounts
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __deferredPwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__deferredPwaPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event('pwa-prompt-available'));
});

// Purge legacy caches and register Service Worker
if ('caches' in window) {
  caches.delete('costuraplan-v1').catch(() => {});
  caches.delete('costuraplan-v2').catch(() => {});
  caches.delete('costuraplan-v3').catch(() => {});
  caches.delete('costuraplan-v4').catch(() => {});
}

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.update();
      })
      .catch(() => {
        // Service worker requires HTTPS or localhost / chrome://flags on LAN IP
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
