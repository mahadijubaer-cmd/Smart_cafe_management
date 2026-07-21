import type { ReactNode } from 'react'
import { Inter, Manrope } from 'next/font/google'

import './globals.css'
import ToastProvider from '@/components/ToastProvider'
import ThemeProvider from '@/components/ThemeProvider'
import ImpersonationBanner from '@/components/platform/ImpersonationBanner'
import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import { TooltipProvider } from '@/components/ui/tooltip'

const bodyFont = Inter({ subsets: ['latin'], variable: '--font-body' })
const headingFont = Manrope({ subsets: ['latin'], variable: '--font-heading' })

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`} suppressHydrationWarning>
      <head>
        <title>Smart Cafe Management System</title>
        <meta name="description" content="SCMS - BRAC University" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />
      </head>
      <body className="flex min-h-screen flex-col bg-background font-sans" suppressHydrationWarning>
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            <ImpersonationBanner />
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
            <ToastProvider />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
