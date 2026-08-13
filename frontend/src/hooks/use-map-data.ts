import * as React from "react"
import type { HexMapCell } from "@/app-types"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

export function useMapData(ensureDuckDbClient: () => Promise<DuckDbClient>) {
  const [hexData, setHexData] = React.useState<HexMapCell[]>([])
  const [activeBounds, setActiveBounds] = React.useState<number[]>([])
  const [mapDataError, setMapDataError] = React.useState<string | null>("Run analysis to load map data.")
  const mapDataRequestIdRef = React.useRef(0)

  const nextMapDataRequestId = React.useCallback(() => {
    const requestId = mapDataRequestIdRef.current + 1
    mapDataRequestIdRef.current = requestId
    return requestId
  }, [])

  const clearMapData = React.useCallback((message: string) => {
    setHexData([])
    setActiveBounds([])
    setMapDataError(message)
  }, [])

  const loadMapData = React.useCallback(
    async (indicator: string, requestId = mapDataRequestIdRef.current) => {
      const client = await ensureDuckDbClient()
      const { getMapData } = await import("@/db/duckdb/runCalculations")
      const { rows, bounds } = await getMapData(client.conn, indicator)
      if (requestId !== mapDataRequestIdRef.current) return false
      setHexData(rows)
      setActiveBounds(bounds)
      setMapDataError(null)
      return true
    },
    [ensureDuckDbClient]
  )

  return {
    hexData,
    setHexData,
    activeBounds,
    setActiveBounds,
    mapDataError,
    setMapDataError,
    clearMapData,
    loadMapData,
    nextMapDataRequestId,
  }
}
