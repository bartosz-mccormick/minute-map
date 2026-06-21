import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export async function createTestInputTables(
  conn: AsyncDuckDBConnection
): Promise<void> {
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE req AS
    SELECT *
    FROM (
      VALUES
        ('walk', 15, 2, 'restaurant', NULL),
        ('bike', 15, 2, 'restaurant', NULL),
        ('walk', 15, 1, 'grocery',    NULL)
    ) AS t(mode_config, T, X, class_b, B)
  `);

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE mm_config AS
    SELECT
      1.00::DOUBLE AS c_unlock,
      0.25::DOUBLE AS c_min
  `);

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE weights AS
    SELECT *
    FROM (
      VALUES
        ('restaurant', 1.0),
        ('grocery', 1.0)
    ) AS t(class_b, weight)
  `);
}