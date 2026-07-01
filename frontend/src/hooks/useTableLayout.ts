'use client'

import { useCallback, useState } from 'react'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'

export interface TablePosition {
  x: number
  y: number
  zone: string
  capacity: number
  tableNumber: string
  status: TableMap['status']
}

interface TableLayoutHook {
  tables: TableMap[]
  positions: Map<number, TablePosition>
  isDirty: boolean
  updatePosition: (tableId: number, x: number, y: number) => void
  updateMeta: (tableId: number, zone: string, capacity: number, tableNumber: string) => void
  save: () => Promise<void>
  reset: () => void
}

function buildPositions(tables: TableMap[]): Map<number, TablePosition> {
  return new Map(
    tables.map((t) => [
      t.table_id,
      {
        x: t.position_x,
        y: t.position_y,
        zone: t.zone,
        capacity: t.capacity,
        tableNumber: t.table_number,
        status: t.status,
      },
    ])
  )
}

export function useTableLayout(initialTables: TableMap[]): TableLayoutHook {
  const [tables, setTables] = useState<TableMap[]>(initialTables)
  const [positions, setPositions] = useState<Map<number, TablePosition>>(
    () => buildPositions(initialTables)
  )
  const [isDirty, setIsDirty] = useState(false)

  const updatePosition = useCallback((tableId: number, x: number, y: number) => {
    setPositions((prev) => {
      const next = new Map(prev)
      const current = next.get(tableId)
      if (current) {
        next.set(tableId, { ...current, x, y })
      }
      return next
    })
    setIsDirty(true)
  }, [])

  const updateMeta = useCallback(
    (tableId: number, zone: string, capacity: number, tableNumber: string) => {
      setPositions((prev) => {
        const next = new Map(prev)
        const current = next.get(tableId)
        if (current) {
          next.set(tableId, { ...current, zone, capacity, tableNumber })
        }
        return next
      })
      setIsDirty(true)
    },
    []
  )

  const save = useCallback(async () => {
    const payload = Array.from(positions.entries()).map(([tableId, pos]) => ({
      table_id: tableId,
      position_x: pos.x,
      position_y: pos.y,
      zone: pos.zone,
      capacity: pos.capacity,
    }))
    const response = await apiClient.patch('/tables/layout', { tables: payload })
    const updated: TableMap[] = response.data
    setTables(updated)
    setPositions(buildPositions(updated))
    setIsDirty(false)
  }, [positions])

  const reset = useCallback(() => {
    setPositions(buildPositions(tables))
    setIsDirty(false)
  }, [tables])

  return { tables, positions, isDirty, updatePosition, updateMeta, save, reset }
}
