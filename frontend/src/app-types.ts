import type { MutableRefObject, ReactNode } from "react"

export type Color = [number, number, number]

export type BinConfig =
  | { method: "quantile"; nBins: number }
  | { method: "equal_interval"; nBins: number; min?: number; max?: number }

export interface Destination {
  value: string
  label: string
  icon: string
}

export interface TransportMode {
  value: string
  label: string
}

export interface Threshold {
  id: string
  selectedDestinations: string[]
  quantity: number
  transportMode: string
  travelTime: number
}

export interface Weight {
  id: string
  selectedDestinations: string[]
  weight: number
}

export type ThresholdPreset = Omit<Threshold, "id">

export interface PresetDefinition {
  label: string
  weights: Record<string, number>
  thresholds: Record<string, ThresholdPreset>
}

export type PresetsConfigByCity = Record<string, Record<string, PresetDefinition>>

export type NestedOption = {
  value: string
  label: string
  children?: NestedOption[]
  selectableWhenHasChildren?: boolean
  disabled?: boolean
}

export interface EditableWeightsTableProps {
  weights: Weight[]
  setWeights: (weights: Weight[]) => void
  destinations: Destination[]
}

export interface EditableThresholdsTableProps {
  thresholds: Threshold[]
  setThresholds: (thresholds: Threshold[]) => void
  transportModes: TransportMode[]
  destinations: Destination[]
  maxTravelTime?: number
}

export type DrawEvent = { features: GeoJSON.Feature[] }

export interface HexMapCell {
  h3_cell: string
  value?: number | null
  bin?: number | null
  compliance_weighted_avg?: number | null
  [key: string]: unknown
}

export interface HexMapDeckObject {
  h3_cell: string
  value?: number | null
  bin?: number | null
  compliance_weighted_avg?: number | null
  [key: string]: unknown
}

export type HexFeatureProperties = HexMapDeckObject & {
  fillColor: string
}

export type HexFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  HexFeatureProperties
>

export type MapboxDrawAll = {
  features: GeoJSON.Feature[]
}

export interface MapboxDrawApi {
  getMode: () => string
  changeMode: (mode: string) => void
  getAll: () => MapboxDrawAll
  delete: (ids: string[]) => void
}

export type MapboxDrawRef = MutableRefObject<MapboxDrawApi | null>

export type MapWithEvents = {
  on: (event: string, fn: (...args: unknown[]) => void) => void
  off: (event: string, fn: (...args: unknown[]) => void) => void
}

export interface HexMapProps {
  hexData: HexMapCell[]
  indicator: string
  fillBounds: number[]
  fillColors: Color[]
  showOverflowBin?: boolean
  gridOpacity?: number
  selectedCellIds: Set<string>
  drawnPolygons: GeoJSON.Feature[]
  onCellClick?: (obj: HexMapDeckObject | null) => void
  onPolygonsChange?: (features: GeoJSON.Feature[]) => void
  drawRef?: MapboxDrawRef
  children?: ReactNode
}

export interface LegendBandsProps {
  bounds: number[]
  colors: Color[]
  showOverflowBin?: boolean
  formatValue?: (v: number) => string
}
