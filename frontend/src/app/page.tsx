'use client'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-primary">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          Smart Cafe Management System
        </h1>
        <p className="text-xl text-gray-200 mb-8">
          BRAC University CSE400 - Final Year Thesis
        </p>
        <a
          href="/login"
          className="inline-block px-8 py-3 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-500 transition"
        >
          Get Started
        </a>
      </div>
    </main>
  )
}
