import type { ReactNode } from 'react'

import './globals.css'
import ToastProvider from '@/components/ToastProvider'

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <title>Smart Cafe Management System</title>
        <meta name="description" content="SCMS - BRAC University" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="bg-background text-gray-900">
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
