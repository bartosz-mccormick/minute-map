import { ALWAYS_AVAILABLE_INDICATORS } from "@/app-config"
import type { HexMapCell } from "@/app-types"
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm"

export type MapFixtureIndicatorRows = {
  indicator: string
  rows: HexMapCell[]
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

function sqlNullableNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "NULL" : sqlNumber(value)
}

function parseIndicator(indicator: string) {
  const defaultResponse = {
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

function valuesOrEmptyTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: string[]
}) {
  if (rows.length === 0) {
    return `SELECT ${columns.map((column) => `NULL AS ${column}`).join(", ")} WHERE FALSE`
  }

  return `SELECT * FROM (VALUES ${rows.join(",\n")}) AS t(${columns.join(", ")})`
}

export async function installMapDataFixture(
  conn: AsyncDuckDBConnection,
  indicatorRows: MapFixtureIndicatorRows[]
) {
  const rowsByIndicator = new Map(indicatorRows.map(({ indicator, rows }) => [indicator, rows]))
  const summaryRows = rowsByIndicator.get("compliance_weighted_avg") ?? indicatorRows[0]?.rows ?? []

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch_summary AS
    ${valuesOrEmptyTable({
      columns: ["h3_cell", "pop", "compliance_weighted_avg"],
      rows: summaryRows.map((row) => `(
        ${sqlString(row.h3_cell)},
        ${sqlNullableNumber(typeof row.pop === "number" ? row.pop : null)},
        ${sqlNullableNumber(row.compliance_weighted_avg ?? row.value ?? null)}
      )`),
    })}
  `)

  const rowsByCellAmenityMode = new Map<
    string,
    {
      h3_cell: string
      pop: number | null
      class_b: string
      mode_config: string
      compliance: number | null
      min_travel_time: number | null
      n_total: number | null
    }
  >()

  for (const { indicator, rows } of indicatorRows) {
    const parsed = parseIndicator(indicator)
    if (!parsed.amenity || !parsed.mode) continue

    for (const row of rows) {
      const key = `${row.h3_cell}\u0000${parsed.amenity}\u0000${parsed.mode}`
      const entry = rowsByCellAmenityMode.get(key) ?? {
        h3_cell: row.h3_cell,
        pop: typeof row.pop === "number" ? row.pop : null,
        class_b: parsed.amenity,
        mode_config: parsed.mode,
        compliance: null,
        min_travel_time: null,
        n_total: null,
      }

      if (parsed.metric === "compliance") entry.compliance = row.value ?? null
      if (parsed.metric === "min_travel_time") entry.min_travel_time = row.value ?? null
      if (parsed.metric === "n_total") entry.n_total = row.value ?? null
      rowsByCellAmenityMode.set(key, entry)
    }
  }

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch AS
    ${valuesOrEmptyTable({
      columns: [
        "h3_cell",
        "pop",
        "class_b",
        "mode_config",
        "T",
        "X",
        "B",
        "min_travel_time",
        "n_total",
        "compliance",
      ],
      rows: [...rowsByCellAmenityMode.values()].map((row) => `(
        ${sqlString(row.h3_cell)},
        ${sqlNullableNumber(row.pop)},
        ${sqlString(row.class_b)},
        ${sqlString(row.mode_config)},
        NULL,
        NULL,
        NULL,
        ${sqlNullableNumber(row.min_travel_time)},
        ${sqlNullableNumber(row.n_total)},
        ${sqlNullableNumber(row.compliance)}
      )`),
    })}
  `)
}
