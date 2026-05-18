import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'Cortex Operacional',
  description: 'Motor de organização pessoal, financeira e estratégica',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cortex',
  },
  applicationName: 'Cortex',
  openGraph: {
    title: 'Cortex Operacional',
    description: 'Motor de organização pessoal, financeira e estratégica',
    type: 'website',
    locale: 'pt_BR',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#00D4FF',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="Cortex" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Cortex" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#00D4FF" />
      </head>
      <body suppressHydrationWarning className="cortex-app">
        
        {/* Você pode descomentar a linha abaixo se quiser manter as linhas de grade de fundo */}
        {/* <div className="background-grid" /> */}
        
        <ServiceWorkerRegister />
        <TopBar />
        {children}
      </body>
    </html>
  );
}
