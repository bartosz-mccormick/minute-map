import * as React from "react"

export type PoiZoomMode = "dots" | "medium" | "close"

export type PoiMapLike = {
  getZoom: () => number
  on: (event: string, handler: () => void) => void
  off: (event: string, handler: () => void) => void
}

type UsePoiViewportSyncParams = {
  map: PoiMapLike | null
  detailedZoom: number
  closeZoom: number
  onViewportSettled: () => void
}

export function getPoiZoomMode(
  zoom: number,
  detailedZoom: number,
  closeZoom: number
): PoiZoomMode {
  if (zoom >= closeZoom) return "close"
  if (zoom >= detailedZoom) return "medium"
  return "dots"
}

export function usePoiViewportSync({
  map,
  detailedZoom,
  closeZoom,
  onViewportSettled,
}: UsePoiViewportSyncParams) {
  const [poiZoomMode, setPoiZoomMode] = React.useState<PoiZoomMode>("dots")
  const [isMapInteracting, setIsMapInteracting] = React.useState(false)

  React.useEffect(() => {
    if (!map) return

    const syncZoomMode = () => {
      const nextZoomMode = getPoiZoomMode(map.getZoom(), detailedZoom, closeZoom)

      setPoiZoomMode((current) => {
        if (current === nextZoomMode) return current
        return nextZoomMode
      })
    }

    const handleInteractionStart = () => {
      setIsMapInteracting(true)
    }

    const handleInteractionEnd = () => {
      syncZoomMode()
      setIsMapInteracting(false)
      onViewportSettled()
    }

    syncZoomMode()

    map.on("movestart", handleInteractionStart)
    map.on("zoomstart", handleInteractionStart)
    map.on("moveend", handleInteractionEnd)
    map.on("zoomend", handleInteractionEnd)

    return () => {
      map.off("movestart", handleInteractionStart)
      map.off("zoomstart", handleInteractionStart)
      map.off("moveend", handleInteractionEnd)
      map.off("zoomend", handleInteractionEnd)
    }
  }, [map, detailedZoom, closeZoom, onViewportSettled])

  return {
    poiZoomMode,
    isMapInteracting,
  }
}
