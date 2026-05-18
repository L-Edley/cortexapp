'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
          console.log('Cortex SW registered:', registration.scope);
        } catch (error) {
          console.log('Cortex SW registration failed:', error);
        }
      });
    }
  }, []);

  return null;
}
