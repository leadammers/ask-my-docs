import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AuthGate } from '@/components/auth-gate';
import { RetentionBanner, RetentionFooter } from '@/components/retention-notice';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ask-my-docs',
  description: 'Chat with your documents, grounded with citations.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RetentionBanner />
          <TooltipProvider>{children}</TooltipProvider>
          <RetentionFooter />
          <Toaster />
          <AuthGate />
        </ThemeProvider>
      </body>
    </html>
  );
}
