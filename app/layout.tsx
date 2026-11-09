import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz', 'wdth'], variable: '--font-display', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'PlotTwist',
  description: 'ADU feasibility for every single-family lot in College Park, MD, with citywide rule what-ifs.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000' };

/** Dark by default; a saved choice wins. Runs before paint so a reload never flashes the wrong theme. */
const THEME_INIT = `try{if(localStorage.getItem('plottwist-theme')==='light')document.documentElement.removeAttribute('data-theme')}catch{}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${display.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT}</Script>
        {children}
      </body>
    </html>
  );
}
