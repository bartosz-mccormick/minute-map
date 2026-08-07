import type { HexFeatureCollection } from "@/app-types"

export const HEX_SOURCE_ID = "hex-grid-source"
export const HEX_FILL_LAYER_ID = "hex-grid-fill"
export const HEX_LINE_LAYER_ID = "hex-grid-line"
export const SELECTED_HEX_SOURCE_ID = "selected-hex-grid-source"
export const SELECTED_HEX_FILL_LAYER_ID = "selected-hex-grid-fill"
export const SELECTED_HEX_LINE_LAYER_ID = "selected-hex-grid-line"

export type MapLibreHexLayerMapLike = {
  addLayer: (layer: Record<string, unknown>) => void
  addSource: (id: string, source: Record<string, unknown>) => void
  getLayer: (id: string) => unknown
  getSource: (id: string) => { setData?: (nextData: HexFeatureCollection) => void } | undefined
  isStyleLoaded: () => boolean
  off: (event: string, handler: () => void) => void
  on: (event: string, handler: () => void) => void
  removeLayer: (id: string) => void
  removeSource: (id: string) => void
  setPaintProperty: (layerId: string, name: string, value: unknown) => void
}

export function syncHexMapLayer(
  mapLike: MapLibreHexLayerMapLike,
  data: HexFeatureCollection,
  opacity: number,
  lineWidth: number
) {
  if (!mapLike.isStyleLoaded()) return false

  if (!mapLike.getSource(HEX_SOURCE_ID)) {
    mapLike.addSource(HEX_SOURCE_ID, {
      type: "geojson",
      data,
    })
  } else {
    mapLike.getSource(HEX_SOURCE_ID)?.setData?.(data)
  }

  if (!mapLike.getLayer(HEX_FILL_LAYER_ID)) {
    mapLike.addLayer({
      id: HEX_FILL_LAYER_ID,
      type: "fill",
      source: HEX_SOURCE_ID,
      paint: {
        "fill-color": ["get", "fillColor"],
        "fill-opacity": opacity,
      },
    })
  }

  if (!mapLike.getLayer(HEX_LINE_LAYER_ID)) {
    mapLike.addLayer({
      id: HEX_LINE_LAYER_ID,
      type: "line",
      source: HEX_SOURCE_ID,
      paint: {
        "line-color": "rgba(255, 255, 255, 0.7)",
        "line-width": lineWidth,
      },
    })
  }

  mapLike.setPaintProperty(HEX_FILL_LAYER_ID, "fill-opacity", opacity)
  mapLike.setPaintProperty(HEX_LINE_LAYER_ID, "line-width", lineWidth)

  return true
}

export function removeHexMapLayer(mapLike: MapLibreHexLayerMapLike) {
  if (mapLike.getLayer(HEX_LINE_LAYER_ID)) mapLike.removeLayer(HEX_LINE_LAYER_ID)
  if (mapLike.getLayer(HEX_FILL_LAYER_ID)) mapLike.removeLayer(HEX_FILL_LAYER_ID)
  if (mapLike.getSource(HEX_SOURCE_ID)) mapLike.removeSource(HEX_SOURCE_ID)
}

export function syncSelectedHexMapLayer(
  mapLike: MapLibreHexLayerMapLike,
  data: HexFeatureCollection
) {
  if (!mapLike.isStyleLoaded()) return false

  if (!mapLike.getSource(SELECTED_HEX_SOURCE_ID)) {
    mapLike.addSource(SELECTED_HEX_SOURCE_ID, {
      type: "geojson",
      data,
    })
  } else {
    mapLike.getSource(SELECTED_HEX_SOURCE_ID)?.setData?.(data)
  }

  if (!mapLike.getLayer(SELECTED_HEX_FILL_LAYER_ID)) {
    mapLike.addLayer({
      id: SELECTED_HEX_FILL_LAYER_ID,
      type: "fill",
      source: SELECTED_HEX_SOURCE_ID,
      paint: {
        "fill-color": "rgba(210, 12, 12, 0.18)",
        "fill-opacity": 1,
      },
    })
  }

  if (!mapLike.getLayer(SELECTED_HEX_LINE_LAYER_ID)) {
    mapLike.addLayer({
      id: SELECTED_HEX_LINE_LAYER_ID,
      type: "line",
      source: SELECTED_HEX_SOURCE_ID,
      paint: {
        "line-color": "#D20C0C",
        "line-width": 2,
      },
    })
  }

  return true
}

export function removeSelectedHexMapLayer(mapLike: MapLibreHexLayerMapLike) {
  if (mapLike.getLayer(SELECTED_HEX_LINE_LAYER_ID)) {
    mapLike.removeLayer(SELECTED_HEX_LINE_LAYER_ID)
  }
  if (mapLike.getLayer(SELECTED_HEX_FILL_LAYER_ID)) {
    mapLike.removeLayer(SELECTED_HEX_FILL_LAYER_ID)
  }
  if (mapLike.getSource(SELECTED_HEX_SOURCE_ID)) {
    mapLike.removeSource(SELECTED_HEX_SOURCE_ID)
  }
}
