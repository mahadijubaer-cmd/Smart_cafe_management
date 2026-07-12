import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export type PageHeaderCrumb = { label: string; href?: string }

type PageHeaderProps = {
  title: string
  description?: string
  eyebrow?: string
  action?: ReactNode
  breadcrumbs?: PageHeaderCrumb[]
}

export default function PageHeader({ title, description, eyebrow, action, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="motion-safe:animate-fade-up flex flex-wrap items-start justify-between gap-4">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumb className="mb-3">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                <Fragment key={crumb.label}>
                  <BreadcrumbItem>
                    {crumb.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {i < breadcrumbs.length - 1 ? <BreadcrumbSeparator /> : null}
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}

        {eyebrow ? (
          <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            {eyebrow}
          </p>
        ) : null}

        <h1 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
