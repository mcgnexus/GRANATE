import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");

  const sql = await readFile(new URL("../drizzle/0000_init.sql", import.meta.url), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(sql);
    const result = await client.query(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    console.log(`✔ Esquema aplicado. ${result.rowCount} tablas:`);
    console.log(result.rows.map((row) => row.tablename).join(", "));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
