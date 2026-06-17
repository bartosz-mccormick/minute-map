import type { MutableRefObject } from "react"

export type Color = [number, number, number]

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

export type MapWithEvents = {
  on: (event: string, fn: (...args: unknown[]) => void) => void
  off: (event: string, fn: (...args: unknown[]) => void) => void
}

export interface HexMapProps {
  hexData: any[]
  indicator: string
  getValue: (d: any) => number | null
  fillBounds: number[]
  fillColors: Color[]
  selectedCells: { h3_cell: string; [key: string]: unknown }[]
  drawnPolygons: GeoJSON.Feature[]
  onCellClick?: (obj: { h3_cell: string; compliance_weighted_avg?: number } | null) => void
  onPolygonsChange?: (features: GeoJSON.Feature[]) => void
  drawRef?: MutableRefObject<any>
}

export interface LegendBandsProps {
  bounds: number[]
  colors: Color[]
  formatValue?: (v: number) => string
}
