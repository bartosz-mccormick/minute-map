import * as React from "react"
import { buildIndicatorOptions } from "@/app-config"
import type { NestedOption, Threshold, Weight } from "@/app-types"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

type UseRunAnalysisParams = {
  thresholds: Threshold[]
  weights: Weight[]
  selectedIndicator: string
  ensureDuckDbClient: () => Promise<DuckDbClient>
  loadMapData: (indicator: string) => Promise<boolean>
  loadAmenityRadarData: () => Promise<void>
  resetSelectedCells: () => void
  setAvailableIndicators: React.Dispatch<React.SetStateAction<NestedOption[]>>
  clearMapData: (message: string) => void
  setMapDataError: React.Dispatch<React.SetStateAction<string | null>>
  setConfigOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useRunAnalysis({
  thresholds,
  weights,
  selectedIndicator,
  ensureDuckDbClient,
  loadMapData,
  loadAmenityRadarData,
  resetSelectedCells,
  setAvailableIndicators,
  clearMapData,
  setMapDataError,
  setConfigOpen,
}: UseRunAnalysisParams) {
  const [loading, setLoading] = React.useState(false)

  const handleAnalyze = React.useCallback(async () => {
    setLoading(true)
    setMapDataError(null)

    try {
      const client = await ensureDuckDbClient()
      const [{ createInputTables }, { runCalculations }] = await Promise.all([
        import("@/db/duckdb/createInputTables"),
        import("@/db/duckdb/runCalculations"),
      ])

      await createInputTables(client.conn, thresholds, weights)
      await runCalculations(client.conn)
      await loadMapData(selectedIndicator)
      await loadAmenityRadarData()
      resetSelectedCells()
      setAvailableIndicators(buildIndicatorOptions(thresholds))
      setConfigOpen(false)
    } catch (error) {
      console.error("DuckDB analysis failed:", error)
      setAvailableIndicators([])
      clearMapData(error instanceof Error ? error.message : "Analysis failed.")
    } finally {
      setLoading(false)
    }
  }, [
    clearMapData,
    ensureDuckDbClient,
    loadMapData,
    loadAmenityRadarData,
    resetSelectedCells,
    selectedIndicator,
    setAvailableIndicators,
    setConfigOpen,
    setMapDataError,
    thresholds,
    weights,
  ])

  return { loading, handleAnalyze }
}
