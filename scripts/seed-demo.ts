import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { users, vaults, vaultMembers } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { createNote } from "../src/lib/notes";

const DEMO_EMAIL = "demo@granate.local";
const DEMO_PASSWORD = "granate123";

const NOTES: Array<{ path: string; content: string }> = [
  {
    path: "Bienvenido.md",
    content: `---
tags: [inicio, granate]
aliases: [Inicio]
---
# Bienvenido a GRANATE

Esta es una bóveda de ejemplo. Prueba a abrir [[Guía rápida]] o mira el grafo.

- [ ] Importar mi bóveda real
- [ ] Probar la búsqueda semántica
- [ ] Preguntar al LLM sobre mis notas

#inicio
`,
  },
  {
    path: "Guía rápida.md",
    content: `---
tags: [guia]
---
# Guía rápida

## Crear notas
Usa el botón **+** del árbol o \`Ctrl/Cmd+S\` para guardar.

## Enlazar
Escribe \`[[Otra nota]]\` o \`[[Otra nota#Sección|alias]]\`.

## Preguntar
Abre el panel **Preguntar** y haz una pregunta. Verás citas a las notas.

## Importar Obsidian
Sube un ZIP con tus notas y adjuntos. Se conservan rutas, enlaces y frontmatter.
`,
  },
  {
    path: "Proyectos/Sensores.md",
    content: `---
tags: [sensores, riego, hardware]
estado: en-curso
prioridad: 2
---
# Sensores de humedad

Decisión: usar sensor capacitivo DIY por coste y calibración en campo.

## Pendiente
- Comparar con [[AD5933]]
- Medir deriva térmica

#sensores
`,
  },
  {
    path: "Proyectos/AD5933.md",
    content: `---
tags: [hardware, impedancia]
estado: descartado
prioridad: 3
---
# AD5933

Se descartó para la versión de bajo coste por complejidad y consumo.

Relacionado: [[Sensores]].
`,
  },
  {
    path: "Proyectos/Base de proyectos.base",
    content: `filters:
  and:
    - file.inFolder("Proyectos")
views:
  - type: table
    name: Proyectos por estado
    order: [file.name, note.estado, note.prioridad]
    sort:
      - property: note.prioridad
        direction: DESC
    groupBy:
      property: note.estado
`,
  },
];

async function main() {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_EMAIL}`)
    .limit(1);

  let userId = existing[0]?.id;
  if (!userId) {
    const [created] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        name: "Demo",
        passwordHash: hashPassword(DEMO_PASSWORD),
        emailVerifiedAt: new Date(),
      })
      .returning();
    userId = created.id;
    console.log(`✔ Usuario demo creado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } else {
    console.log(`· Usuario demo ya existe: ${DEMO_EMAIL}`);
  }

  const existingVault = await db
    .select({ id: vaults.id })
    .from(vaults)
    .where(sql`${vaults.ownerId} = ${userId} and ${vaults.slug} = 'boveda-de-ejemplo'`)
    .limit(1);

  let vaultId = existingVault[0]?.id;
  if (!vaultId) {
    const [created] = await db
      .insert(vaults)
      .values({ ownerId: userId, name: "Bóveda de ejemplo", slug: "boveda-de-ejemplo" })
      .returning();
    vaultId = created.id;
    await db
      .insert(vaultMembers)
      .values({ vaultId, userId, role: "owner" })
      .onConflictDoNothing();
    console.log("✔ Bóveda de ejemplo creada");
  }

  for (const note of NOTES) {
    const isBase = note.path.endsWith(".base");
    if (isBase) {
      const { bases } = await import("../src/lib/db/schema");
      await db
        .insert(bases)
        .values({ vaultId, path: note.path, raw: note.content })
        .onConflictDoNothing();
      continue;
    }
    await createNote({
      vaultId,
      userId,
      path: note.path,
      content: note.content,
      source: "import",
    });
    console.log(`  · ${note.path}`);
  }

  console.log("\nListo. Entra en /vaults con las credenciales demo.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
