import presetsConfig from "@/config/presets.json"
import type {
  Color,
  Destination,
  NestedOption,
  PresetDefinition,
  PresetsConfigByCity,
  Threshold,
  TransportMode,
  Weight,
} from "./app-types"



export const INITIAL_VIEW_STATE = {
  longitude: Number(import.meta.env.VITE_INITIAL_LONGITUDE),
  latitude: Number(import.meta.env.VITE_INITIAL_LATITUDE),
  zoom: Number(import.meta.env.VITE_INITIAL_ZOOM),
  pitch: Number(import.meta.env.VITE_INITIAL_PITCH),
  bearing: Number(import.meta.env.VITE_INITIAL_BEARING),
}

// handle parquet files
export const R2_BUCKET = import.meta.env.VITE_R2_BUCKET?.trim().replace(/\/+$/, "") || null;
  
export const getDataFileUrl = (filename: string): string =>
  R2_BUCKET ? `${R2_BUCKET}/${filename}` : `/data/${filename}`;

export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
export const MAX_TT = 30

export const COMPLIANCE_FILL_BOUNDS = [0, 0.2, 0.4, 0.6, 0.8, 1]
export const COMPLIANCE_FILL_COLORS: Color[] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

export const TRAVEL_TIME_FILL_BOUNDS = [0, 5, 10, 15, 20, 25, 30]
export const TRAVEL_TIME_FILL_COLORS: Color[] = [
  [253, 231, 37],
  [144, 215, 67],
  [53, 183, 121],
  [33, 145, 140],
  [49, 104, 142],
  [68, 57, 131],
  [68, 1, 84],
]

export const OPPORTUNITIES_FILL_BOUNDS = [0, 1, 2, 5, 10, 20, 50]
export const OPPORTUNITIES_FILL_COLORS: Color[] = TRAVEL_TIME_FILL_COLORS

export const DESTINATIONS: Destination[] = [
  { value: "grocery", label: "Supermarket", icon: "🛒" },
  { value: "pharmacy", label: "Pharmacy", icon: "💊" },
  { value: "atm_bank", label: "ATM/Bank", icon: "🏦" },
  { value: "post", label: "Post Office", icon: "📦" },
  { value: "gp", label: "General Practitioner", icon: "🩺" },
  { value: "restaurant", label: "Restaurant", icon: "🍽️" },
  { value: "cafe", label: "Cafe", icon: "☕" },
  { value: "bar", label: "Bar", icon: "🍺" },
  { value: "bakery", label: "Bakery", icon: "🥐" },
  { value: "school", label: "School", icon: "🏫" },
  { value: "kindergarten", label: "Kindergarten", icon: "🧸" },
  { value: "library", label: "Library", icon: "📚" },
  { value: "sport", label: "Sports Facility", icon: "🏃" },
  { value: "park", label: "Park", icon: "🌳" },
  { value: "playground", label: "Playground", icon: "🛝" },
]

export const POI_DESTINATIONS: Destination[] = DESTINATIONS.map((destination) =>
  destination.value === "park"
    ? { ...destination, label: "Park entrances", icon: "🌳" }
    : destination
)

export const TRANSPORT_MODES: TransportMode[] = [
  { value: "walk", label: "Walking (4 km/h)" },
  { value: "bike", label: "Cycling" },
]

export const INITIAL_WEIGHTS: Weight[] = [
  {
    id: "weights-entry",
    selectedDestinations: DESTINATIONS.map((d) => d.value),
    weight: 1,
  },
]

export const INITIAL_SCENARIO = "current"

export const INITIAL_THRESHOLDS: Threshold[] = []

export const ALWAYS_AVAILABLE_INDICATORS: NestedOption[] = [
  { value: "compliance_weighted_avg", label: "X-Min City Compliance" },
  { value: "pop", label: "Population" }
]

export const SINGLE_DESTINATION_INDICATORS = [
  { value: "compliance", label: "Compliance" },
  { value: "min_travel_time", label: "Time to Nearest" },
  { value: "n_total", label: "Number of Opportunities" },
]

export function rgb([r, g, b]: Color) {
  return `rgb(${r} ${g} ${b})`
}

export function fmt(v: number) {
  return v.toFixed(1).replace(/\.0$/, "")
}

export const presetsByCity = presetsConfig as unknown as PresetsConfigByCity

export const PRESETS: Record<string, PresetDefinition> = {}
for (const presets of Object.values(presetsByCity)) {
  for (const [presetId, preset] of Object.entries(presets)) {
    PRESETS[presetId] = preset
  }
}

export const PRESET_NESTED_OPTIONS: NestedOption[] = [
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

export function getIndicatorFillConfig(indicator: string | undefined): { bounds: number[]; colors: Color[] } {
  if (indicator?.endsWith("::n_total")) {
    return {
      bounds: OPPORTUNITIES_FILL_BOUNDS,
      colors: OPPORTUNITIES_FILL_COLORS,
    }
  }

  const isCompliance = indicator?.includes("compliance")
  return {
    bounds: isCompliance ? COMPLIANCE_FILL_BOUNDS : TRAVEL_TIME_FILL_BOUNDS,
    colors: isCompliance ? COMPLIANCE_FILL_COLORS : TRAVEL_TIME_FILL_COLORS,
  }
}

export function getDestinationLabel(value: string) {
  return DESTINATIONS.find((d) => d.value === value)?.label || value
}

export function getDestinationIcon(value: string) {
  return DESTINATIONS.find((d) => d.value === value)?.icon || ""
}

export function getModeLabel(value: string) {
  return TRANSPORT_MODES.find((d) => d.value === value)?.label || ""
}

export function buildIndicatorOptions(thresholds: Threshold[]): NestedOption[] {
  const amenityModes: Record<string, Set<string>> = {}

  for (const threshold of thresholds) {
    for (const amenity of threshold.selectedDestinations) {
      if (!amenityModes[amenity]) {
        amenityModes[amenity] = new Set()
      }

      amenityModes[amenity].add(threshold.transportMode)
    }
  }

  return [
    ...ALWAYS_AVAILABLE_INDICATORS,
    ...Object.entries(amenityModes).map(([amenity, modes]) => ({
      value: amenity,
      label: getDestinationIcon(amenity) + getDestinationLabel(amenity),
      children: [...modes].sort().map((mode) => ({
        value: `${amenity}::${mode}`,
        label: getModeLabel(mode),
        children: SINGLE_DESTINATION_INDICATORS.map((indicator) => ({
          value: `${amenity}::${mode}::${indicator.value}`,
          label: indicator.label,
        })),
      })),
    })),
  ]
}
