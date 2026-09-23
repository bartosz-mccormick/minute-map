import { getDataFileUrl } from "@/app-config"
import { incrementPoiPerfCounter } from "@/components/poi/poiPerfDebug"
import type { Destination } from "@/app-types"
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm"

export type PoiCategory = Destination["value"]

export type PoiRow = {
  poi_id: string
  name: string
  category: PoiCategory
  subtype: string
  lon: number
  lat: number
}

type RawPoiRow = {
  poi_id?: string
  name?: string
  category?: string
  subtype?: string
  lon?: number
  lat?: number
  geom?: ArrayBuffer | Uint8Array | number[] | string
}

type PoiSource = {
  file: string
  query: string
}

export type PoiLoadStatus = "idle" | "loading" | "loaded" | "error"

const POI_SOURCE: PoiSource = {
  file: "entrances.parquet",
  query: `
    SELECT
      CAST(row_number() OVER () AS VARCHAR) AS poi_id,
      __NAME_SELECT__ AS name,
      class_b AS category,
      '' AS subtype,
      geom
    FROM poi_src
    WHERE class_b IN (__CATEGORIES__)
      AND geom IS NOT NULL
  `,
}

const poiRowsPromisesByUrl = new Map<string, Promise<PoiRow[]>>()
const poiRowsByUrl = new Map<string, PoiRow[]>()
const poiLoadStatusByUrl = new Map<string, PoiLoadStatus>()

function sqlList(values: string[]) {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")
}

function getDuckDbFileUrl(url: string) {
  return new URL(url, window.location.href).href
}

function getPoiSourceUrl(dataBucket?: string | null) {
  return getDuckDbFileUrl(getDataFileUrl(POI_SOURCE.file, dataBucket))
}

function parseWkbPoint(value: RawPoiRow["geom"]): { lon: number; lat: number } | null {
  if (!value) return null

  let bytes: Uint8Array
  if (value instanceof Uint8Array) {
    bytes = value
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value)
  } else if (Array.isArray(value)) {
    bytes = new Uint8Array(value)
  } else if (typeof value === "string") {
    const cleanHex = value.startsWith("\\x") ? value.slice(2) : value
    if (cleanHex.length < 42 || cleanHex.length % 2 !== 0) return null
    bytes = new Uint8Array(cleanHex.length / 2)
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16)
    }
  } else {
    return null
  }

  if (bytes.byteLength < 21) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const littleEndian = view.getUint8(0) === 1
  const geometryType = view.getUint32(1, littleEndian)
  if (geometryType !== 1) return null

  return {
    lon: view.getFloat64(5, littleEndian),
    lat: view.getFloat64(13, littleEndian),
  }
}

function getPoiCacheKey(url: string, categories: Destination[]) {
  return `${url}::${categories.map((category) => category.value).sort().join(",")}`
}

function toPoiRows(rawRows: RawPoiRow[], categories: Destination[]): PoiRow[] {
  const categoryConfigByValue = new Set(categories.map((category) => category.value))
  return rawRows
    .map((row) => {
      const parsedPoint =
        typeof row.lon === "number" && typeof row.lat === "number"
          ? { lon: row.lon, lat: row.lat }
          : parseWkbPoint(row.geom)

      if (
        !parsedPoint ||
        typeof row.category !== "string" ||
        !categoryConfigByValue.has(row.category)
      ) {
        return null
      }

      return {
        poi_id: row.poi_id || `${row.category}-${parsedPoint.lon}-${parsedPoint.lat}`,
        name: row.name || "",
        category: row.category as PoiCategory,
        subtype: row.subtype || "",
        lon: parsedPoint.lon,
        lat: parsedPoint.lat,
      }
    })
    .filter((row): row is PoiRow => row !== null)
}

async function hasPoiSourceColumn(conn: AsyncDuckDBConnection, columnName: string) {
  const result = await conn.query("DESCRIBE poi_src")
  return result
    .toArray()
    .some((row) => {
      const json = row.toJSON() as { column_name?: unknown }
      return String(json.column_name ?? "").toLowerCase() === columnName.toLowerCase()
    })
}

export function getPoiLoadStatus(
  dataBucket: string | null | undefined,
  categories: Destination[]
): PoiLoadStatus {
  return poiLoadStatusByUrl.get(getPoiCacheKey(getPoiSourceUrl(dataBucket), categories)) ?? "idle"
}

export async function loadPois(
  dataBucket: string | null | undefined,
  categories: Destination[]
): Promise<PoiRow[]> {
  const absoluteSourceUrl = getPoiSourceUrl(dataBucket)
  const cacheKey = getPoiCacheKey(absoluteSourceUrl, categories)
  const cachedRows = poiRowsByUrl.get(cacheKey)
  if (cachedRows) return cachedRows

  const cachedRowsPromise = poiRowsPromisesByUrl.get(cacheKey)
  if (cachedRowsPromise) return cachedRowsPromise

  const poiRowsPromise = (async () => {
    incrementPoiPerfCounter("loadPois")
    poiLoadStatusByUrl.set(cacheKey, "loading")

    const { createIsolatedDuckDb } = await import("@/db/duckdb/createDuckDb")
    const duckdb = await import("@duckdb/duckdb-wasm")
    const { db, conn } = await createIsolatedDuckDb()
    const categoryValues = categories.map((category) => category.value)

    await conn.query("SET enable_geoparquet_conversion = false")

    await db.registerFileURL(
      POI_SOURCE.file,
      absoluteSourceUrl,
      duckdb.DuckDBDataProtocol.HTTP,
      false
    )

    await conn.query(`
      CREATE OR REPLACE VIEW poi_src AS
      SELECT *
      FROM read_parquet('${POI_SOURCE.file}')
    `)

    const nameSelect = await hasPoiSourceColumn(conn, "name")
      ? "COALESCE(NULLIF(TRIM(CAST(name AS VARCHAR)), ''), '')"
      : "''"
    const result = await conn.query(
      POI_SOURCE.query
        .replace("__CATEGORIES__", sqlList([...new Set(categoryValues)]))
        .replace("__NAME_SELECT__", nameSelect)
    )

    const rows = toPoiRows(result.toArray().map((row) => row.toJSON() as RawPoiRow), categories)
    poiRowsByUrl.set(cacheKey, rows)
    poiLoadStatusByUrl.set(cacheKey, "loaded")
    return rows
  })().catch((error) => {
    poiRowsPromisesByUrl.delete(cacheKey)
    poiLoadStatusByUrl.set(cacheKey, "error")
    throw error
  })

  poiRowsPromisesByUrl.set(cacheKey, poiRowsPromise)
  return poiRowsPromise
}

export async function prefetchPois(
  dataBucket: string | null | undefined,
  categories: Destination[]
): Promise<void> {
  await loadPois(dataBucket, categories)
}
