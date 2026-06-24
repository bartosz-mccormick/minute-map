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

export const DESTINATIONS: Destination[] = [
  { value: "grocery", label: "Supermarket", icon: "рџ›’" },
  { value: "pharmacy", label: "Pharmacy", icon: "рџ’Љ" },
  { value: "atm_bank", label: "ATM/Bank", icon: "рџЏ§" },
  { value: "post", label: "Post Office", icon: "рџ“¦" },
  { value: "gp", label: "General Practitioner", icon: "рџ©є" },
  { value: "restaurant", label: "Restaurant", icon: "рџЌЅпёЏ" },
  { value: "cafe", label: "Cafe", icon: "в•" },
  { value: "bar", label: "Bar", icon: "рџЌє" },
  { value: "bakery", label: "Bakery", icon: "рџҐђ" },
  { value: "school", label: "School", icon: "рџЏ«" },
  { value: "kindergarten", label: "Kindergarten", icon: "рџ§ё" },
  { value: "library", label: "Library", icon: "рџ“љ" },
  { value: "sport", label: "Sports Facility", icon: "рџЏѓ" },
  { value: "park", label: "Park", icon: "рџЊі" },
  { value: "playground", label: "Playground", icon: "рџ›ќ" },
]

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
]

export const SINGLE_DESTINATION_INDICATORS = [
  { value: "compliance", label: "Compliance" },
  { value: "min_travel_time", label: "Time to Nearest" },
  { value: "min_travel_time_X", label: "Time to Nearest X" },
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

export function getIndicatorValue(indicator: string, d: Record<string, unknown>): number | null {
  const parts = indicator.split("::")
  if (parts.length === 1) return (d[indicator] as number) ?? null
  if (parts.length === 3) {
    const [amenity, mode, metric] = parts
    const amenities = d.amenities as Record<string, Record<string, Record<string, number>>> | undefined
    return amenities?.[amenity]?.[mode]?.[metric] ?? null
  }
  return null
}

export function getIndicatorFillConfig(indicator: string | undefined): { bounds: number[]; colors: Color[] } {
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
