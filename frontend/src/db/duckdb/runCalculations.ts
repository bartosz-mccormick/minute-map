import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

type RawBatchRow = {
  h3_cell: string;
  pop: number;
  class_b: string;
  mode_config: string;
  T: number;
  X: number;
  B: number | null;
  min_travel_time: number | null;
  n_total: number;
  compliance: number;
};

type RawSummaryRow = {
  h3_cell: string;
  pop: number;
  compliance_weighted_avg: number;
};

type CellAmenityModeResult = {
  T: number;
  X: number;
  B: number | null;
  compliance: number | null;
  min_travel_time: number | null;
  n_total: number;
};

type CellResult = {
  h3_cell: string;
  pop: number;
  compliance_weighted_avg: number | null;
  amenities: {
    [class_b: string]: {
      [mode_config: string]: CellAmenityModeResult;
    };
  };
};

export async function runCalculations(
  conn: AsyncDuckDBConnection
): Promise<CellResult[]> {
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch AS
    SELECT *
    FROM get_compliance_batch()
  `);

  const batchResult = await conn.query(`
    SELECT *
    FROM compliance_batch
  `);

  const summaryResult = await conn.query(`
    SELECT *
    FROM get_compliance_summary_by_amenity_batch()
  `);

  const batchRows = batchResult
    .toArray()
    .map((row) => row.toJSON() as RawBatchRow);

  const summaryRows = summaryResult
    .toArray()
    .map((row) => row.toJSON() as RawSummaryRow);

  const summaryByCell = new Map<string, RawSummaryRow>();

  for (const row of summaryRows) {
    summaryByCell.set(row.h3_cell, row);
  }

  const cellsById = new Map<string, CellResult>();

  for (const row of batchRows) {
    const summary = summaryByCell.get(row.h3_cell);

    if (!cellsById.has(row.h3_cell)) {
      cellsById.set(row.h3_cell, {
        h3_cell: row.h3_cell,
        pop: row.pop,
        compliance_weighted_avg:
          summary?.compliance_weighted_avg ?? null,
        amenities: {},
      });
    }

    const cell = cellsById.get(row.h3_cell)!;

    if (!cell.amenities[row.class_b]) {
      cell.amenities[row.class_b] = {};
    }

    cell.amenities[row.class_b][row.mode_config] = {
      T: row.T,
      X: row.X,
      B: row.B,
      compliance: row.compliance,
      min_travel_time: row.min_travel_time,
      n_total: row.n_total,
    };
  }

  const cells = Array.from(cellsById.values());

  console.log("cells", cells);

  return cells;
}