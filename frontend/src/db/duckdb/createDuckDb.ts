import * as duckdb from "@duckdb/duckdb-wasm";

import duckdbWasmMvp from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbWorkerMvp from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";

import duckdbWasmEh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbWorkerEh from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

export type DuckDbClient = {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
};

let cachedClient: DuckDbClient | null = null;

async function createDuckDbClient(): Promise<DuckDbClient> {
  const bundles: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: duckdbWasmMvp,
      mainWorker: duckdbWorkerMvp,
    },
    eh: {
      mainModule: duckdbWasmEh,
      mainWorker: duckdbWorkerEh,
    },
  };

  const bundle = await duckdb.selectBundle(bundles);

  if (!bundle.mainWorker) {
    throw new Error("DuckDB-WASM worker bundle could not be selected.");
  }

  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();

  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const conn = await db.connect();

  return { db, conn };
}

export async function createDuckDb(): Promise<DuckDbClient> {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = await createDuckDbClient();

  return cachedClient;
}

export async function createIsolatedDuckDb(): Promise<DuckDbClient> {
  return createDuckDbClient();
}

// test duckdb connection
export async function testDuckDb(): Promise<void> {
    const { conn } = await createDuckDb();
  
    const result = await conn.query("SELECT 1 AS ok");
  
    const rows = result.toArray().map((row) => row.toJSON());
  
    console.log(rows);
  }
