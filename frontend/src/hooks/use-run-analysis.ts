import * as React from "react"
import { buildIndicatorOptions } from "@/app-config"
import type { Destination, NestedOption, Threshold, TransportMode, Weight } from "@/app-types"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

type UseRunAnalysisParams = {
  thresholds: Threshold[]
  weights: Weight[]
  selectedIndicator: string
  setSelectedIndicator: React.Dispatch<React.SetStateAction<string>>
  ensureDuckDbClient: () => Promise<DuckDbClient>
  loadMapData: (indicator: string) => Promise<boolean>
  loadAmenityRadarData: () => Promise<void>
  resetSelection: () => void
  setAvailableIndicators: React.Dispatch<React.SetStateAction<NestedOption[]>>
  clearMapData: (message: string) => void
  setMapDataError: React.Dispatch<React.SetStateAction<string | null>>
  setConfigOpen: React.Dispatch<React.SetStateAction<boolean>>
  destinations: Destination[]
  transportModes: TransportMode[]
  baseIndicators: NestedOption[]
  singleDestinationIndicators: NestedOption[]
  onAnalysisSuccess?: () => void
}

export function useRunAnalysis({
  thresholds,
  weights,
  selectedIndicator,
  setSelectedIndicator,
  ensureDuckDbClient,
  loadMapData,
  loadAmenityRadarData,
  resetSelection,
  setAvailableIndicators,
  clearMapData,
  setMapDataError,
  setConfigOpen,
  destinations,
  transportModes,
  baseIndicators,
  singleDestinationIndicators,
  onAnalysisSuccess,
}: UseRunAnalysisParams) {
  const [loading, setLoading] = React.useState(false)

  const hasIndicator = React.useCallback((options: NestedOption[], value: string): boolean => {
    return options.some((option) =>
      option.value === value || (option.children ? hasIndicator(option.children, value) : false)
    )
  }, [])

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
      const nextIndicators = buildIndicatorOptions(thresholds, {
        destinations,
        transportModes,
        baseIndicators,
        singleDestinationIndicators,
      })
      const nextSelectedIndicator = hasIndicator(nextIndicators, selectedIndicator)
        ? selectedIndicator
        : nextIndicators[0]?.value ?? "compliance_weighted_avg"

      setSelectedIndicator(nextSelectedIndicator)
      setAvailableIndicators(nextIndicators)
      await loadMapData(nextSelectedIndicator)
      await loadAmenityRadarData()
      resetSelection()
      setConfigOpen(false)
      onAnalysisSuccess?.()
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
    hasIndicator,
    loadMapData,
    loadAmenityRadarData,
    onAnalysisSuccess,
    resetSelection,
    selectedIndicator,
    setAvailableIndicators,
    setConfigOpen,
    setMapDataError,
    setSelectedIndicator,
    destinations,
    transportModes,
    baseIndicators,
    singleDestinationIndicators,
    thresholds,
    weights,
  ])

  return { loading, handleAnalyze }
}
