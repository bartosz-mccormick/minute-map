import * as React from "react"
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm"
import type { HexMapCell, NestedOption } from "@/app-types"
import { installMapDataFixture, type MapFixtureIndicatorRows } from "@/db/duckdb/mapDataFixture"

type HexPerformanceFixtureApi = {
  indicators?: NestedOption[]
  getHexData: (indicator: string) => HexMapCell[]
}

type DuckDbConnectionOwner = {
  conn: AsyncDuckDBConnection
}

type UseHexPerformanceFixtureSupportParams = {
  enabled: boolean
  hexDataLength: number
  selectedIndicator: string
  ensureDuckDbClient: () => Promise<DuckDbConnectionOwner>
  loadMapData: (indicator: string, requestId?: number) => Promise<boolean>
  nextMapDataRequestId: () => number
  setAvailableIndicators: React.Dispatch<React.SetStateAction<NestedOption[]>>
  setHexData: React.Dispatch<React.SetStateAction<HexMapCell[]>>
  setActiveBounds: React.Dispatch<React.SetStateAction<number[]>>
  setMapDataError: React.Dispatch<React.SetStateAction<string | null>>
}

declare global {
  interface Window {
    __hexPerformanceFixture?: HexPerformanceFixtureApi
  }
}

function getHexPerformanceFixture() {
  if (typeof window === "undefined") return null
  return window.__hexPerformanceFixture ?? null
}

function collectIndicatorValues(indicators: NestedOption[]): string[] {
  const values: string[] = []

  for (const indicator of indicators) {
    if (indicator.children && indicator.children.length > 0) {
      values.push(...collectIndicatorValues(indicator.children))
    } else {
      values.push(indicator.value)
    }
  }

  return values
}

function getFixtureIndicatorRows(fixture: HexPerformanceFixtureApi): MapFixtureIndicatorRows[] {
  const indicatorValues = fixture.indicators
    ? collectIndicatorValues(fixture.indicators)
    : ["compliance_weighted_avg"]

  return indicatorValues.map((indicator) => ({
    indicator,
    rows: fixture.getHexData(indicator),
  }))
}

export function useHexPerformanceFixtureSupport({
  enabled,
  hexDataLength,
  selectedIndicator,
  ensureDuckDbClient,
  loadMapData,
  nextMapDataRequestId,
  setAvailableIndicators,
  setHexData,
  setActiveBounds,
  setMapDataError,
}: UseHexPerformanceFixtureSupportParams) {
  const installPromiseRef = React.useRef<Promise<void> | null>(null)
  const initialLoadStartedRef = React.useRef(false)

  const ensureInstalled = React.useCallback(async () => {
    if (!enabled) return
    if (installPromiseRef.current) {
      await installPromiseRef.current
      return
    }

    const fixture = getHexPerformanceFixture()
    if (!fixture) throw new Error("Hex performance fixture is not installed.")

    if (fixture.indicators) {
      setAvailableIndicators(fixture.indicators)
    }

    installPromiseRef.current = (async () => {
      const client = await ensureDuckDbClient()
      await installMapDataFixture(client.conn, getFixtureIndicatorRows(fixture))
    })()

    try {
      await installPromiseRef.current
    } catch (error) {
      installPromiseRef.current = null
      throw error
    }
  }, [enabled, ensureDuckDbClient, setAvailableIndicators])

  React.useEffect(() => {
    if (!enabled || hexDataLength > 0 || initialLoadStartedRef.current) return

    initialLoadStartedRef.current = true
    const requestId = nextMapDataRequestId()

    void (async () => {
      try {
        await ensureInstalled()
        await loadMapData(selectedIndicator, requestId)
      } catch (error) {
        initialLoadStartedRef.current = false
        setHexData([])
        setActiveBounds([])
        setMapDataError(error instanceof Error ? error.message : "Map data could not be loaded.")
      }
    })()
  }, [
    enabled,
    ensureInstalled,
    hexDataLength,
    loadMapData,
    nextMapDataRequestId,
    selectedIndicator,
    setActiveBounds,
    setHexData,
    setMapDataError,
  ])

  return { ensureInstalled }
}
