import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { Threshold, Weight } from "@/app-types";

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function createInputTables(
  conn: AsyncDuckDBConnection,
  thresholds: Threshold[],
  weights: Weight[]
): Promise<void> {
  const reqRows = thresholds.flatMap((t) =>
    t.selectedDestinations.map(
      (class_b) =>
        `(${sqlStr(t.transportMode)}, ${t.travelTime}, ${t.quantity}, ${sqlStr(class_b)}, NULL)`
    )
  );

  const amenityWeights: Record<string, number> = {};
  for (const entry of weights) {
    for (const amenity of entry.selectedDestinations) {
      amenityWeights[amenity] = entry.weight;
    }
  }
  const weightRows = Object.entries(amenityWeights).map(
    ([class_b, weight]) => `(${sqlStr(class_b)}, ${weight})`
  );

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE req AS
    SELECT * FROM (VALUES ${reqRows.join(",\n")}) AS t(mode_config, T, X, class_b, B)
  `);

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE mm_config AS
    SELECT 1.00::DOUBLE AS c_unlock, 0.25::DOUBLE AS c_min
  `);

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE weights AS
    SELECT * FROM (VALUES ${weightRows.join(",\n")}) AS t(class_b, weight)
  `);
}
