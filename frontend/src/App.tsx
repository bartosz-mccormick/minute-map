"use client"

import * as React from "react"
import { Settings, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type MapboxDraw from "@mapbox/mapbox-gl-draw"
import { cellToBoundary } from "h3-js"
import { booleanIntersects } from "@turf/boolean-intersects"
import { polygon as turfPolygon } from "@turf/helpers"
import { EditableThresholdsTable } from "@/components/editable-thresholds-table"
import { EditableWeightsTable } from "@/components/editable-weights-table"
import { NestedDropdownSelect } from "./components/nested-dropdown-select"
import { ComplianceStats } from "@/components/ui/compliance-stats"
import { HexMap } from "./components/hex-map"
import { LegendBands } from "./components/legend-bands"
import {
  ALWAYS_AVAILABLE_INDICATORS,
  buildIndicatorOptions,
  DESTINATIONS,
  fmt,
  getIndicatorFillConfig,
  getIndicatorValue,
  INITIAL_SCENARIO,
  INITIAL_THRESHOLDS,
  INITIAL_WEIGHTS,
  MAX_TT,
  PRESET_NESTED_OPTIONS,
  PRESETS,
  TRANSPORT_MODES,
} from "@/app-config"
import type { NestedOption, Threshold, Weight } from "@/app-types"
import type { DuckDbClient } from "./db/duckdb/createDuckDb"

const travelScenarios = [
  { value: "current", label: "Current" },
  // { value: "bikesharing-a", label: "Bike Sharing System Alternative A" },
  // { value: "bikesharing-b", label: "Bike Sharing System Alternative B" },
]

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

export default function app() {
  const [selectedScenario, setSelectedScenario] = React.useState(INITIAL_SCENARIO)
  const [selectedPreset, setSelectedPreset] = React.useState("custom")
  const [thresholds, setThresholds] = React.useState<Threshold[]>(INITIAL_THRESHOLDS)
  const [weights, setWeights] = React.useState<Weight[]>(INITIAL_WEIGHTS)
  const [customThresholds, setCustomThresholds] = React.useState<Threshold[]>(INITIAL_THRESHOLDS)
  const [customWeights, setCustomWeights] = React.useState<Weight[]>(INITIAL_WEIGHTS)
  const [configOpen, setConfigOpen] = React.useState(false)
  const [selectedIndicator, setSelectedIndicator] = React.useState("compliance_weighted_avg")
  const [availableIndicators, setAvailableIndicators] = React.useState<NestedOption[]>(
    ALWAYS_AVAILABLE_INDICATORS
  )

  const [hexData, setHexData] = React.useState<any[]>([])
  const [selectedCellIds, setSelectedCellIds] = React.useState<Set<string>>(() => new Set())
  const selectedCellsData = React.useMemo(
    () => hexData.filter((cell) => selectedCellIds.has(cell.h3_cell)),
    [hexData, selectedCellIds]
  )

  const [drawnPolygons, setDrawnPolygons] = React.useState<GeoJSON.Feature[]>([])
  const drawRef = React.useRef<MapboxDraw | null>(null)
  const duckDbClientRef = React.useRef<DuckDbClient | null>(null)
  const duckDbInitPromiseRef = React.useRef<Promise<DuckDbClient> | null>(null)
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
        const [{ createDuckDb }, { setupDb }] = await Promise.all([
          import("./db/duckdb/createDuckDb"),
          import("./db/duckdb/setupDb"),
        ])
        const client = await createDuckDb()
        await setupDb(client)

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
  }, [])

  React.useEffect(() => {
    if (drawnPolygons.length > 0) {
      setSelectedCellIds(polygonSelectedCellIds)
    }
  }, [drawnPolygons, polygonSelectedCellIds])

  const getValue = React.useCallback(
    (d: Record<string, unknown>) => {
      if ("value" in d) return (d.value as number | null) ?? null
      return getIndicatorValue(selectedIndicator ?? "", d)
    },
    [selectedIndicator]
  )

  const handleIndicatorChange = React.useCallback(
    async (value: string) => {
      setSelectedIndicator(value)

      if (hexData.length === 0) return

      try {
        const client = await ensureDuckDbClient()
        const { runCalculations } = await import("./db/duckdb/runCalculations")
        const duckDbData = await runCalculations(client.conn, value)
        setHexData(duckDbData)
      } catch (error) {
        console.error("DuckDB indicator refresh failed:", error)
      }
    },
    [ensureDuckDbClient, hexData.length]
  )

  const handleSelectBin = React.useCallback(
    (bin: { min: number; max: number } | null) => {
      if (bin === null) {
        setSelectedCellIds(new Set())
        return
      }

      const bounds = getIndicatorFillConfig(selectedIndicator).bounds
      const isLastBin = bounds.length > 0 && bin.max === bounds[bounds.length - 1]
      const startedAt = performance.now()
      const cellsInBinIds = new Set<string>()

      for (const cell of hexData) {
        const value = getValue(cell)
        if (value !== null && value >= bin.min && (value < bin.max || (isLastBin && value === bin.max))) {
          cellsInBinIds.add(cell.h3_cell)
        }
      }

      logSelectionTiming("handleSelectBin.filter", startedAt, {
        cells_total: hexData.length,
        cells_selected: cellsInBinIds.size,
        bin_min: bin.min,
        bin_max: bin.max,
      })

      if (areSetsEqual(selectedCellIds, cellsInBinIds)) {
        setSelectedCellIds(new Set())
        return
      }

      const draw = drawRef.current
      if (draw) {
        const all = draw.getAll()
        const ids = (all.features as any[])
          .map((feature) => feature.id)
          .filter((id): id is string => typeof id === "string")
        if (ids.length > 0) draw.delete(ids)
      }

      setDrawnPolygons([])
      setSelectedCellIds(cellsInBinIds)
    },
    [hexData, selectedCellIds, selectedIndicator, getValue]
  )

  const handleAnalyze = async () => {
    setLoading(true)

    try {
      const client = await ensureDuckDbClient()
      const [{ createInputTables }, { runCalculations }] = await Promise.all([
        import("./db/duckdb/createInputTables"),
        import("./db/duckdb/runCalculations"),
      ])

      await createInputTables(client.conn, thresholds, weights)
      const duckDbData = await runCalculations(client.conn, selectedIndicator)

      setHexData(duckDbData)
      setAvailableIndicators(buildIndicatorOptions(thresholds))
      setConfigOpen(false)
    } catch (error) {
      console.error("DuckDB analysis failed:", error)
      setAvailableIndicators([])
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
    <div className="h-screen w-full relative bg-gray-50">
      <HexMap
        hexData={hexData}
        indicator={selectedIndicator}
        fillBounds={getIndicatorFillConfig(selectedIndicator).bounds}
        fillColors={getIndicatorFillConfig(selectedIndicator).colors}
        selectedCellIds={selectedCellIds}
        drawnPolygons={drawnPolygons}
        onCellClick={drawnPolygons.length > 0 ? undefined : (obj) => {
          if (!obj) {
            setSelectedCellIds(new Set())
          } else {
            setSelectedCellIds((prev) => {
              if (prev.has(obj.h3_cell) && prev.size === 1) {
                return new Set()
              }
              return new Set([obj.h3_cell])
            })
          }
        }}
        onPolygonsChange={(features) => {
          setDrawnPolygons(features)
          if (features.length === 0) setSelectedCellIds(new Set())
        }}
        drawRef={drawRef}
      />

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="fixed top-4 right-4 z-10 shadow-lg">
            <Settings className="h-5 w-5 mr-2" />
            Configure
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>X-Minute City Analysis Configuration</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <Card>
              <CardHeader>
                <CardTitle>Travel Time Scenario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Scenario</div>
                    <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a travel scenario" />
                      </SelectTrigger>
                      <SelectContent>
                        {travelScenarios.map((scenario) => (
                          <SelectItem key={scenario.value} value={scenario.value}>
                            {scenario.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Preference Set</div>
                    <NestedDropdownSelect
                      options={PRESET_NESTED_OPTIONS}
                      value={selectedPreset}
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
                    <div className="text-xs text-muted-foreground">
                      Selecting a preset will overwrite weights and thresholds.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weights</CardTitle>
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
                <CardTitle>Compliance Thresholds</CardTitle>
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
                    Please wait
                  </>
                ) : (
                  "Run Analysis"
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleReset}
              >
                Reset Configuration
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="fixed bottom-4 left-4 z-10 bg-white backdrop-blur-sm shadow-lg p-2">
        <CardContent className="p-3 space-y-3 text-sm">
          <NestedDropdownSelect
            options={availableIndicators}
            value={selectedIndicator}
            onValueChange={handleIndicatorChange}
            placeholder="Select indicator"
            showPathInLabel
            pathSeparator=": "
          />
          <LegendBands
            bounds={getIndicatorFillConfig(selectedIndicator).bounds}
            colors={getIndicatorFillConfig(selectedIndicator).colors}
          />
        </CardContent>
      </Card>

      <ComplianceStats
        data={hexData}
        bounds={getIndicatorFillConfig(selectedIndicator).bounds}
        getValue={getValue}
        onSelectBin={handleSelectBin}
        selectedCells={selectedCellsData}
        formatValue={fmt}
      />
    </div>
  )
}
