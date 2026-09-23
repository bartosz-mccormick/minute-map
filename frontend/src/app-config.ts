import presetsConfig from "@/config/presets.json"
import type {
  BinConfig,
  Color,
  Destination,
  NestedOption,
  PresetDefinition,
  PresetsConfigByCity,
  Threshold,
  TransportMode,
} from "./app-types"

export const R2_BUCKET = import.meta.env.VITE_R2_BUCKET?.trim().replace(/\/+$/, "") || null

export const getDataFileUrl = (filename: string, bucket = R2_BUCKET): string =>
  bucket ? `${bucket}/${filename}` : `/data/${filename}`

export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
export const MAX_TT = 30
export const DEFAULT_QUANTILE_BIN_COUNT = 5

export const COMPLIANCE_FILL_COLORS: Color[] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

export const TRAVEL_TIME_FILL_COLORS: Color[] = [
  [253, 231, 37],
  [144, 215, 67],
  [53, 183, 121],
  [33, 145, 140],
  [49, 104, 142],
  [68, 57, 131],
  [68, 1, 84],
]

export const INITIAL_SCENARIO = "current"
export const DEFAULT_PRESET_ID = "default_15_minute_city"

export function rgb([r, g, b]: Color) {
  return `rgb(${r} ${g} ${b})`
}

export function fmt(v: number) {
  return v.toFixed(1).replace(/\.0$/, "")
}

function interpolateColor(start: Color, end: Color, amount: number): Color {
  return [
    Math.round(start[0] + (end[0] - start[0]) * amount),
    Math.round(start[1] + (end[1] - start[1]) * amount),
    Math.round(start[2] + (end[2] - start[2]) * amount),
  ]
}

function sampleColors(palette: readonly Color[], count: number): Color[] {
  if (count <= 0) return []
  if (count === 1) return [palette[0]]
  if (count === palette.length) return [...palette]

  const maxPaletteIndex = palette.length - 1
  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * maxPaletteIndex
    const lowerIndex = Math.floor(position)
    const upperIndex = Math.ceil(position)
    const lower = palette[lowerIndex]
    const upper = palette[upperIndex]
    return interpolateColor(lower, upper, position - lowerIndex)
  })
}

export const presetsByCity = presetsConfig as unknown as PresetsConfigByCity

export const PRESETS: Record<string, PresetDefinition> = {}
for (const presets of Object.values(presetsByCity)) {
  for (const [presetId, preset] of Object.entries(presets)) {
    PRESETS[presetId] = preset
  }
}

export const PRESET_NESTED_OPTIONS: NestedOption[] = [
  { value: DEFAULT_PRESET_ID, label: "Default" },
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

export function getIndicatorBinConfig(indicator: string | undefined): BinConfig {
  if (isComplianceIndicator(indicator)) {
    return { method: "equal_interval", nBins: DEFAULT_QUANTILE_BIN_COUNT, min: 0, max: 1 }
  }

  return { method: "quantile", nBins: DEFAULT_QUANTILE_BIN_COUNT }
}

export function isComplianceIndicator(indicator: string | undefined) {
  return indicator === "compliance_weighted_avg" || indicator?.endsWith("::compliance") || false
}

export function isMinTravelTimeIndicator(indicator: string | undefined) {
  return indicator?.includes("min_travel_time") ?? false
}

export function getIndicatorFillColors(indicator: string | undefined, nBins: number): Color[] {
  if (isMinTravelTimeIndicator(indicator)) {
    return sampleColors(TRAVEL_TIME_FILL_COLORS.slice(0, -1), nBins)
  }

  return sampleColors(COMPLIANCE_FILL_COLORS, nBins)
}

export function getIndicatorFillConfig(
  indicator: string | undefined,
  bounds: number[]
): { bounds: number[]; colors: Color[] } {
  const colors = getIndicatorFillColors(indicator, bounds.length - 1)
  return {
    bounds,
    colors: isMinTravelTimeIndicator(indicator) && bounds.length > 1
      ? [...colors, TRAVEL_TIME_FILL_COLORS[TRAVEL_TIME_FILL_COLORS.length - 1]]
      : colors,
  }
}

export function getDestinationLabel(value: string, destinations: Destination[]) {
  return destinations.find((destination) => destination.value === value)?.label || value
}

export function getDestinationIcon(value: string, destinations: Destination[]) {
  return destinations.find((destination) => destination.value === value)?.icon || ""
}

export function getModeLabel(value: string, transportModes: TransportMode[]) {
  return transportModes.find((mode) => mode.value === value)?.label || ""
}

export function buildIndicatorOptions(
  thresholds: Threshold[],
  options: {
    destinations: Destination[]
    transportModes: TransportMode[]
    baseIndicators: NestedOption[]
    singleDestinationIndicators: NestedOption[]
  }
): NestedOption[] {
  const amenityModes: Record<string, Set<string>> = {}

  for (const threshold of thresholds) {
    for (const amenity of threshold.selectedDestinations) {
      amenityModes[amenity] ??= new Set()
      amenityModes[amenity].add(threshold.transportMode)
    }
  }

  return [
    ...options.baseIndicators,
    ...Object.entries(amenityModes).map(([amenity, modes]) => ({
      value: amenity,
      label:
        getDestinationIcon(amenity, options.destinations) +
        getDestinationLabel(amenity, options.destinations),
      children: [...modes].sort().map((mode) => ({
        value: `${amenity}::${mode}`,
        label: getModeLabel(mode, options.transportModes),
        children: options.singleDestinationIndicators.map((indicator) => ({
          value: `${amenity}::${mode}::${indicator.value}`,
          label: indicator.label,
        })),
      })),
    })),
  ]
}
