import * as React from "react"
import { DESTINATIONS } from "@/app-config"
import type { AmenityRadarDataResult, HexMapCell } from "@/app-types"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

const EMPTY_AMENITY_RADAR_DATA: AmenityRadarDataResult = {
  totalPop: 0,
  rows: [],
}

export function useMapData(ensureDuckDbClient: () => Promise<DuckDbClient>) {
  const [hexData, setHexData] = React.useState<HexMapCell[]>([])
  const [amenityRadarData, setAmenityRadarData] = React.useState<AmenityRadarDataResult>(EMPTY_AMENITY_RADAR_DATA)
  const [selectedAmenityRadarData, setSelectedAmenityRadarData] = React.useState<AmenityRadarDataResult>(EMPTY_AMENITY_RADAR_DATA)
  const [activeBounds, setActiveBounds] = React.useState<number[]>([])
  const [mapDataError, setMapDataError] = React.useState<string | null>("Run analysis to load map data.")
  const mapDataRequestIdRef = React.useRef(0)
  const zeroPopulationSelectionAlertKeyRef = React.useRef<string | null>(null)

  const nextMapDataRequestId = React.useCallback(() => {
    const requestId = mapDataRequestIdRef.current + 1
    mapDataRequestIdRef.current = requestId
    return requestId
  }, [])

  const clearMapData = React.useCallback((message: string) => {
    setHexData([])
    setAmenityRadarData(EMPTY_AMENITY_RADAR_DATA)
    setSelectedAmenityRadarData(EMPTY_AMENITY_RADAR_DATA)
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
      const nextRadarDataResult: AmenityRadarDataResult = {
        totalPop: rows[0]?.total_pop ?? 0,
        rows: nextRadarData,
      }
      if (h3Cells && h3Cells.length > 0) {
        const selectionKey = [...h3Cells].sort().join("|")
        if (nextRadarDataResult.totalPop <= 0 && zeroPopulationSelectionAlertKeyRef.current !== selectionKey) {
          zeroPopulationSelectionAlertKeyRef.current = selectionKey
          window.alert("Total population is unavailable for this selection.")
        }
        setSelectedAmenityRadarData(nextRadarDataResult)
      } else {
        zeroPopulationSelectionAlertKeyRef.current = null
        setAmenityRadarData(nextRadarDataResult)
      }
    },
    [ensureDuckDbClient]
  )

  const clearSelectedAmenityRadarData = React.useCallback(() => {
    zeroPopulationSelectionAlertKeyRef.current = null
    setSelectedAmenityRadarData(EMPTY_AMENITY_RADAR_DATA)
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
