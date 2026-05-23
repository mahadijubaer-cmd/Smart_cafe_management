import { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(26,77,46,0.14),_transparent_35%),linear-gradient(135deg,#F5F0E8_0%,#FFFFFF_48%,#DDE9DE_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#1A4D2E]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[#F59E0B]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-stretch px-4 py-6 md:px-6 lg:px-8">
        <div className="w-full">{children}</div>
      </div>
    </div>
  )
}
