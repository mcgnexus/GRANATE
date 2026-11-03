import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __granateDb?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no está configurada. Copia .env.example a .env.local y pega la cadena de conexión de Neon.",
    );
  }
  return drizzle(neon(url), { schema });
}

/** Lazy singleton so `next build` does not need a live database. */
export function getDb(): Db {
  if (!globalForDb.__granateDb) globalForDb.__granateDb = createDb();
  return globalForDb.__granateDb;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
