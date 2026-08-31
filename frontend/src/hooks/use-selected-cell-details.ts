import * as React from "react"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"
import type { CellDetailRow } from "@/db/duckdb/runCalculations"

export function useSelectedCellDetails(ensureDuckDbClient: () => Promise<DuckDbClient>) {
  const [selectedCellDetails, setSelectedCellDetails] = React.useState<CellDetailRow[]>([])
  const [selectedCellDetailsCellId, setSelectedCellDetailsCellId] = React.useState<string | null>(null)
  const [selectedCellDetailsLoading, setSelectedCellDetailsLoading] = React.useState(false)

  const clearSelectedCellDetails = React.useCallback(() => {
    setSelectedCellDetails([])
    setSelectedCellDetailsCellId(null)
    setSelectedCellDetailsLoading(false)
  }, [])

  const loadSelectedCellDetails = React.useCallback(
    async (h3Cell: string) => {
      setSelectedCellDetails([])
      setSelectedCellDetailsCellId(h3Cell)
      setSelectedCellDetailsLoading(true)

      try {
        const client = await ensureDuckDbClient()
        const { getCellDetails } = await import("@/db/duckdb/runCalculations")
        const details = await getCellDetails(client.conn, h3Cell)
        setSelectedCellDetails(details)
      } catch (error) {
        console.error("DuckDB cell details query failed:", error)
        setSelectedCellDetails([])
      } finally {
        setSelectedCellDetailsLoading(false)
      }
    },
    [ensureDuckDbClient]
  )

  return {
    selectedCellDetails,
    selectedCellDetailsCellId,
    selectedCellDetailsLoading,
    clearSelectedCellDetails,
    loadSelectedCellDetails,
  }
}
