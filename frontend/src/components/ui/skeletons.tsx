'use client'

import * as React from 'react'

function SkeletonBlock({ className = '' }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`animate-shimmer ${className}`} />
}

export function MenuCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <SkeletonBlock className="h-40 w-full rounded-t-xl" />
      <div className="space-y-4 p-4">
        <SkeletonBlock className="h-5 w-3/4 rounded-lg" />
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-full rounded-lg" />
          <SkeletonBlock className="h-3 w-2/3 rounded-lg" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-6 w-1/3 rounded-lg" />
          <SkeletonBlock className="h-8 w-20 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function CategoryTabSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-9 w-24 rounded-full" />
      ))}
    </div>
  )
}

export function TableGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 overflow-x-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 30 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-16 w-16 rounded-xl" />
      ))}
    </div>
  )
}

export function WalletCardSkeleton() {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <SkeletonBlock className="h-6 w-2/5 rounded-lg" />
        <SkeletonBlock className="h-10 w-3/5 rounded-lg" />
        <SkeletonBlock className="h-4 w-4/5 rounded-lg" />
      </div>
    </div>
  )
}

export function OrderHistorySkeleton() {
  return (
    <div className="space-y-3 rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-2xl border border-black/5 p-4 sm:grid-cols-[1.2fr_0.7fr_0.5fr_0.5fr]">
          <SkeletonBlock className="h-4 w-4/5 rounded-lg" />
          <SkeletonBlock className="h-4 w-3/4 rounded-lg" />
          <SkeletonBlock className="h-4 w-1/2 rounded-lg" />
          <SkeletonBlock className="h-4 w-2/3 rounded-lg" />
        </div>
      ))}
    </div>
  )
}
