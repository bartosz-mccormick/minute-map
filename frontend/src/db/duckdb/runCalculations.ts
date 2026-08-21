import { ALWAYS_AVAILABLE_INDICATORS, getIndicatorBinConfig, isMinTravelTimeIndicator } from "@/app-config"
import type { BinConfig } from "@/app-types"
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm"

export type MapRow = {
  h3_cell: string
  pop: number
  value: number | null
  bin: number | null
  compliance_weighted_avg: number | null
}

export type MapDataResult = {
  rows: MapRow[]
  bounds: number[]
}

export type CellDetailRow = {
  h3_cell: string
  amenity: string
  mode: string
  compliance: number | null
  min_travel_time: number | null
  n_total: number
}

export type AmenityRadarRow = {
  amenity: string
  max_compliance_weighted_avg: number | null
}

type RawMapRow = {
  h3_cell: string
  pop: number
  value: number | null
  bin: number | null
  compliance_weighted_avg: number | null
}

type RawCellDetailRow = {
  h3_cell: string
  amenity: string
  mode: string
  compliance: number | null
  min_travel_time: number | null
  n_total: number
}

type RawAmenityRadarRow = {
  amenity: string
  max_compliance_weighted_avg: number | null
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric SQL value: ${value}`)
  }
  return String(value)
}

function sqlStringList(values: readonly string[]) {
  return values.map(sqlString).join(", ")
}

function uniqueSortedBounds(bounds: number[]) {
  const unique: number[] = []

  for (const bound of bounds.filter(Number.isFinite).sort((a, b) => a - b)) {
    if (unique.length === 0 || bound > unique[unique.length - 1]) {
      unique.push(bound)
    }
  }

  if (unique.length === 1) return [unique[0], unique[0]]
  return unique
}

function parseIndicator(indicator: string) {

  const defaultResponse =
  {
    amenity: null,
    mode: null,
    metric: ALWAYS_AVAILABLE_INDICATORS[0].value,
  }

  if (["compliance_weighted_avg", "pop"].includes(indicator)) {
    return {
      amenity: null,
      mode: null,
      metric: indicator,
    }
  }
  const parts = indicator.split("::")
  if (parts.length !== 3) return defaultResponse
  const [amenity, mode, metric] = parts
  if (!amenity || !mode) return defaultResponse
  if (!["compliance", "min_travel_time", "n_total"].includes(metric)) return defaultResponse

  return { amenity, mode, metric }
}

async function getNonNullValueCount(conn: AsyncDuckDBConnection) {
  const result = await conn.query(`
    SELECT COUNT(*)::INTEGER AS n_values
    FROM map_data
    WHERE value IS NOT NULL
  `)
  const row = result.toArray()[0]?.toJSON() as { n_values?: number } | undefined
  return row?.n_values ?? 0
}

async function calculateQuantileBounds(conn: AsyncDuckDBConnection, nBins: number) {
  const probabilities = Array.from({ length: nBins + 1 }, (_, index) => index / nBins)
  const bounds: number[] = []

  for (const probability of probabilities) {
    const result = await conn.query(`
      SELECT quantile_cont(value, ${sqlNumber(probability)}) AS bound
      FROM map_data
      WHERE value IS NOT NULL
    `)
    const row = result.toArray()[0]?.toJSON() as { bound?: number | null } | undefined
    if (row?.bound !== null && row?.bound !== undefined) bounds.push(row.bound)
  }

  return uniqueSortedBounds(bounds)
}

async function calculateEqualIntervalBounds(
  conn: AsyncDuckDBConnection,
  nBins: number,
  domain?: { min: number; max: number }
) {
  if (domain) {
    if (domain.min === domain.max) return [domain.min, domain.max]
    const step = (domain.max - domain.min) / nBins
    return Array.from({ length: nBins + 1 }, (_, index) => domain.min + step * index)
  }

  const result = await conn.query(`
    SELECT MIN(value) AS min_value, MAX(value) AS max_value
    FROM map_data
    WHERE value IS NOT NULL
  `)
  const row = result.toArray()[0]?.toJSON() as { min_value?: number | null; max_value?: number | null } | undefined
  const min = row?.min_value
  const max = row?.max_value
  if (min === null || min === undefined || max === null || max === undefined) return []
  if (min === max) return [min, max]

  const step = (max - min) / nBins
  return Array.from({ length: nBins + 1 }, (_, index) => min + step * index)
}

async function calculateMapDataBounds(conn: AsyncDuckDBConnection, config: BinConfig) {
  const nValues = await getNonNullValueCount(conn)
  if (nValues === 0) {
    throw new Error("No data values are available for the selected indicator.")
  }

  switch (config.method) {
    case "quantile":
      if (config.nBins <= 0) {
        throw new Error("Quantile binning requires a positive number of bins.")
      }
      return calculateQuantileBounds(conn, config.nBins)
    case "equal_interval":
      if (config.nBins <= 0) {
        throw new Error("Equal interval binning requires a positive number of bins.")
      }
      if (config.min !== undefined && config.max !== undefined) {
        return calculateEqualIntervalBounds(conn, config.nBins, { min: config.min, max: config.max })
      }
      return calculateEqualIntervalBounds(conn, config.nBins)
  }
}

function buildBinCaseSql(bounds: number[], options: { includeNullOverflowBin?: boolean } = {}) {
  if (bounds.length < 2) {
    throw new Error("Could not calculate bin bounds for the selected indicator.")
  }

  const nullBin = options.includeNullOverflowBin ? String(bounds.length - 1) : "NULL"

  if (bounds.length === 2 && bounds[0] === bounds[1]) {
    return `CASE WHEN value IS NULL THEN ${nullBin} WHEN value = ${sqlNumber(bounds[0])} THEN 0 ELSE -1 END AS bin`
  }

  const clauses = bounds.slice(0, -1).map((min, index) => {
    const max = bounds[index + 1]
    const isLastBin = index === bounds.length - 2
    const upperCheck = isLastBin
      ? `(value < ${sqlNumber(max)} OR value = ${sqlNumber(max)})`
      : `value < ${sqlNumber(max)}`
    return `WHEN value >= ${sqlNumber(min)} AND ${upperCheck} THEN ${index}`
  })

  return `CASE WHEN value IS NULL THEN ${nullBin} ${clauses.join(" ")} ELSE -1 END AS bin`
}

async function addBinsToMapData(
  conn: AsyncDuckDBConnection,
  bounds: number[],
  options: { includeNullOverflowBin?: boolean } = {}
) {
  const valueSql = options.includeNullOverflowBin
    ? `COALESCE(value, ${sqlNumber(bounds[bounds.length - 1])}) AS value`
    : "value"

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE map_data AS
    SELECT
      h3_cell,
      pop,
      compliance_weighted_avg,
      ${valueSql},
      ${buildBinCaseSql(bounds, options)}
    FROM map_data
    ORDER BY h3_cell
  `)
}

export async function runCalculations(conn: AsyncDuckDBConnection): Promise<void> {
  // main query (amenity-mode)
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch AS
    SELECT *
    FROM get_compliance_batch()
  `)

  // amenity-level summary
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch_amenity_summary AS
    SELECT *
    FROM get_compliance_batch_amenity_summary()
  `)
  // cell-level summary
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch_summary AS
    SELECT *
    FROM get_compliance_batch_summary()
  `)
}

export async function getMapData(
  conn: AsyncDuckDBConnection,
  indicator = "compliance_weighted_avg"
): Promise<MapDataResult> {
  const parsedIndicator = parseIndicator(indicator)
  //console.log(parsedIndicator)
  const mapRowsSql =
  (parsedIndicator.amenity === null && parsedIndicator.mode === null)
      ? `
        CREATE OR REPLACE TEMP TABLE map_data AS
        SELECT
          h3_cell,
          pop,
          compliance_weighted_avg,
          ${parsedIndicator.metric} AS value
        FROM compliance_batch_summary
        ORDER BY h3_cell
      `
      : `
      CREATE OR REPLACE TEMP TABLE map_data AS
        WITH metric_values AS (
          SELECT
            h3_cell,
            ${parsedIndicator.metric} AS value
          FROM compliance_batch
          WHERE class_b = ${sqlString(parsedIndicator.amenity)}
            AND mode_config = ${sqlString(parsedIndicator.mode)}
        )
        SELECT
          summary.h3_cell,
          summary.pop,
          summary.compliance_weighted_avg,
          metric_values.value
        FROM compliance_batch_summary AS summary
        LEFT JOIN metric_values
          ON metric_values.h3_cell = summary.h3_cell
        ORDER BY summary.h3_cell
      `
      
  await conn.query(mapRowsSql);

  const bounds = await calculateMapDataBounds(conn, getIndicatorBinConfig(indicator))
  await addBinsToMapData(conn, bounds, {
    includeNullOverflowBin: isMinTravelTimeIndicator(indicator),
  })

  const result = await conn.query(`SELECT * FROM map_data`)

  const rows = result.toArray().map((row) => {
    const raw = row.toJSON() as RawMapRow
    return {
      h3_cell: raw.h3_cell,
      pop: raw.pop,
      value: raw.value ?? null,
      bin: raw.bin ?? null,
      compliance_weighted_avg: raw.compliance_weighted_avg ?? null,
    }
  })

  return { rows, bounds }
}

export async function getCellDetails(
  conn: AsyncDuckDBConnection,
  h3Cell: string
): Promise<CellDetailRow[]> {
  const result = await conn.query(`
    SELECT
      h3_cell,
      class_b AS amenity,
      mode_config AS mode,
      compliance,
      min_travel_time,
      n_total
    FROM compliance_batch
    WHERE h3_cell = ${sqlString(h3Cell)}
    ORDER BY class_b, mode_config
  `)

  return result.toArray().map((row) => {
    const raw = row.toJSON() as RawCellDetailRow
    return {
      h3_cell: raw.h3_cell,
      amenity: raw.amenity,
      mode: raw.mode,
      compliance: raw.compliance ?? null,
      min_travel_time: raw.min_travel_time ?? null,
      n_total: raw.n_total,
    }
  })
}

export async function getAmenityRadarData(
  conn: AsyncDuckDBConnection,
  h3Cells?: readonly string[]
): Promise<AmenityRadarRow[]> {
  const hasSelection = h3Cells !== undefined && h3Cells.length > 0
  const sourceTableSql = hasSelection
    ? `
      SELECT *
      FROM compliance_batch_amenity_summary
      WHERE h3_cell IN (${sqlStringList(h3Cells)})
    `
    : `
      SELECT *
      FROM compliance_batch_amenity_summary
    `

  const result = await conn.query(`
    WITH radar_source AS (
      ${sourceTableSql}
    ),
    area_population AS (
      SELECT SUM(pop) AS total_pop
      FROM (
        SELECT DISTINCT h3_cell, pop
        FROM radar_source
      )
    )
    SELECT
      class_b AS amenity,
      CASE
        WHEN area_population.total_pop > 0
          THEN SUM(max_compliance * pop) / area_population.total_pop
        ELSE NULL
      END AS max_compliance_weighted_avg
    FROM radar_source
    CROSS JOIN area_population
    GROUP BY class_b, area_population.total_pop
    ORDER BY class_b
  `)

  return result.toArray().map((row) => {
    const raw = row.toJSON() as RawAmenityRadarRow
    return {
      amenity: raw.amenity,
      max_compliance_weighted_avg: raw.max_compliance_weighted_avg ?? null,
    }
  })
}
