import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-3xl font-bold text-foreground">Unauthorized</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          You do not have permission to view this page.
        </p>
        <Button asChild className="mt-6">
          <Link href="/login">Go to login</Link>
        </Button>
      </Card>
    </main>
  )
}