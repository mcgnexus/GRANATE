import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { users, vaultMembers, vaults } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";

type Args = { email?: string; password?: string; name?: string };

function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") args.email = argv[++i];
    else if (arg === "--password") args.password = argv[++i];
    else if (arg === "--name") args.name = argv[++i];
  }
  return args;
}

function validate(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email no válido");
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("La contraseña debe incluir al menos una letra y un número");
  }
}

async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("Sin terminal interactiva: usa --password o define la contraseña al ejecutar");
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelado"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (char >= " ") {
          value += char;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

async function main() {
  const args = parseArgs();
  const email = (args.email ?? (await ask("Email: "))).trim().toLowerCase();
  const password =
    args.password ??
    (await askHidden("Contraseña (mín. 8, letra y número): ")) ??
    "";
  const confirmation = args.password ? password : await askHidden("Repite la contraseña: ");

  if (password !== confirmation) throw new Error("Las contraseñas no coinciden");
  validate(email, password);

  const name = (args.name ?? email.split("@")[0]).trim();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    await db
      .update(users)
      .set({
        name,
        passwordHash: hashPassword(password),
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(sql`${users.id} = ${userId}`);
    console.log(`✔ Contraseña actualizada para ${email}`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash: hashPassword(password),
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = created.id;
    console.log(`✔ Cuenta creada: ${email}`);
  }

  const owned = await db
    .select({ id: vaults.id, name: vaults.name })
    .from(vaults)
    .where(sql`${vaults.ownerId} = ${userId}`)
    .limit(1);

  if (!owned[0]) {
    const [vault] = await db
      .insert(vaults)
      .values({ ownerId: userId, name: "Mi bóveda", slug: "mi-boveda" })
      .returning({ id: vaults.id, name: vaults.name });
    await db
      .insert(vaultMembers)
      .values({ vaultId: vault.id, userId, role: "owner" })
      .onConflictDoNothing();
    console.log(`✔ Bóveda creada: ${vault.name}`);
  } else {
    console.log(`· Bóveda existente: ${owned[0].name}`);
  }

  console.log("\nYa puedes entrar en /login con ese email y contraseña.");
}

async function ask(question: string): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
