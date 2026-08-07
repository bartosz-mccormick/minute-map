import { describe, expect, it, vi } from "vitest"
import {
  HEX_FILL_LAYER_ID,
  HEX_LINE_LAYER_ID,
  HEX_SOURCE_ID,
  SELECTED_HEX_FILL_LAYER_ID,
  SELECTED_HEX_LINE_LAYER_ID,
  SELECTED_HEX_SOURCE_ID,
  removeHexMapLayer,
  removeSelectedHexMapLayer,
  syncHexMapLayer,
  syncSelectedHexMapLayer,
  type MapLibreHexLayerMapLike,
} from "./maplibre-hex-layer"
import type { HexFeatureCollection } from "@/app-types"

function createMapLike() {
  const layers = new Set<string>()
  const sources = new Set<string>()
  const setData = vi.fn()
  const addLayer = vi.fn((layer: Record<string, unknown>) => {
    const id = layer.id as string | undefined
    if (id) layers.add(id)
  })
  const addSource = vi.fn((id: string) => {
    sources.add(id)
  })
  const getLayer = vi.fn((id: string) => (layers.has(id) ? {} : undefined))
  const getSource = vi.fn((id: string) =>
    sources.has(id) ? { setData } : undefined
  )
  const removeLayer = vi.fn((id: string) => {
    layers.delete(id)
  })
  const removeSource = vi.fn((id: string) => {
    sources.delete(id)
  })
  const setPaintProperty = vi.fn()
  const on = vi.fn()
  const off = vi.fn()

  const mapLike: MapLibreHexLayerMapLike & { setData: typeof setData } = {
    addLayer,
    addSource,
    getLayer,
    getSource,
    isStyleLoaded: () => true,
    off,
    on,
    removeLayer,
    removeSource,
    setPaintProperty,
    setData,
  }

  return mapLike
}

const fixture = {
  type: "FeatureCollection",
  features: [],
} as HexFeatureCollection

describe("syncHexMapLayer", () => {
  it("adds the source and layers once and updates them without tearing them down", () => {
    const mapLike = createMapLike()

    expect(syncHexMapLayer(mapLike, fixture, 0.3, 0.35)).toBe(true)
    expect(mapLike.addSource).toHaveBeenCalledWith(HEX_SOURCE_ID, expect.any(Object))
    expect(mapLike.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: HEX_FILL_LAYER_ID }))
    expect(mapLike.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: HEX_LINE_LAYER_ID }))
    expect(mapLike.removeLayer).not.toHaveBeenCalled()
    expect(mapLike.removeSource).not.toHaveBeenCalled()

    const nextFixture = { ...fixture }
    expect(syncHexMapLayer(mapLike, nextFixture, 0.2, 0.4)).toBe(true)
    expect(mapLike.addSource).toHaveBeenCalledTimes(1)
    expect(mapLike.addLayer).toHaveBeenCalledTimes(2)
    expect(mapLike.setData).toHaveBeenCalledWith(nextFixture)
    expect(mapLike.setPaintProperty).toHaveBeenCalledWith(
      HEX_FILL_LAYER_ID,
      "fill-opacity",
      0.2
    )
    expect(mapLike.setPaintProperty).toHaveBeenCalledWith(
      HEX_LINE_LAYER_ID,
      "line-width",
      0.4
    )
  })

  it("removes source and layers only on cleanup", () => {
    const mapLike = createMapLike()

    syncHexMapLayer(mapLike, fixture, 0.3, 0.35)
    removeHexMapLayer(mapLike)

    expect(mapLike.removeLayer).toHaveBeenCalledWith(HEX_LINE_LAYER_ID)
    expect(mapLike.removeLayer).toHaveBeenCalledWith(HEX_FILL_LAYER_ID)
    expect(mapLike.removeSource).toHaveBeenCalledWith(HEX_SOURCE_ID)
  })
})

describe("syncSelectedHexMapLayer", () => {
  it("keeps selected cells in a separate lightweight source", () => {
    const mapLike = createMapLike()

    expect(syncSelectedHexMapLayer(mapLike, fixture)).toBe(true)
    expect(mapLike.addSource).toHaveBeenCalledWith(
      SELECTED_HEX_SOURCE_ID,
      expect.any(Object)
    )
    expect(mapLike.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SELECTED_HEX_FILL_LAYER_ID })
    )
    expect(mapLike.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SELECTED_HEX_LINE_LAYER_ID })
    )

    const nextFixture = { ...fixture }
    expect(syncSelectedHexMapLayer(mapLike, nextFixture)).toBe(true)
    expect(mapLike.addSource).toHaveBeenCalledTimes(1)
    expect(mapLike.addLayer).toHaveBeenCalledTimes(2)
    expect(mapLike.setData).toHaveBeenCalledWith(nextFixture)
  })

  it("removes selected source and layers on cleanup", () => {
    const mapLike = createMapLike()

    syncSelectedHexMapLayer(mapLike, fixture)
    removeSelectedHexMapLayer(mapLike)

    expect(mapLike.removeLayer).toHaveBeenCalledWith(SELECTED_HEX_LINE_LAYER_ID)
    expect(mapLike.removeLayer).toHaveBeenCalledWith(SELECTED_HEX_FILL_LAYER_ID)
    expect(mapLike.removeSource).toHaveBeenCalledWith(SELECTED_HEX_SOURCE_ID)
  })
})
