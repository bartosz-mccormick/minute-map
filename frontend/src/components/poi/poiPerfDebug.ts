type PoiPerfCounterName = "loadPois" | "viewportPois" | "renderablePois" | "markerRows" | "poiLayers"

type PoiPerfDebugApi = {
  increment: (name: PoiPerfCounterName) => void
  reset: () => void
  snapshot: () => Record<PoiPerfCounterName, number>
}

const createInitialCounters = (): Record<PoiPerfCounterName, number> => ({
  loadPois: 0,
  viewportPois: 0,
  renderablePois: 0,
  markerRows: 0,
  poiLayers: 0,
})

declare global {
  interface Window {
    __poiPerf?: PoiPerfDebugApi
  }
}

export function ensurePoiPerfDebug() {
  if (typeof window === "undefined") return null

  if (!window.__poiPerf) {
    let counters = createInitialCounters()

    window.__poiPerf = {
      increment: (name) => {
        counters[name] += 1
      },
      reset: () => {
        counters = createInitialCounters()
      },
      snapshot: () => ({ ...counters }),
    }
  }

  return window.__poiPerf
}

export function incrementPoiPerfCounter(name: PoiPerfCounterName) {
  if (!import.meta.env.DEV) return

  ensurePoiPerfDebug()?.increment(name)
}
