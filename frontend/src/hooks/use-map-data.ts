import * as React from "react"
import { DESTINATIONS } from "@/app-config"
import type { AmenityRadarDataPoint, HexMapCell } from "@/app-types"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

export function useMapData(ensureDuckDbClient: () => Promise<DuckDbClient>) {
  const [hexData, setHexData] = React.useState<HexMapCell[]>([])
  const [amenityRadarData, setAmenityRadarData] = React.useState<AmenityRadarDataPoint[]>([])
  const [selectedAmenityRadarData, setSelectedAmenityRadarData] = React.useState<AmenityRadarDataPoint[]>([])
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
    setAmenityRadarData([])
    setSelectedAmenityRadarData([])
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

  const loadAmenityRadarData = React.useCallback(
    async (h3Cells?: readonly string[]) => {
      const client = await ensureDuckDbClient()
      const { getAmenityRadarData } = await import("@/db/duckdb/runCalculations")
      const rows = await getAmenityRadarData(client.conn, h3Cells)
      const returnedAmenities = new Set(rows.map((row) => row.amenity))
      const missingAmenities = DESTINATIONS
        .map((destination) => destination.value)
        .filter((amenity) => !returnedAmenities.has(amenity))
      if (missingAmenities.length > 0) {
        console.warn("Amenity radar data is missing destinations:", missingAmenities)
      }
      const nextRadarData = rows.map((row) => ({
        amenity: row.amenity,
        value: row.max_compliance_weighted_avg,
      }))
      if (h3Cells && h3Cells.length > 0) {
        setSelectedAmenityRadarData(nextRadarData)
      } else {
        setAmenityRadarData(nextRadarData)
      }
    },
    [ensureDuckDbClient]
  )

  const clearSelectedAmenityRadarData = React.useCallback(() => {
    setSelectedAmenityRadarData([])
  }, [])

  return {
    hexData,
    setHexData,
    amenityRadarData,
    selectedAmenityRadarData,
    activeBounds,
    setActiveBounds,
    mapDataError,
    setMapDataError,
    clearMapData,
    loadMapData,
    loadAmenityRadarData,
    clearSelectedAmenityRadarData,
    nextMapDataRequestId,
  }
}
