import * as React from "react"
import { ALWAYS_AVAILABLE_INDICATORS, getIndicatorFillConfig } from "@/app-config"
import type { HexMapDeckObject, MapboxDrawApi, NestedOption } from "@/app-types"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"
import { useHexPerformanceFixtureSupport } from "@/performance-fixtures/hex-performance-fixture"
import { useMapData } from "./use-map-data"

function areSetsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function logSelectionTiming(label: string, startedAt: number, details?: Record<string, unknown>) {
  const elapsedMs = performance.now() - startedAt
  console.info(`[selection-timing] ${label}: ${elapsedMs.toFixed(2)}ms`, details ?? {})
}

type UseMapIndicatorStateParams = {
  useHexPerformanceFixture: boolean
  ensureDuckDbClient: () => Promise<DuckDbClient>
  drawRef: React.MutableRefObject<MapboxDrawApi | null>
  setDrawnPolygons: React.Dispatch<React.SetStateAction<GeoJSON.Feature[]>>
  selectedCellDetailsCellId: string | null
  clearSelectedCellDetails: () => void
  loadSelectedCellDetails: (h3Cell: string) => void
}

export function useMapIndicatorState({
  useHexPerformanceFixture,
  ensureDuckDbClient,
  drawRef,
  setDrawnPolygons,
  selectedCellDetailsCellId,
  clearSelectedCellDetails,
  loadSelectedCellDetails,
}: UseMapIndicatorStateParams) {
  const [selectedIndicator, setSelectedIndicator] = React.useState("compliance_weighted_avg")
  const [availableIndicators, setAvailableIndicators] = React.useState<NestedOption[]>(
    ALWAYS_AVAILABLE_INDICATORS
  )
  const [selectedCellIds, setSelectedCellIds] = React.useState<Set<string>>(() => new Set())
  const {
    hexData,
    setHexData,
    amenityRadarData,
    selectedAmenityRadarData,
    activeBounds,
    setActiveBounds,
    mapDataError,
    setMapDataError,
    clearMapData,
    loadMapData,
    loadAmenityRadarData,
    clearSelectedAmenityRadarData,
    nextMapDataRequestId,
  } = useMapData(ensureDuckDbClient)

  const selectedCellsData = React.useMemo(
    () => hexData.filter((cell) => selectedCellIds.has(cell.h3_cell)),
    [hexData, selectedCellIds]
  )
  const activeFillConfig = React.useMemo(
    () => getIndicatorFillConfig(selectedIndicator, activeBounds),
    [activeBounds, selectedIndicator]
  )

  React.useEffect(() => {
    if (selectedCellIds.size === 0 || hexData.length === 0) {
      clearSelectedAmenityRadarData()
      return
    }

    void loadAmenityRadarData([...selectedCellIds])
  }, [clearSelectedAmenityRadarData, hexData.length, loadAmenityRadarData, selectedCellIds])

  const { ensureInstalled: ensureHexPerformanceFixtureInstalled } = useHexPerformanceFixtureSupport({
    enabled: useHexPerformanceFixture,
    hexDataLength: hexData.length,
    selectedIndicator,
    ensureDuckDbClient,
    loadMapData,
    nextMapDataRequestId,
    setAvailableIndicators,
    setHexData,
    setActiveBounds,
    setMapDataError,
  })

  const resetSelectedCells = React.useCallback(() => {
    setSelectedCellIds(new Set())
    clearSelectedCellDetails()
  }, [clearSelectedCellDetails])

  const handleMapCellClick = React.useCallback(
    (obj: HexMapDeckObject | null) => {
      if (!obj) {
        resetSelectedCells()
        return
      }

      if (selectedCellIds.has(obj.h3_cell) && selectedCellIds.size === 1) {
        resetSelectedCells()
        return
      }

      setSelectedCellIds(new Set([obj.h3_cell]))
      void loadSelectedCellDetails(obj.h3_cell)
    },
    [loadSelectedCellDetails, resetSelectedCells, selectedCellIds]
  )

  const handleIndicatorChange = React.useCallback(
    async (value: string) => {
      if (!useHexPerformanceFixture && hexData.length === 0) return

      const requestId = nextMapDataRequestId()

      try {
        if (useHexPerformanceFixture) {
          await ensureHexPerformanceFixtureInstalled()
        }
        const didUpdate = await loadMapData(value, requestId)
        if (didUpdate) {
          setSelectedIndicator(value)
          if (selectedCellDetailsCellId) {
            void loadSelectedCellDetails(selectedCellDetailsCellId)
          } else {
            clearSelectedCellDetails()
          }
        }
      } catch (error) {
        console.error("DuckDB indicator refresh failed:", error)
        clearMapData(error instanceof Error ? error.message : "Map data could not be loaded.")
      }
    },
    [
      clearMapData,
      ensureHexPerformanceFixtureInstalled,
      hexData.length,
      loadMapData,
      nextMapDataRequestId,
      clearSelectedCellDetails,
      loadSelectedCellDetails,
      selectedCellDetailsCellId,
      useHexPerformanceFixture,
    ]
  )

  const handleSelectBin = React.useCallback(
    (binIndex: number | null) => {
      if (binIndex === null) {
        resetSelectedCells()
        return
      }

      const bounds = activeBounds
      const startedAt = performance.now()
      const cellsInBin = hexData.filter((cell) => cell.bin === binIndex)
      const cellsInBinIds = new Set(cellsInBin.map((cell) => cell.h3_cell))

      logSelectionTiming("handleSelectBin.filter", startedAt, {
        cells_total: hexData.length,
        cells_selected: cellsInBinIds.size,
        bin_min: bounds[binIndex],
        bin_max: bounds[binIndex + 1],
      })

      if (areSetsEqual(selectedCellIds, cellsInBinIds)) {
        resetSelectedCells()
        return
      }

      const draw = drawRef.current
      if (draw) {
        const all = draw.getAll()
        const ids = (all.features as Array<{ id?: unknown }>)
          .map((feature) => feature.id)
          .filter((id): id is string => typeof id === "string")
        if (ids.length > 0) draw.delete(ids)
      }

      setDrawnPolygons([])
      setSelectedCellIds(cellsInBinIds)
      clearSelectedCellDetails()
    },
    [activeBounds, clearSelectedCellDetails, drawRef, hexData, resetSelectedCells, selectedCellIds, setDrawnPolygons]
  )

  return {
    selectedIndicator,
    availableIndicators,
    setAvailableIndicators,
    hexData,
    amenityRadarData,
    selectedAmenityRadarData,
    activeBounds,
    activeFillConfig,
    mapDataError,
    setMapDataError,
    clearMapData,
    loadMapData,
    loadAmenityRadarData,
    selectedCellIds,
    setSelectedCellIds,
    selectedCellsData,
    resetSelectedCells,
    handleMapCellClick,
    handleIndicatorChange,
    handleSelectBin,
  }
}
