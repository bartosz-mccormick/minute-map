import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm"

export type MapRow = {
  h3_cell: string
  pop: number
  value: number | null
  compliance_weighted_avg: number | null
}

export type CellDetailRow = {
  h3_cell: string
  amenity: string
  mode: string
  compliance: number | null
  min_travel_time: number | null
  n_total: number
}

type RawMapRow = {
  h3_cell: string
  pop: number
  value: number | null
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

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function parseIndicator(indicator: string) {
  const parts = indicator.split("::")
  if (parts.length !== 3) return null

  const [amenity, mode, metric] = parts
  if (!amenity || !mode) return null
  if (!["compliance", "min_travel_time", "min_travel_time_X"].includes(metric)) return null

  return { amenity, mode, metric }
}

async function ensureComplianceBatch(conn: AsyncDuckDBConnection) {
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch AS
    SELECT *
    FROM get_compliance_batch()
  `)
}

export async function runCalculations(
  conn: AsyncDuckDBConnection,
  indicator = "compliance_weighted_avg"
): Promise<MapRow[]> {
  await ensureComplianceBatch(conn)

  const parsedIndicator = parseIndicator(indicator)
  const mapRowsSql =
    indicator === "compliance_weighted_avg" || parsedIndicator === null
      ? `
        SELECT
          h3_cell,
          pop,
          compliance_weighted_avg AS value,
          compliance_weighted_avg
        FROM get_compliance_summary_by_amenity_batch()
        ORDER BY h3_cell
      `
      : `
        WITH summary AS (
          SELECT *
          FROM get_compliance_summary_by_amenity_batch()
        ),
        metric_values AS (
          SELECT
            h3_cell,
            CASE
              WHEN ${sqlString(parsedIndicator.metric)} = 'compliance' THEN max(compliance)
              WHEN ${sqlString(parsedIndicator.metric)} = 'min_travel_time' THEN min(min_travel_time)
              ELSE NULL
            END AS value
          FROM compliance_batch
          WHERE class_b = ${sqlString(parsedIndicator.amenity)}
            AND mode_config = ${sqlString(parsedIndicator.mode)}
          GROUP BY h3_cell
        )
        SELECT
          summary.h3_cell,
          summary.pop,
          metric_values.value,
          summary.compliance_weighted_avg
        FROM summary
        LEFT JOIN metric_values
          ON metric_values.h3_cell = summary.h3_cell
        ORDER BY summary.h3_cell
      `

  const result = await conn.query(mapRowsSql)

  return result.toArray().map((row) => {
    const raw = row.toJSON() as RawMapRow
    return {
      h3_cell: raw.h3_cell,
      pop: raw.pop,
      value: raw.value ?? null,
      compliance_weighted_avg: raw.compliance_weighted_avg ?? null,
    }
  })
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
