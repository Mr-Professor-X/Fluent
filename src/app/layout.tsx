import './fluid.css';
import './layout-polish.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Fluid — Speak naturally. Understand everyone.',
  description: 'Real-time multilingual voice and chat. Everyone speaks their own language.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
  colorScheme: 'dark light',
};

/** Runs before the first paint so the saved theme (dark by default) never flashes. */
const themeScript = `try{var t=localStorage.getItem('fluid-theme-v2');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Fluid has its own dark mode, so tell the Dark Reader extension not to repaint it. */}
        <meta name="darkreader-lock" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
