import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getPoiZoomMode, usePoiViewportSync, type PoiMapLike } from "@/components/poi/usePoiViewportSync"

class FakeMap implements PoiMapLike {
  private handlers = new Map<string, Set<() => void>>()
  private zoom = 10

  getZoom() {
    return this.zoom
  }

  setZoom(zoom: number) {
    this.zoom = zoom
  }

  on(event: string, handler: () => void) {
    const eventHandlers = this.handlers.get(event) ?? new Set<() => void>()
    eventHandlers.add(handler)
    this.handlers.set(event, eventHandlers)
  }

  off(event: string, handler: () => void) {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event: string) {
    this.handlers.get(event)?.forEach((handler) => handler())
  }

  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0
  }
}

describe("getPoiZoomMode", () => {
  it("maps zoom values to stable POI rendering modes", () => {
    expect(getPoiZoomMode(10, 13, 16)).toBe("dots")
    expect(getPoiZoomMode(13, 13, 16)).toBe("medium")
    expect(getPoiZoomMode(16, 13, 16)).toBe("close")
  })
})

describe("usePoiViewportSync", () => {
  it("does not subscribe to continuous move or zoom events", () => {
    const map = new FakeMap()
    const onViewportSettled = vi.fn()

    renderHook(() =>
      usePoiViewportSync({
        map,
        detailedZoom: 13,
        closeZoom: 16,
        onViewportSettled,
      })
    )

    expect(map.listenerCount("move")).toBe(0)
    expect(map.listenerCount("zoom")).toBe(0)
    expect(map.listenerCount("movestart")).toBe(1)
    expect(map.listenerCount("zoomstart")).toBe(1)
    expect(map.listenerCount("moveend")).toBe(1)
    expect(map.listenerCount("zoomend")).toBe(1)
  })

  it("does not recalculate viewport during continuous movement", () => {
    const map = new FakeMap()
    const onViewportSettled = vi.fn()

    renderHook(() =>
      usePoiViewportSync({
        map,
        detailedZoom: 13,
        closeZoom: 16,
        onViewportSettled,
      })
    )

    act(() => {
      map.emit("move")
      map.emit("zoom")
      map.emit("move")
    })

    expect(onViewportSettled).not.toHaveBeenCalled()
  })

  it("updates viewport only after moveend or zoomend", () => {
    const map = new FakeMap()
    const onViewportSettled = vi.fn()

    const { result } = renderHook(() =>
      usePoiViewportSync({
        map,
        detailedZoom: 13,
        closeZoom: 16,
        onViewportSettled,
      })
    )

    act(() => {
      map.emit("movestart")
    })

    expect(result.current.isMapInteracting).toBe(true)

    act(() => {
      map.setZoom(14)
      map.emit("moveend")
    })

    expect(onViewportSettled).toHaveBeenCalledTimes(1)
    expect(result.current.isMapInteracting).toBe(false)
    expect(result.current.poiZoomMode).toBe("medium")
  })
})
