"use client"

import * as React from "react"
import { Info, Settings, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cellToBoundary } from "h3-js"
import { booleanIntersects } from "@turf/boolean-intersects"
import { polygon as turfPolygon } from "@turf/helpers"
import { EditableThresholdsTable } from "@/components/editable-thresholds-table"
import { EditableWeightsTable } from "@/components/editable-weights-table"
import { NestedDropdownSelect } from "./components/nested-dropdown-select"
import { ComplianceStats } from "@/components/ui/compliance-stats"
import { HexMap } from "./components/hex-map"
import {
  getMapPerformanceMode,
  shouldUseHexPerformanceFixture,
} from "@/components/map-performance"
import { LegendBands } from "./components/legend-bands"
import { PoiPreview } from "./components/poi_preview"
import {
  MAP_OVERLAY_BUTTON_TEXT_CLASS,
  MAP_OVERLAY_BODY_MAIN_CLASS,
  MAP_OVERLAY_BODY_SMALL_CLASS,
  MAP_OVERLAY_DIALOG_TITLE_CLASS,
  MAP_OVERLAY_META_TEXT_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
  MAP_OVERLAY_SECTION_TITLE_CLASS,
} from "@/lib/map-overlay-styles"
import {
  ALWAYS_AVAILABLE_INDICATORS,
  buildIndicatorOptions,
  DESTINATIONS,
  fmt,
  getIndicatorFillConfig,
  INITIAL_SCENARIO,
  INITIAL_THRESHOLDS,
  INITIAL_WEIGHTS,
  MAX_TT,
  PRESET_NESTED_OPTIONS,
  PRESETS,
  TRANSPORT_MODES,
} from "@/app-config"
import type { HexMapCell, HexMapDeckObject, MapboxDrawApi, NestedOption, Threshold, Weight } from "@/app-types"
import type { DuckDbClient } from "./db/duckdb/createDuckDb"
import type { CellDetailRow } from "./db/duckdb/runCalculations"
import type { MapFixtureIndicatorRows } from "./db/duckdb/mapDataFixture"

const travelScenarios = [
  { value: "current", label: "Current" },
  // { value: "bikesharing-a", label: "Bike Sharing System Alternative A" },
  // { value: "bikesharing-b", label: "Bike Sharing System Alternative B" },
]

type HexPerformanceFixtureApi = {
  indicators?: NestedOption[]
  getHexData: (indicator: string) => HexMapCell[]
}

declare global {
  interface Window {
    __hexPerformanceFixture?: HexPerformanceFixtureApi
  }
}

function logSelectionTiming(label: string, startedAt: number, details?: Record<string, unknown>) {
  const elapsedMs = performance.now() - startedAt
  console.info(`[selection-timing] ${label}: ${elapsedMs.toFixed(2)}ms`, details ?? {})
}

function areSetsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function getHexPerformanceFixture() {
  if (typeof window === "undefined") return null
  return window.__hexPerformanceFixture ?? null
}

function collectIndicatorValues(indicators: NestedOption[]): string[] {
  const values: string[] = []

  for (const indicator of indicators) {
    if (indicator.children && indicator.children.length > 0) {
      values.push(...collectIndicatorValues(indicator.children))
    } else {
      values.push(indicator.value)
    }
  }

  return values
}

function getFixtureIndicatorRows(fixture: HexPerformanceFixtureApi): MapFixtureIndicatorRows[] {
  const indicatorValues = fixture.indicators
    ? collectIndicatorValues(fixture.indicators)
    : ["compliance_weighted_avg"]

  return indicatorValues.map((indicator) => ({
    indicator,
    rows: fixture.getHexData(indicator),
  }))
}

export default function App() {
  const mapPerformanceMode = getMapPerformanceMode()
  const isBaseMapOnly = mapPerformanceMode === "base"
  const useHexPerformanceFixture = shouldUseHexPerformanceFixture()
  const [selectedScenario, setSelectedScenario] = React.useState(INITIAL_SCENARIO)
  const [selectedPreset, setSelectedPreset] = React.useState("custom")
  const [thresholds, setThresholds] = React.useState<Threshold[]>(INITIAL_THRESHOLDS)
  const [weights, setWeights] = React.useState<Weight[]>(INITIAL_WEIGHTS)
  const [customThresholds, setCustomThresholds] = React.useState<Threshold[]>(INITIAL_THRESHOLDS)
  const [customWeights, setCustomWeights] = React.useState<Weight[]>(INITIAL_WEIGHTS)
  const [configOpen, setConfigOpen] = React.useState(false)
  const [selectedIndicator, setSelectedIndicator] = React.useState("compliance_weighted_avg")
  const [gridTransparency, setGridTransparency] = React.useState(65)
  const [availableIndicators, setAvailableIndicators] = React.useState<NestedOption[]>(
    ALWAYS_AVAILABLE_INDICATORS
  )

  const [hexData, setHexData] = React.useState<HexMapCell[]>([])
  const [activeBounds, setActiveBounds] = React.useState<number[]>([])
  const [mapDataError, setMapDataError] = React.useState<string | null>("Run analysis to load map data.")
  const [selectedCellIds, setSelectedCellIds] = React.useState<Set<string>>(() => new Set())
  const [selectedCellDetails, setSelectedCellDetails] = React.useState<CellDetailRow[]>([])
  const [selectedCellDetailsCellId, setSelectedCellDetailsCellId] = React.useState<string | null>(null)
  const [selectedCellDetailsLoading, setSelectedCellDetailsLoading] = React.useState(false)
  const selectedCellsData = React.useMemo(
    () => hexData.filter((cell) => selectedCellIds.has(cell.h3_cell)),
    [hexData, selectedCellIds]
  )
  const activeFillConfig = React.useMemo(
    () => getIndicatorFillConfig(selectedIndicator, activeBounds),
    [activeBounds, selectedIndicator]
  )

  const [drawnPolygons, setDrawnPolygons] = React.useState<GeoJSON.Feature[]>([])
  const drawRef = React.useRef<MapboxDrawApi | null>(null)
  const duckDbClientRef = React.useRef<DuckDbClient | null>(null)
  const duckDbInitPromiseRef = React.useRef<Promise<DuckDbClient> | null>(null)
  const hexPerformanceFixtureInstallPromiseRef = React.useRef<Promise<void> | null>(null)
  const hexPerformanceFixtureInitialLoadStartedRef = React.useRef(false)
  const mapDataRequestIdRef = React.useRef(0)
  const [loading, setLoading] = React.useState(false)

  const polygonSelectedCellIds = React.useMemo(() => {
    if (drawnPolygons.length === 0 || hexData.length === 0) return new Set<string>()
    const drawnFeature = drawnPolygons[0]
    if (!drawnFeature || drawnFeature.geometry.type !== "Polygon") return new Set<string>()

    const startedAt = performance.now()
    const selectedIds = new Set<string>()
    try {
      for (const cell of hexData) {
        try {
          const boundary = cellToBoundary(cell.h3_cell, true) as [number, number][]
          const ring: [number, number][] = [...boundary, boundary[0]]
          const hexPoly = turfPolygon([ring])
          if (booleanIntersects(hexPoly, drawnFeature)) {
            selectedIds.add(cell.h3_cell)
          }
        } catch {
          // Ignore malformed H3 cells.
        }
      }
      return selectedIds
    } finally {
      logSelectionTiming("polygonSelectedCellIds", startedAt, {
        cells_total: hexData.length,
        cells_selected: selectedIds.size,
      })
    }
  }, [drawnPolygons, hexData])

  const ensureDuckDbClient = React.useCallback(async () => {
    if (duckDbClientRef.current) return duckDbClientRef.current

    if (!duckDbInitPromiseRef.current) {
      duckDbInitPromiseRef.current = (async () => {
        const { createDuckDb } = await import("./db/duckdb/createDuckDb")
        const client = await createDuckDb()
        if (!useHexPerformanceFixture) {
          const { setupDb } = await import("./db/duckdb/setupDb")
          await setupDb(client)
        }

        duckDbClientRef.current = client
        return client
      })()
    }

    try {
      return await duckDbInitPromiseRef.current
    } catch (error) {
      duckDbInitPromiseRef.current = null
      console.error("DuckDB initialization failed:", error)
      throw error
    }
  }, [useHexPerformanceFixture])

  React.useEffect(() => {
    void ensureDuckDbClient()
  }, [ensureDuckDbClient]) 

  React.useEffect(() => {
    if (drawnPolygons.length > 0) {
      setSelectedCellIds(polygonSelectedCellIds)
    }
  }, [drawnPolygons, polygonSelectedCellIds])

  const getValue = React.useCallback(
    (d: Record<string, unknown>) => {
      return (d.value as number | null | undefined) ?? null
    },
    []
  )

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
        const { getCellDetails } = await import("./db/duckdb/runCalculations")
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

  const handleMapCellClick = React.useCallback(
    (obj: HexMapDeckObject | null) => {
      if (!obj) {
        setSelectedCellIds(new Set())
        clearSelectedCellDetails()
        return
      }

      if (selectedCellIds.has(obj.h3_cell) && selectedCellIds.size === 1) {
        setSelectedCellIds(new Set())
        clearSelectedCellDetails()
        return
      }

      setSelectedCellIds(new Set([obj.h3_cell]))
      void loadSelectedCellDetails(obj.h3_cell)
    },
    [clearSelectedCellDetails, loadSelectedCellDetails, selectedCellIds]
  )

  const loadMapData = React.useCallback(
    async (indicator: string, requestId = mapDataRequestIdRef.current) => {
      const client = await ensureDuckDbClient()
      const { getMapData } = await import("./db/duckdb/runCalculations")
      const { rows, bounds } = await getMapData(client.conn, indicator)
      if (requestId !== mapDataRequestIdRef.current) return false
      setHexData(rows)
      setActiveBounds(bounds)
      setMapDataError(null)
      return true
    },
    [ensureDuckDbClient]
  )

  const ensureHexPerformanceFixtureInstalled = React.useCallback(async () => {
    if (!useHexPerformanceFixture) return
    if (hexPerformanceFixtureInstallPromiseRef.current) {
      await hexPerformanceFixtureInstallPromiseRef.current
      return
    }

    const fixture = getHexPerformanceFixture()
    if (!fixture) throw new Error("Hex performance fixture is not installed.")

    if (fixture.indicators) {
      setAvailableIndicators(fixture.indicators)
    }

    hexPerformanceFixtureInstallPromiseRef.current = (async () => {
      const client = await ensureDuckDbClient()
      const { installMapDataFixture } = await import("./db/duckdb/mapDataFixture")
      await installMapDataFixture(client.conn, getFixtureIndicatorRows(fixture))
    })()

    try {
      await hexPerformanceFixtureInstallPromiseRef.current
    } catch (error) {
      hexPerformanceFixtureInstallPromiseRef.current = null
      throw error
    }
  }, [ensureDuckDbClient, useHexPerformanceFixture])

  React.useEffect(() => {
    if (
      !useHexPerformanceFixture ||
      hexData.length > 0 ||
      hexPerformanceFixtureInitialLoadStartedRef.current
    ) return

    hexPerformanceFixtureInitialLoadStartedRef.current = true
    const requestId = mapDataRequestIdRef.current + 1
    mapDataRequestIdRef.current = requestId

    void (async () => {
      try {
        await ensureHexPerformanceFixtureInstalled()
        await loadMapData(selectedIndicator, requestId)
      } catch (error) {
        hexPerformanceFixtureInitialLoadStartedRef.current = false
        setHexData([])
        setActiveBounds([])
        setMapDataError(error instanceof Error ? error.message : "Map data could not be loaded.")
      }
    })()
  }, [ensureHexPerformanceFixtureInstalled, hexData.length, loadMapData, selectedIndicator, useHexPerformanceFixture])

  const handleIndicatorChange = React.useCallback(
    async (value: string) => {
      if (!useHexPerformanceFixture && hexData.length === 0) return

      const requestId = mapDataRequestIdRef.current + 1
      mapDataRequestIdRef.current = requestId

      try {
        if (useHexPerformanceFixture) {
          await ensureHexPerformanceFixtureInstalled()
        }
        const didUpdate = await loadMapData(value, requestId)
        if (didUpdate) {
          setSelectedIndicator(value)
          setSelectedCellIds(new Set())
          clearSelectedCellDetails()
        }
      } catch (error) {
        console.error("DuckDB indicator refresh failed:", error)
        setHexData([])
        setActiveBounds([])
        setMapDataError(error instanceof Error ? error.message : "Map data could not be loaded.")
      }
    },
    [clearSelectedCellDetails, ensureHexPerformanceFixtureInstalled, hexData.length, loadMapData, useHexPerformanceFixture]
  )

  const handleSelectBin = React.useCallback(
    (binIndex: number | null) => {
      if (binIndex === null) {
        setSelectedCellIds(new Set())
        clearSelectedCellDetails()
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
        setSelectedCellIds(new Set())
        clearSelectedCellDetails()
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
    [activeBounds, clearSelectedCellDetails, hexData, selectedCellIds]
  )

  const handleAnalyze = async () => {
    setLoading(true)
    setMapDataError(null)

    try {
      const client = await ensureDuckDbClient()
      const [{ createInputTables }, { runCalculations }] = await Promise.all([
        import("./db/duckdb/createInputTables"),
        import("./db/duckdb/runCalculations"),
      ])

      await createInputTables(client.conn, thresholds, weights)
      await runCalculations(client.conn)
      await loadMapData(selectedIndicator)
      setSelectedCellIds(new Set())
      clearSelectedCellDetails()
      setAvailableIndicators(buildIndicatorOptions(thresholds))
      setConfigOpen(false)
    } catch (error) {
      console.error("DuckDB analysis failed:", error)
      setAvailableIndicators([])
      setHexData([])
      setActiveBounds([])
      setMapDataError(error instanceof Error ? error.message : "Analysis failed.")
    } finally {
      setLoading(false)
    }
  }

  const isFormValid =
    selectedScenario &&
    thresholds.length > 0 &&
    thresholds.every(
      (threshold) =>
        threshold.transportMode &&
        threshold.travelTime > 0 &&
        threshold.selectedDestinations.length > 0
    )

  const leftPanelLayoutStyle = {
    "--left-panel-left": "0.75rem",
    "--left-panel-gap": "0.75rem",
    "--left-panel-top": "11.0rem",
    "--grid-transparency-height": "5.75rem",
    "--poi-legend-top": "calc(var(--left-panel-top) + var(--grid-transparency-height) + var(--left-panel-gap))",
    "--bottom-left-panel-reserve": "14.5rem",
  } as React.CSSProperties

  const handleReset = () => {
    setSelectedScenario(INITIAL_SCENARIO)
    setSelectedPreset("custom")
    setThresholds(INITIAL_THRESHOLDS)
    setWeights(INITIAL_WEIGHTS)
    setCustomThresholds(INITIAL_THRESHOLDS)
    setCustomWeights(INITIAL_WEIGHTS)
  }

  const applyPreset = (presetId: string) => {
    if (presetId === "custom") return

    const preset = PRESETS[presetId]
    if (!preset) return

    const nextWeights: Weight[] = DESTINATIONS.map((destination) => ({
      id: `weight-${destination.value}`,
      selectedDestinations: [destination.value],
      weight: preset.weights[destination.value] ?? 1,
    }))

    const nextThresholds: Threshold[] = DESTINATIONS.map((destination) => {
      const thresholdPreset =
        preset.thresholds[destination.value] ?? {
          selectedDestinations: [destination.value],
          quantity: 1,
          transportMode: "walk",
          travelTime: 10,
        }

      return {
        id: crypto.randomUUID(),
        ...thresholdPreset,
      }
    })

    setWeights(nextWeights)
    setThresholds(nextThresholds)
  }

  return (
    <div className="h-screen w-full relative bg-gray-50" style={leftPanelLayoutStyle}>
      <HexMap
        hexData={hexData}
        indicator={selectedIndicator}
        fillBounds={activeFillConfig.bounds}
        fillColors={activeFillConfig.colors}
        gridOpacity={(100 - gridTransparency) / 100}
        selectedCellIds={selectedCellIds}
        drawnPolygons={drawnPolygons}
        onCellClick={drawnPolygons.length > 0 ? undefined : handleMapCellClick}
        onPolygonsChange={(features) => {
          setDrawnPolygons(features)
          if (features.length === 0) {
            setSelectedCellIds(new Set())
            clearSelectedCellDetails()
          } else {
            clearSelectedCellDetails()
          }
        }}
        drawRef={drawRef}
      >
        {isBaseMapOnly ? null : <PoiPreview />}
      </HexMap>

      {isBaseMapOnly ? null : (
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="fixed top-4 right-4 z-10 shadow-lg">
            <Settings className="h-5 w-5 mr-2" />
            <span className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>Configure</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={MAP_OVERLAY_DIALOG_TITLE_CLASS}>X-Minute City Analysis Configuration</DialogTitle>
          </DialogHeader>

          <div className={`space-y-6 py-4 ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>
            <Card>
              <CardHeader>
                <CardTitle className={MAP_OVERLAY_SECTION_TITLE_CLASS}>Travel Time Scenario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Scenario</div>
                    <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                      <SelectTrigger className={MAP_OVERLAY_BODY_MAIN_CLASS}>
                        <SelectValue placeholder="Choose a travel scenario" />
                      </SelectTrigger>
                      <SelectContent>
                        {travelScenarios.map((scenario) => (
                          <SelectItem
                            key={scenario.value}
                            value={scenario.value}
                            className={MAP_OVERLAY_BODY_MAIN_CLASS}
                          >
                            {scenario.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Preference Set</div>
                    <NestedDropdownSelect
                      options={PRESET_NESTED_OPTIONS}
                      value={selectedPreset}
                      className={MAP_OVERLAY_BODY_MAIN_CLASS}
                      textClassName={MAP_OVERLAY_BODY_MAIN_CLASS}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          setSelectedPreset("custom")
                          setThresholds(customThresholds)
                          setWeights(customWeights)
                        } else {
                          setSelectedPreset(value)
                          applyPreset(value)
                        }
                      }}
                      placeholder="Choose a preference set"
                      showPathInLabel={true}
                      pathSeparator=" › "
                    />
                    <div className={MAP_OVERLAY_BODY_MAIN_CLASS}>
                      Selecting a preset will overwrite weights and thresholds.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={MAP_OVERLAY_SECTION_TITLE_CLASS}>Weights</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableWeightsTable
                  weights={weights}
                  setWeights={(next) => {
                    setSelectedPreset("custom")
                    setWeights(next)
                    setCustomWeights(next)
                  }}
                  destinations={DESTINATIONS}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={MAP_OVERLAY_SECTION_TITLE_CLASS}>Compliance Thresholds</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableThresholdsTable
                  thresholds={thresholds}
                  setThresholds={(next) => {
                    setSelectedPreset("custom")
                    setThresholds(next)
                    setCustomThresholds(next)
                  }}
                  transportModes={TRANSPORT_MODES}
                  destinations={DESTINATIONS}
                  maxTravelTime={MAX_TT}
                />
              </CardContent>
            </Card>

            <div className="flex justify-center gap-4 pt-4">
              <Button
                onClick={handleAnalyze}
                disabled={!isFormValid || loading}
                size="lg"
                className="px-8 min-w-[180px]"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>Please wait</span>
                  </>
                ) : (
                  <span className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>Run Analysis</span>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleReset}
              >
                <span className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Reset Configuration</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {isBaseMapOnly ? null : (
      <div
        className="fixed z-10 w-72 rounded-md border bg-white/95 p-3 shadow-lg backdrop-blur"
        style={{ left: "var(--left-panel-left)", top: "var(--left-panel-top)" }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Adjust grid transparency</div>
          <div className={`shrink-0 tabular-nums ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>
            {gridTransparency}%
          </div>
        </div>
        <div
          className="grid h-9 items-end justify-items-center gap-0.5"
          style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}
          role="slider"
          aria-label="Adjust grid transparency"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={gridTransparency}
        >
          {Array.from({ length: 20 }, (_, index) => {
            const value = (index + 1) * 5
            const active = value <= gridTransparency
            return (
              <button
                key={value}
                type="button"
                onClick={() => setGridTransparency(value)}
                className={`h-8 w-2 transition-colors ${
                  active ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-300 hover:bg-gray-400"
                }`}
                aria-label={`Set grid transparency to ${value}%`}
              />
            )
          })}
        </div>
      </div>
      )}

      {isBaseMapOnly ? null : (
      <Card className="fixed bottom-4 z-10 bg-white backdrop-blur-sm shadow-lg p-2" style={{ left: "var(--left-panel-left)" }}>
        <CardContent className="p-3 space-y-3">
          <NestedDropdownSelect
            options={availableIndicators}
            value={selectedIndicator}
            onValueChange={handleIndicatorChange}
            placeholder="Select indicator"
            showPathInLabel
            pathSeparator=": "
            className={MAP_OVERLAY_PANEL_TITLE_CLASS}
            textClassName={MAP_OVERLAY_PANEL_TITLE_CLASS}
          />
          {mapDataError ? (
            <div className={MAP_OVERLAY_META_TEXT_CLASS}>{mapDataError}</div>
          ) : (
            <LegendBands
              bounds={activeFillConfig.bounds}
              colors={activeFillConfig.colors}
            />
          )}
        </CardContent>
      </Card>
      )}

      {((hexData.length > 0 && activeBounds.length > 1) || selectedCellDetailsCellId) && (
        <div className="fixed bottom-10 right-4 z-10 w-[380px] space-y-2">
          {hexData.length > 0 && activeBounds.length > 1 && (
            <ComplianceStats
              data={hexData}
              bounds={activeFillConfig.bounds}
              getValue={getValue}
              onSelectBin={handleSelectBin}
              selectedCells={selectedCellsData}
              formatValue={fmt}
              className="bg-white shadow-lg w-full"
            />
          )}

          {selectedCellDetailsCellId && (
            <Card className="bg-white shadow-lg w-full max-h-48 overflow-y-auto">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Selected cell details</div>
                    <div className={`truncate font-mono ${MAP_OVERLAY_META_TEXT_CLASS}`}>
                      {selectedCellDetailsCellId}
                    </div>
                  </div>
                </div>
                {selectedCellDetailsLoading ? (
                  <div className={MAP_OVERLAY_META_TEXT_CLASS}>Loading details...</div>
                ) : selectedCellDetails.length === 0 ? (
                  <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>No details available.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {selectedCellDetails.map((detail) => (
                      <div key={`${detail.amenity}-${detail.mode}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-t pt-2">
                        <div className="min-w-0">
                          <div className={`truncate ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>{detail.amenity}</div>
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>{detail.mode}</div>
                        </div>
                        <div className="text-right">
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>Comp</div>
                          <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{detail.compliance === null ? "No data" : fmt(detail.compliance)}</div>
                        </div>
                        <div className="text-right">
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>Time</div>
                          <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{detail.min_travel_time === null ? "No data" : `${fmt(detail.min_travel_time)}m`}</div>
                        </div>
                        <div className="text-right">
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>Total</div>
                          <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{detail.n_total}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
