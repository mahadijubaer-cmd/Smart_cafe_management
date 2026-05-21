export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-3xl border border-black/10 bg-white p-8 text-center shadow-xl">
        <h1 className="text-3xl font-bold text-slate-900">Unauthorized</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          You do not have permission to view this page.
        </p>
        <a className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white" href="/login">
          Go to login
        </a>
      </div>
    </main>
  )
}