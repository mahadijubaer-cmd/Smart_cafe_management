import { ReactNode } from 'react'

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Placeholder for staff navigation */}
      <nav className="bg-primary text-white p-4">
        <h1 className="text-xl font-bold">Staff Dashboard</h1>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  )
}
