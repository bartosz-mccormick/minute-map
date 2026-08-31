import * as React from "react"
import type { DuckDbClient } from "@/db/duckdb/createDuckDb"

export function useDuckDbClient(useHexPerformanceFixture: boolean, dataBucket?: string | null) {
  const duckDbClientRef = React.useRef<DuckDbClient | null>(null)
  const duckDbInitPromiseRef = React.useRef<Promise<DuckDbClient> | null>(null)
  const duckDbClientBucketRef = React.useRef<string | null | undefined>(undefined)

  const ensureDuckDbClient = React.useCallback(async () => {
    if (duckDbClientBucketRef.current !== dataBucket) {
      duckDbClientRef.current = null
      duckDbInitPromiseRef.current = null
      duckDbClientBucketRef.current = dataBucket
    }

    if (duckDbClientRef.current) return duckDbClientRef.current

    if (!duckDbInitPromiseRef.current) {
      duckDbInitPromiseRef.current = (async () => {
        const { createIsolatedDuckDb } = await import("@/db/duckdb/createDuckDb")
        const client = await createIsolatedDuckDb()
        if (!useHexPerformanceFixture) {
          const { setupDb } = await import("@/db/duckdb/setupDb")
          await setupDb(client, dataBucket)
        }

        duckDbClientRef.current = client
        duckDbClientBucketRef.current = dataBucket
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
  }, [dataBucket, useHexPerformanceFixture])

  React.useEffect(() => {
    duckDbClientRef.current = null
    duckDbInitPromiseRef.current = null
    duckDbClientBucketRef.current = dataBucket
  }, [dataBucket])

  React.useEffect(() => {
    void ensureDuckDbClient()
  }, [ensureDuckDbClient])

  return { ensureDuckDbClient }
}
