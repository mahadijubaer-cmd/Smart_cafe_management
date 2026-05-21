'use client'

import { Toaster } from 'react-hot-toast'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
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
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
