"use client"

import * as React from "react"
import { Settings, Loader2, Pencil, Trash2 } from "lucide-react"
import { Map, NavigationControl, useControl, useMap } from "react-map-gl/maplibre"
import { H3HexagonLayer } from "deck.gl"
import { PolygonLayer } from "@deck.gl/layers"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import "maplibre-gl/dist/maplibre-gl.css"
import {colorBins} from "@deck.gl/carto"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import FreehandMode from "mapbox-gl-draw-freehand-mode"
import { cellToBoundary } from "h3-js"
import { booleanIntersects } from "@turf/boolean-intersects"
import { polygon as turfPolygon } from "@turf/helpers"


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  EditableThresholdsTable,
  type Threshold,
  type TransportMode,
  type Destination,
} from "@/components/editable-thresholds-table"
import {
  EditableWeightsTable,
  type Weight,
} from "@/components/editable-weights-table"

import { NestedDropdownSelect, type NestedOption } from "./components/nested-dropdown-select"
import { ComplianceStats } from "@/components/ui/compliance-stats"

//  import hexes from './assets/data.json'; 

// https://labs.mapbox.com/location-helper/#10.04/48.137/11.5738
const INITIAL_VIEW_STATE = {
  longitude: Number(import.meta.env.VITE_INITIAL_LONGITUDE),
  latitude: Number(import.meta.env.VITE_INITIAL_LATITUDE),
  zoom: Number(import.meta.env.VITE_INITIAL_ZOOM),
  pitch: Number(import.meta.env.VITE_INITIAL_PITCH),
  bearing: Number(import.meta.env.VITE_INITIAL_BEARING),
};


const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"

const MAX_TT = 30

type Color = [number,number,number]
const COMPLIANCE_FILL_BOUNDS = [0, .2, .4, .6, .8, 1]
const COMPLIANCE_FILL_COLORS: Color[] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

//https://waldyrious.net/viridis-palette-generator/
const TRAVEL_TIME_FILL_BOUNDS = [0, 5, 10, 15, 20, 25, 30]
const TRAVEL_TIME_FILL_COLORS: Color[] = [
  [253, 231, 37],
  [144, 215, 67],
  [53, 183, 121],
  [33, 145, 140],
  [49, 104, 142],
  [68, 57, 131],
  [68, 1, 84],
]

function getIndicatorValue(indicator: string, d: Record<string, unknown>): number | null {
  const parts = indicator.split("::")
  if (parts.length === 1) return (d[indicator] as number) ?? null
  if (parts.length === 3) {
    const [amenity, mode, metric] = parts
    const amenities = d.amenities as Record<string, Record<string, Record<string, number>>> | undefined
    return amenities?.[amenity]?.[mode]?.[metric] ?? null
  }
  return null
}

function getIndicatorFillConfig(indicator: string | undefined): { bounds: number[]; colors: Color[] } {
  const isCompliance = indicator?.includes("compliance")
  return {
    bounds: isCompliance ? COMPLIANCE_FILL_BOUNDS : TRAVEL_TIME_FILL_BOUNDS,
    colors: isCompliance ? COMPLIANCE_FILL_COLORS : TRAVEL_TIME_FILL_COLORS,
  }
}

type ThresholdPreset = Omit<Threshold, "id">

interface PresetDefinition {
  label: string
  weights: Record<string, number>
  thresholds: Record<string, ThresholdPreset>
}

/** Presets config: cities as keys, each city has presetId -> preset. */
type PresetsConfigByCity = Record<string, Record<string, PresetDefinition>>

import presetsConfig from "@/config/presets.json"

const presetsByCity = presetsConfig as unknown as PresetsConfigByCity

/** Flat map of presetId -> preset for applyPreset. */
const PRESETS: Record<string, PresetDefinition> = {}
for (const presets of Object.values(presetsByCity)) {
  for (const [presetId, preset] of Object.entries(presets)) {
    PRESETS[presetId] = preset
  }
}

/** Nested options for preset dropdown: Custom + cities with preset children. */
const PRESET_NESTED_OPTIONS: NestedOption[] = [
  { value: "custom", label: "Custom" },
  ...Object.entries(presetsByCity).map(([cityId, presets]) => ({
    value: cityId,
    label: cityId,
    children: Object.entries(presets).map(([presetId, preset]) => ({
      value: presetId,
      label: preset.label,
    })),
  })),
]




const DESTINATIONS: Destination[] = [
  // Errands & Health
  { value: "grocery", label: "Supermarket", icon: "🛒" },
  { value: "pharmacy", label: "Pharmacy", icon: "💊" },
  { value: "atm_bank", label: "ATM/Bank", icon: "🏧" },
  { value: "post", label: "Post Office", icon: "📦" },
  { value: "gp", label: "General Practitioner", icon: "🩺" },

  // Food & Drink
  { value: "restaurant", label: "Restaurant", icon: "🍽️" },
  { value: "cafe", label: "Cafe", icon: "☕" },
  { value: "bar", label: "Bar", icon: "🍺" },
  { value: "bakery", label: "Bakery", icon: "🥐" },

  // Education & Culture
  { value: "school", label: "School", icon: "🏫" },
  { value: "kindergarten", label: "Kindergarten", icon: "🧸" },
  { value: "library", label: "Library", icon: "📚" },

  // Leisure & Outdoors
  { value: "sport", label: "Sports Facility", icon: "🏃" },
  { value: "park", label: "Park", icon: "🌳" },
  { value: "playground", label: "Playground", icon: "🛝" },
];

const TRANSPORT_MODES: TransportMode[] = [
  { value: "walk", label: "Walking (4 km/h)" },
  { value: "bike", label: "Cycling" },
  //{ value: "public-transport", label: "Public Transport" },
]


const INITIAL_WEIGHTS: Weight[] = [
  {
    id: "weights-entry",
    selectedDestinations: DESTINATIONS.map((d) => d.value),
    weight: 1,
  },
]

const INITIAL_SCENARIO = "current"

const INITIAL_THRESHOLDS: Threshold[] = []


const ALWAYS_AVAILABLE_INDICATORS:  NestedOption[] =
[
  { value: "compliance_weighted_avg", label: "X-Min City Compliance" }//,
  //{ value: "pop", label: "Population" }
]

const SINGLE_DESTINATION_INDICATORS = [
  { value: "compliance", label: "Compliance" },
  { value: "min_travel_time", label: "Time to Nearest" },
  { value: "min_travel_time_X", label: "Time to Nearest X" },

]


function rgb([r, g, b]: Color) {
  return `rgb(${r} ${g} ${b})`
}

function fmt(v: number) {
  return v.toFixed(1).replace(/\.0$/, "")
}

function LegendBands({
  bounds,
  colors,
  formatValue = fmt,
}: {
  bounds: number[]
  colors: Color[]
  formatValue?: (v: number) => string
}) {
  const bands = React.useMemo(() => {
    const out: { from: number; to: number; color: Color }[] = []
    const n = Math.min(colors.length, Math.max(0, bounds.length - 1))
    for (let i = 0; i < n; i++) {
      out.push({ from: bounds[i], to: bounds[i + 1], color: colors[i] })
    }
    return out
  }, [bounds, colors])

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {bands.map((b, idx) => (
          <li key={idx} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-[3px] ring-1 ring-black/10"
                style={{ background: rgb(b.color) }}
                aria-hidden
              />
              <span className="tabular-nums">
                {formatValue(b.from)}–{formatValue(b.to)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}






const getDestinationLabel = (value: string) => {
  return DESTINATIONS.find((d) => d.value === value)?.label || value
}

const getDestinationIcon = (value: string) => {
  return DESTINATIONS.find((d) => d.value === value)?.icon || ""
}

const getModeLabel = (value: string) => {
  return TRANSPORT_MODES.find((d) => d.value === value)?.label || ""
}


function DeckGLOverlay(props: any) {
  const overlay = useControl(() => new DeckOverlay(props))
  overlay.setProps(props)
  return null
}

type DrawEvent = { features: GeoJSON.Feature[] }

// Minimal interface for the MapLibre map's event system, used to bind draw events
type MapWithEvents = {
  on: (event: string, fn: (...args: unknown[]) => void) => void
  off: (event: string, fn: (...args: unknown[]) => void) => void
}

const DRAW_STYLES = [
  // ACTIVE (being drawn)
  // line stroke
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#D20C0C",
      "line-width": 2,
    },
  },
  // polygon fill
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#D20C0C",
      "fill-outline-color": "#D20C0C",
      "fill-opacity": 0,
    },
  },
  // polygon mid points
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "midpoint"],
    ],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  // polygon outline stroke
  // This doesn't style the first edge of the polygon, which uses the line stroke styling instead
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#D20C0C",
      "line-width": 2,
    },
  },
  // vertex point halos
  {
    id: "gl-draw-polygon-and-line-vertex-halo-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#FFF",
    },
  },
  // vertex points
  {
    id: "gl-draw-polygon-and-line-vertex-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#D20C0C",
    },
  },
] as unknown as MapboxDraw.MapboxDrawOptions["styles"]

function DrawControl({
  drawRef,
  onUpdate,
  onDelete,
}: {
  drawRef?: React.MutableRefObject<MapboxDraw | null>
  onUpdate: (e: DrawEvent) => void
  onDelete: (e: DrawEvent) => void
}) {
  const onUpdateRef = React.useRef(onUpdate)
  const onDeleteRef = React.useRef(onDelete)

  React.useEffect(() => {
    onUpdateRef.current = onUpdate
    onDeleteRef.current = onDelete
  })

  const stableOnUpdate = React.useCallback(
    (e: unknown) => onUpdateRef.current(e as DrawEvent),
    []
  )
  const stableOnDelete = React.useCallback(
    (e: unknown) => onDeleteRef.current(e as DrawEvent),
    []
  )

  // MapboxDraw's IControl is for Mapbox GL, not MapLibre GL, so we cast to bypass the type mismatch.
  // At runtime, MapboxDraw is fully compatible with MapLibre GL.
  const draw = (useControl as (...args: unknown[]) => MapboxDraw)(
    () => new MapboxDraw({
      displayControlsDefault: false,
      defaultMode: "simple_select",
      styles: DRAW_STYLES,
      modes: {
        ...MapboxDraw.modes,
        draw_polygon: FreehandMode,
      },
    }),
    ({ map }: { map: MapWithEvents }) => {
      map.on("draw.create", stableOnUpdate)
      map.on("draw.update", stableOnUpdate)
      map.on("draw.delete", stableOnDelete)
    },
    ({ map }: { map: MapWithEvents }) => {
      map.off("draw.create", stableOnUpdate)
      map.off("draw.update", stableOnUpdate)
      map.off("draw.delete", stableOnDelete)
    },
  )

  React.useEffect(() => {
    if (drawRef) drawRef.current = draw
    return () => { if (drawRef) drawRef.current = null }
  }, [draw, drawRef])

  return null
}

// DrawToolbar renders as a fixed-position overlay (no portal) to avoid React
// removeChild errors that occur when portalling into MapLibre's control DOM.
// position: fixed escapes the map's overflow:hidden, so buttons appear correctly.
// MapLibre's NavigationControl (3 × 29px buttons + 10px top margin) ends at ~97px,
// so we start the toolbar at 107px (97 + 10px gap margin).
function DrawToolbar({
  drawRef,
  onClearPolygons,
}: {
  drawRef: React.MutableRefObject<MapboxDraw | null>
  onClearPolygons?: () => void
}) {
  const [isDrawing, setIsDrawing] = React.useState(false)
  const { current: map } = useMap()

  React.useEffect(() => {
    if (!map) return
    const handleModeChange = (e: unknown) => {
      setIsDrawing((e as { mode: string }).mode === "draw_polygon")
    }
    map.on("draw.modechange", handleModeChange as (...args: unknown[]) => void)
    return () => {
      map.off("draw.modechange", handleModeChange as (...args: unknown[]) => void)
    }
  }, [map])

  const handleToggleDraw = React.useCallback(() => {
    const draw = drawRef.current
    if (!draw) return

    if (draw.getMode() === "draw_polygon") {
      // Turn off drawing mode
      draw.changeMode("simple_select")
    } else {
      // Start a new polygon: clear all existing polygons (both Draw features and overlay state)
      const all = draw.getAll()
      const ids = (all.features as any[])
        .map((f) => f.id)
        .filter((id): id is string => typeof id === "string")
      if (ids.length > 0) {
        draw.delete(ids)
      }
      onClearPolygons?.()

      draw.changeMode("draw_polygon")
    }
  }, [drawRef, onClearPolygons])

  const handleDelete = React.useCallback(() => {
    const draw = drawRef.current
    if (!draw) return
    const all = draw.getAll()
    const ids = (all.features as any[])
      .map((f) => f.id)
      .filter((id): id is string => typeof id === "string")
    if (ids.length > 0) {
      draw.delete(ids)
    }
    onClearPolygons?.()
  }, [drawRef, onClearPolygons])

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 29,
    height: 29,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  }

  return (
    <div
      className="maplibregl-ctrl maplibregl-ctrl-group"
      style={{ position: "fixed", top: 107, left: 10, zIndex: 10 }}
    >
      <button
        title={isDrawing ? "Cancel" : "Make selection"}
        onClick={handleToggleDraw}
        style={{ ...btnStyle, backgroundColor: isDrawing ? "#dbeafe" : undefined }}
      >
        <Pencil size={15} color={isDrawing ? "#2563eb" : "#333"} />
      </button>
      <button
        title="Clear selection"
        onClick={handleDelete}
        style={btnStyle}
      >
        <Trash2 size={15} color="#333" />
      </button>
    </div>
  )
}

function HexMap({
  hexData,
  indicator,
  getValue,
  fillBounds,
  fillColors,
  selectedCells,
  drawnPolygons,
  onCellClick,
  onPolygonsChange,
  drawRef,
}: {
  hexData: any[]
  indicator: string
  getValue: (d: any) => number | null
  fillBounds: number[]
  fillColors: Color[]
  selectedCells: { h3_cell: string; [key: string]: unknown }[]
  drawnPolygons: GeoJSON.Feature[]
  onCellClick?: (obj: { h3_cell: string; compliance_weighted_avg?: number } | null) => void
  onPolygonsChange?: (features: GeoJSON.Feature[]) => void
  drawRef?: React.MutableRefObject<MapboxDraw | null>
}) {
  const getColorFunction = React.useMemo(
    () =>
      colorBins({
        attr: (d: any) => getValue(d) ?? 0,
        domain: fillBounds.slice(1, -1),
        colors: fillColors,
      }),
    [getValue, fillBounds, fillColors]
  )
  
  const NO_DATA_COLOR: [number, number, number, number] = [200, 200, 200, 60]

  const layers = React.useMemo(() => {
    const hexLayer = new H3HexagonLayer({
      id: `H3HexagonLayer-${indicator}`,
      data: hexData,
      elevationScale: 1000,
      extruded: false,
      filled: true,
      getElevation: (d: any) => getValue(d) ?? 0,
      getFillColor: (d: any, info: any) => {
        if (getValue(d) === null) return NO_DATA_COLOR
        const baseColor = getColorFunction(d, info)
        // When there is a selection, dim cells that are not selected
        if (selectedCells.length > 0) {
          const isSelected = selectedCells.some((c) => c.h3_cell === d.h3_cell)
          if (!isSelected) {
            return [...baseColor.slice(0, 3), 50] as [number, number, number, number]
          }
        }
        return baseColor
      },
      getLineColor: () => {
        return [255, 255, 255, 255] as [number, number, number, number]
      },
      lineWidthMinPixels: 1,
      getHexagon: (d: any) => d.h3_cell,
      wireframe: false,
      pickable: true,
      opacity: 0.3,
      updateTriggers: {
        getElevation: indicator,
        getFillColor: [indicator, selectedCells],
        getLineColor: [selectedCells],
      },
    })

    const polygonFeatures = (drawnPolygons ?? []).filter(
      (f: GeoJSON.Feature) => f.geometry?.type === "Polygon"
    )

    const polygonLayer =
      polygonFeatures.length > 0
        ? new PolygonLayer({
            id: "DrawnPolygonLayer",
            data: polygonFeatures,
            getPolygon: (f: any) => f.geometry?.coordinates ?? [],
            getFillColor: [210, 12, 12, 0],
            getLineColor: [210, 12, 12, 255],
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            pickable: false,
          })
        : null

    return polygonLayer ? [hexLayer, polygonLayer] : [hexLayer]
  }, [hexData, getValue, indicator, selectedCells, getColorFunction, drawnPolygons])

  const handlePolygonUpdate = React.useCallback(
    (e: DrawEvent) => {
      if (!onPolygonsChange) return
      const draw = drawRef?.current

      if (draw) {
        const all = draw.getAll()
        const features = all.features as GeoJSON.Feature[]

        if (features.length > 1) {
          const idsToDelete = features
            .slice(0, -1)
            .map((f: any) => f.id)
            .filter((id): id is string => typeof id === "string")
          if (idsToDelete.length > 0) {
            draw.delete(idsToDelete)
          }
        }

        const remaining = draw.getAll().features as GeoJSON.Feature[]
        onPolygonsChange(remaining)
      } else {
        const features = e.features
        const last = features[features.length - 1]
        onPolygonsChange(last ? [last] : [])
      }
    },
    [onPolygonsChange, drawRef]
  )

  const handlePolygonDelete = React.useCallback(
    (e: DrawEvent) => {
      if (!onPolygonsChange) return
      const draw = drawRef?.current

      if (draw) {
        onPolygonsChange(draw.getAll().features as GeoJSON.Feature[])
      } else {
        onPolygonsChange(e.features)
      }
    },
    [onPolygonsChange, drawRef]
  )

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
      <DeckGLOverlay
        layers={layers}
        onClick={({ object }: any) => {
          onCellClick?.(object ?? null);
        }}
        getTooltip={({ object }: any) => {
          if (!object) return null;

          const amenities = object?.amenities ?? {};
          const lines: string[] = [];
          const lines2: string[] = [];

          Object.entries(amenities).forEach(([amenity, amenityData]: [string, any]) => {
            const walkData = amenityData?.walk;
            if (walkData && typeof walkData === "object") {
              const t = walkData?.min_travel_time;
              const c = walkData?.compliance;
              const display = Number.isFinite(t) ? `${t} min` : `> ${MAX_TT} min`;
              let complies: string;
              if (c === 1) {
                complies = '✅'
              } else if (c === 0) {
                complies = '❌'
              } else {
                complies = '⚠️'
              }
              lines.push(`${getDestinationIcon(amenity)} ${getDestinationLabel(amenity)}: ${display} ${complies}`);
              const total_n = walkData?.total_n;
              lines2.push(`${getDestinationIcon(amenity)} ${getDestinationLabel(amenity)}: ${total_n}`);
            }
          });

          const val = getValue(object)
          if (val === null) return "No data"
          const isCompliance = indicator.includes("compliance")
          return `Compliance: ${Math.round(object.compliance_weighted_avg * 100)}%
    ${
      indicator !== "compliance_weighted_avg"
        ? isCompliance
            ? `${Math.round(val * 100)}%`
            : `${val} minutes`
        : ""
    }`
        }}
      />
      <NavigationControl position="top-left" />
      <DrawControl
        drawRef={drawRef}
        onUpdate={handlePolygonUpdate}
        onDelete={handlePolygonDelete}
      />
      <DrawToolbar
        drawRef={drawRef as React.MutableRefObject<MapboxDraw | null>}
        onClearPolygons={() => onPolygonsChange?.([])}
      />
    </Map>
  )
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
