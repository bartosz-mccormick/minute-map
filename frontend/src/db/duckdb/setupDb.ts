import * as duckdb from "@duckdb/duckdb-wasm";
import type { DuckDbClient } from "./createDuckDb";

import getComplianceBatchSql from "../sql/get-compliance-batch.sql?raw";
import getComplianceBatchSummarySql from "../sql/get-compliance-batch-summary.sql?raw";

let complianceDatabaseIsSetup = false;

export async function setupDb(
  client: DuckDbClient
): Promise<void> {
  if (complianceDatabaseIsSetup) {
    return;
  }

  const { db, conn } = client;

  await db.registerFileURL(
    "grid.parquet",
    "/data/grid.parquet",
    duckdb.DuckDBDataProtocol.HTTP,
    false
  );

  await db.registerFileURL(
    "grid_access.parquet",
    "/data/grid_access.parquet",
    duckdb.DuckDBDataProtocol.HTTP,
    false
  );

  await conn.query(`
    CREATE OR REPLACE VIEW grid_src AS
    SELECT *
    FROM read_parquet('grid.parquet')
  `);

  await conn.query(`
    CREATE OR REPLACE VIEW grid_access_src AS
    SELECT *
    FROM read_parquet('grid_access.parquet')
  `);


  // need to create placeholder tables for macros to get initialized properly

  await conn.query(`
    CREATE OR REPLACE TEMP TABLE req (
      mode_config TEXT,
      T INTEGER,
      X INTEGER,
      class_b TEXT,
      B DOUBLE
    )
  `);
  
  
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE mm_config (
      c_unlock DOUBLE,
      c_min DOUBLE
    )
  `);
  
  
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE weights (
      class_b TEXT,
      weight DOUBLE
    )
  `);
  
  
  await conn.query(`
    CREATE OR REPLACE TEMP TABLE compliance_batch (
      h3_cell TEXT,
      pop DOUBLE,
      class_b TEXT,
      mode_config TEXT,
      T INTEGER,
      X INTEGER,
      B DOUBLE,
      min_travel_time DOUBLE,
      n_total DOUBLE,
      compliance DOUBLE
    )
  `);

  await conn.query(getComplianceBatchSql);


  await conn.query(getComplianceBatchSummarySql);

  complianceDatabaseIsSetup = true;
}