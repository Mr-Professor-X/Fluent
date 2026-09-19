import './globals.css';
import './theme.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Fluid — Understand everyone', description: 'Real-time multilingual conversations' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
