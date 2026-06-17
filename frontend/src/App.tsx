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
import {
  EditableThresholdsTable,
} from "@/components/editable-thresholds-table"
import {
  EditableWeightsTable,
} from "@/components/editable-weights-table"
import { NestedDropdownSelect } from "./components/nested-dropdown-select"
import { ComplianceStats } from "@/components/ui/compliance-stats"
import { HexMap } from "./components/hex-map"
import { LegendBands } from "./components/legend-bands"
import {
  ALWAYS_AVAILABLE_INDICATORS,
  DESTINATIONS,
  fmt,
  getDestinationIcon,
  getDestinationLabel,
  getIndicatorFillConfig,
  getIndicatorValue,
  getModeLabel,
  INITIAL_SCENARIO,
  INITIAL_THRESHOLDS,
  INITIAL_WEIGHTS,
  MAX_TT,
  PRESET_NESTED_OPTIONS,
  PRESETS,
  SINGLE_DESTINATION_INDICATORS,
  TRANSPORT_MODES,
} from "@/app-config"
import type { NestedOption, Threshold, Weight } from "@/app-types"

const USE_FIXTURE_RESPONSE = import.meta.env.VITE_USE_FIXTURE_RESPONSE === "true"

async function loadFixtureResponse(): Promise<any[]> {
  const module = await import("./fixtures/munich-compliance-summary-response.json")
  return module.default as any[]
}

const travelScenarios = [
  { value: "current", label: "Current" },
  // { value: "bikesharing-a", label: "Bike Sharing System Alternative A" },
  // { value: "bikesharing-b", label: "Bike Sharing System Alternative B" },
]



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

  // map data
  const [hexData, setHexData] = React.useState<any[]>([]);
  const [selectedCells, setSelectedCells] = React.useState<any[]>([]);

  // polygon drawing (only keep the last polygon)
  const [drawnPolygons, setDrawnPolygons] = React.useState<GeoJSON.Feature[]>([])
  const drawRef = React.useRef<MapboxDraw | null>(null)

  // Compute which hex cells overlap with the drawn polygon
  const polygonSelectedCells = React.useMemo(() => {
    if (drawnPolygons.length === 0 || hexData.length === 0) return []
    const drawnFeature = drawnPolygons[0]
    if (!drawnFeature || drawnFeature.geometry.type !== "Polygon") return []

    return hexData.filter((cell) => {
      try {
        // cellToBoundary with formatAsGeoJson=true returns [lng, lat][] pairs
        const boundary = cellToBoundary(cell.h3_cell, true) as [number, number][]
        const ring: [number, number][] = [...boundary, boundary[0]]
        const hexPoly = turfPolygon([ring])
        return booleanIntersects(hexPoly, drawnFeature)
      } catch {
        return false
      }
    })
  }, [drawnPolygons, hexData])

  // When a polygon is drawn/updated, selection becomes the cells it covers.
  // When polygons are cleared (trash or selecting a bin), selection is updated elsewhere.
  React.useEffect(() => {
    if (drawnPolygons.length > 0) {
      setSelectedCells(polygonSelectedCells)
    }
  }, [drawnPolygons, polygonSelectedCells])

  const getValue = React.useCallback(
    (d: Record<string, unknown>) => getIndicatorValue(selectedIndicator ?? "", d),
    [selectedIndicator]
  )

  const handleSelectBin = React.useCallback(
    (bin: { min: number; max: number } | null) => {
      if (bin === null) {
        setSelectedCells([])
        return
      }
      const bounds = getIndicatorFillConfig(selectedIndicator).bounds
      const isLastBin = bounds.length > 0 && bin.max === bounds[bounds.length - 1]
      const inBin = (c: any) => {
        const v = getIndicatorValue(selectedIndicator ?? "", c)
        if (v === null) return false
        return v >= bin.min && (v < bin.max || (isLastBin && v === bin.max))
      }
      const cellsInBin = hexData.filter(inBin)
      const sameSelection =
        selectedCells.length === cellsInBin.length &&
        cellsInBin.every((c) => selectedCells.some((s) => s.h3_cell === c.h3_cell))
      if (sameSelection) {
        setSelectedCells([])
        return
      }
      // Discard existing selection and drawn polygon; select all cells in this bin
      const draw = drawRef.current
      if (draw) {
        const all = draw.getAll()
        const ids = (all.features as any[])
          .map((f) => f.id)
          .filter((id): id is string => typeof id === "string")
        if (ids.length > 0) draw.delete(ids)
      }
      setDrawnPolygons([])
      setSelectedCells(cellsInBin)
    },
    [hexData, drawRef, selectedCells, selectedIndicator]
  )

  const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL;

  const [loading, setLoading] = React.useState(false);
  
  const handleAnalyze = async () => {
    setLoading(true);

    // Build amenity_weights from current weights state.
    // If multiple weight entries are ever supported, later ones will override earlier ones per amenity.
    const amenityWeights: Record<string, number> = {};
    for (const entry of weights) {
      for (const amenity of entry.selectedDestinations) {
        amenityWeights[amenity] = entry.weight;
      }
    }





    // Build amenity_thresholds array from thresholds + build mode->amenities
    const amenityToModesSets: Record<string, Set<string>> = {}

    const amenityThresholds = thresholds.map((t) => {
      const mode = t.transportMode

      for (const a of t.selectedDestinations ?? []) {
        const set = (amenityToModesSets[a] ??= new Set<string>())

        if (mode) set.add(mode)
      }

      return {
        mode,
        T: t.travelTime,
        X: t.quantity,
        amenities: t.selectedDestinations,
      }
    })

    // Convert Set -> sorted array
    const amenityToModes: Record<string, string[]> = Object.fromEntries(
      Object.entries(amenityToModesSets).map(([a, set]) => [
        a,
        [...set].sort(),
      ])
    )

    

  
    const payload = {
      amenity_weights: amenityWeights,
      amenity_thresholds: amenityThresholds,
    };

    if (USE_FIXTURE_RESPONSE) {
      const data: any[] = await loadFixtureResponse()
      setHexData(data)

      console.log('RPC payload:', { scenario: selectedScenario, _groups: payload })
      console.log('Fixture response loaded:', data)
      console.log(availableIndicators)

      let totalScore = 0
      let totalPopulation = 0

      data.forEach((item) => {
        const pop = item.pop || 0
        const compliance = item.compliance_weighted_avg || 0
        const contribution = pop * compliance

        totalScore += contribution
        totalPopulation += pop
      })

      const weightedAverage = totalPopulation > 0 ? totalScore / totalPopulation : 0
      console.log('total score (numerator):', totalScore)
      console.log('total population (denominator):', totalPopulation)
      console.log('weighted average score:', weightedAverage)

      setConfigOpen(false)
      setLoading(false)

      const newIndicatorOptions: NestedOption[] = [
        ...ALWAYS_AVAILABLE_INDICATORS,
        ...Object.entries(amenityToModes).map(([a, modes]) => ({
          value: a ,
          label: getDestinationIcon(a) + getDestinationLabel(a),
          children: modes.map((mode) => ({
            value: a + '::' + mode,
            label: getModeLabel(mode),
            children: SINGLE_DESTINATION_INDICATORS.map((indicator) => ({
              value: a + '::' + mode + '::' + indicator.value,
              label: indicator.label,
            })),
          })),
        })),
      ]

      setAvailableIndicators(newIndicatorOptions)
      return
    }

    try {
      const res = await fetch(`${POSTGREST_URL}/rpc/get_compliance_summary_by_amenity_batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Profile': 'api'
        },
        body: JSON.stringify({ _groups: payload }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} – ${text}`);
      }
  
      const data: any[] = await res.json();
      setHexData(data)
  
      console.log('RPC payload:', { scenario: selectedScenario, _groups: payload });
      console.log('RPC response:', data);
      console.log(availableIndicators)

      // calculate weighted average score
      let totalScore = 0; // numerator: total score
      let totalPopulation = 0; // denominator: total population
      
      data.forEach((item) => {
        const pop = item.pop || 0; // population
        const compliance = item.compliance_weighted_avg || 0; // compliance score
        
        // calculate the contribution of each hexagon
        const contribution = pop * compliance;
        
        totalScore += contribution;
        totalPopulation += pop;
      });
      // calculate weighted average score
      const weightedAverage = totalPopulation > 0 ? totalScore / totalPopulation : 0;
      console.log('total score (numerator):', totalScore);
      console.log('total population (denominator):', totalPopulation);
      console.log('weighted average score:', weightedAverage);
  
      setConfigOpen(false);
    } catch (e) {
      console.error('PostgREST RPC failed:', e);
      setAvailableIndicators([])
    } finally{
      setLoading(false);
      

      // update available indicators

      const newIndicatorOptions: NestedOption[] = [
        ...ALWAYS_AVAILABLE_INDICATORS,
        ...Object.entries(amenityToModes).map(([a, modes]) => ({
          value: a ,
          label: getDestinationIcon(a) + getDestinationLabel(a),
          children: modes.map((mode) => ({
            value: a + '::' + mode,
            label: getModeLabel(mode),
            children: SINGLE_DESTINATION_INDICATORS.map((indicator) => ({
              value: a + '::' + mode + '::' + indicator.value,
              label: indicator.label,
            })),
          })),
        })),
      ]

      

      setAvailableIndicators(
        newIndicatorOptions)
    }
  }

  const isFormValid =
    selectedScenario &&
    thresholds.length > 0 &&
    thresholds.every(
      (t) =>
        t.transportMode &&
        t.travelTime > 0 &&
        t.selectedDestinations.length > 0
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

    const nextWeights: Weight[] = DESTINATIONS.map((d) => ({
      id: `weight-${d.value}`,
      selectedDestinations: [d.value],
      weight: preset.weights[d.value] ?? 1,
    }))

    const nextThresholds: Threshold[] = DESTINATIONS.map((d) => {
      const tPreset =
        preset.thresholds[d.value] ?? {
          selectedDestinations: [d.value],
          quantity: 1,
          transportMode: "walk",
          travelTime: 10,
        }

      return {
        id: crypto.randomUUID(),
        ...tPreset,
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
        getValue={getValue}
        fillBounds={getIndicatorFillConfig(selectedIndicator).bounds}
        fillColors={getIndicatorFillConfig(selectedIndicator).colors}
        selectedCells={selectedCells}
        drawnPolygons={drawnPolygons}
        onCellClick={drawnPolygons.length > 0 ? undefined : (obj) => {
          if (!obj) {
            setSelectedCells([])
          } else {
            setSelectedCells((prev) => {
              const exists = prev.some((c: any) => c.h3_cell === obj.h3_cell)
              if (exists && prev.length === 1) {
                return []
              }
              return [obj]
            })
          }
        }}
        onPolygonsChange={(features) => {
          setDrawnPolygons(features)
          if (features.length === 0) setSelectedCells([])
        }}
        drawRef={drawRef}
      />

      {/* Config Button */}
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
            {/* Travel Scenario Selection */}
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

            {/* Editable Weights Table */}
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

            {/* Editable Thresholds Table */}
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

            {/* Action Buttons */}
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
            onValueChange={setSelectedIndicator}
            placeholder="Select indicator"
            showPathInLabel
            pathSeparator=": "
           />
          <LegendBands
            bounds={getIndicatorFillConfig(selectedIndicator).bounds}
            colors={getIndicatorFillConfig(selectedIndicator).colors}
          />
        </CardContent>
        {/* {selectedIndicator.split("::")[0]} */}
      </Card>

      {/* Compliance Statistics */}
      <ComplianceStats
        data={hexData}
        bounds={getIndicatorFillConfig(selectedIndicator).bounds}
        getValue={getValue}
        onSelectBin={handleSelectBin}
        selectedCells={selectedCells}
        formatValue={fmt}
      />
    </div>
  )
}

