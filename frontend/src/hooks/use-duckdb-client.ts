import * as React from "react"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

export function useDuckDbClient(useHexPerformanceFixture: boolean) {
  const duckDbClientRef = React.useRef<DuckDbClient | null>(null)
  const duckDbInitPromiseRef = React.useRef<Promise<DuckDbClient> | null>(null)

  const ensureDuckDbClient = React.useCallback(async () => {
    if (duckDbClientRef.current) return duckDbClientRef.current

    if (!duckDbInitPromiseRef.current) {
      duckDbInitPromiseRef.current = (async () => {
        const { createDuckDb } = await import("@/db/duckdb/createDuckDb")
        const client = await createDuckDb()
        if (!useHexPerformanceFixture) {
          const { setupDb } = await import("@/db/duckdb/setupDb")
          await setupDb(client)
        }

        duckDbClientRef.current = client
        return client
      })()
    }

    try {
      return await duckDbInitPromiseRef.current
    } catch (error) {
      duckDbInitPromiseRef.current = null
      console.error("DuckDB initialization failed:", error)
      throw error
    }
  }, [useHexPerformanceFixture])

  React.useEffect(() => {
    void ensureDuckDbClient()
  }, [ensureDuckDbClient])

  return { ensureDuckDbClient }
}
