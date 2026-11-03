# GRANATE

Bóveda de notas Markdown tipo Obsidian, en la web, guardada en **Neon Postgres** y desplegable en **Vercel**. Incluye login, importación de bóvedas, wikilinks, backlinks, grafo, búsqueda híbrida, Canvas, Bases, PWA y un LLM que revisa, ordena, resume e indexa tus documentos con citas.

> Estado: MVP funcional. Ver [Limitaciones](#limitaciones-conocidas) antes de usarlo con datos críticos.

## Estado de esta entrega

- Proyecto creado en `C:\Users\Manuel Q\Proyectos\GRANATE`.
- Base de datos **Neon** aprovisionada (proyecto `GRANATE`, Postgres 18) y esquema aplicado.
- `.env.local` ya contiene `DATABASE_URL` y la configuración local (no se versiona).
- **Registro abierto con email y contraseña** (`ALLOW_OPEN_REGISTRATION=true`). La cuenta del
  propietario ya está creada, con la bóveda **“Mi bóveda”**. La contraseña no se guarda en el
  repositorio ni en la documentación.
- `npm run user:create` sigue disponible para crear cuentas o resetear contraseñas desde el servidor.
- Sin claves de LLM todavía: el chat y las acciones devuelven un 400 controlado; la búsqueda
  funciona por texto. Añade `OPENROUTER_API_KEY` y `GEMINI_API_KEY` en `.env.local` para activarlas.
- Verificado contra Neon real: registro/login, bóvedas, notas, tags, backlinks, renombrado con
  reescritura de enlaces, búsqueda, Bases, Canvas, export ZIP, papelera, CLI e importación de la
  bóveda real de Obsidian (23 notas + adjunto, 0 enlaces sin resolver).

## Despliegue actual

- **URL de producción:** https://granate-five.vercel.app
- **Proyecto Vercel:** `manuel-carrascos-projects/granate`
- **Repositorio conectado:** cada push a `main` lanza un despliegue de producción.
- Variables configuradas en Vercel (entorno Production): `DATABASE_URL`, `APP_URL`,
  `ALLOW_OPEN_REGISTRATION`, `AUTO_VERIFY_EMAILS`, `OPENROUTER_MODEL`,
  `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `DAILY_TOKEN_QUOTA` y `EMAIL_FROM`.
- Las claves `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID/SECRET` y `RESEND_API_KEY`
  aún no están configuradas; añádelas en Vercel y redespliega para activar chat, embeddings,
  Google y verificación de email.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Estilo | Tailwind CSS 4 + variables CSS (tema claro/oscuro) |
| Base de datos | Neon Postgres + Drizzle ORM (`neon-http`) |
| Auth | Sesiones propias (scrypt + cookie httpOnly) + Google OAuth opcional |
| Editor | CodeMirror 6 (Markdown) + vista previa con React Markdown |
| Búsqueda | Full-text español (`tsvector`) + trigram + pgvector |
| LLM | OpenRouter (chat) + Gemini (embeddings) |
| Canvas | `@xyflow/react` sobre JSON Canvas |
| Grafo | `d3-force` + SVG |
| Móvil | PWA instalable (manifest + service worker) |
| CLI | `cli/granate.mjs` sin dependencias |

## Arranque local

1. Crea un proyecto en [Neon](https://neon.tech) y copia la cadena de conexión.
2. Instala dependencias:

   ```bash
   npm install
   ```

3. Configura el entorno:

   ```bash
   copy .env.example .env.local
   ```

   Rellena al menos `DATABASE_URL`. Para IA, añade `OPENROUTER_API_KEY` y `GEMINI_API_KEY`.

4. Crea el esquema. **Importante:** usa el SQL incluido porque crea `pgvector`, `pg_trgm`, el índice HNSW y el índice full-text:

   ```bash
   psql "$DATABASE_URL" -f drizzle/0000_init.sql
   ```

   Alternativa para iterar en desarrollo: `npm run db:push` (revisa antes que las extensiones existan).

5. Arranca:

   ```bash
   npm run dev
   ```

6. Abre `http://localhost:3000`, crea una cuenta y una bóveda. Si `AUTO_VERIFY_EMAILS=true` no necesitas verificar el email en local.

### Crear o resetear una cuenta

El registro está abierto: cualquiera puede crear una cuenta desde `/register` con email y
contraseña. Además, puedes crear o resetear una cuenta desde la terminal (útil si cierras el
registro o quieres una cuenta verificada sin depender del email):

```powershell
npm run user:create -- --email tu@email.com --name "Tu nombre"
```

Te pedirá la contraseña dos veces sin mostrarla. El script marca el email como verificado y crea
la bóveda **“Mi bóveda”** si todavía no tienes ninguna. Si el usuario ya existe, actualiza su
contraseña.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de Neon con `sslmode=require` |
| `APP_URL` | Sí en prod | URL pública sin barra final |
| `ALLOW_OPEN_REGISTRATION` | No | `true` por defecto |
| `AUTO_VERIFY_EMAILS` | No | `true` en local; en prod usa Resend |
| `GOOGLE_CLIENT_ID/SECRET` | No | Activa el botón de Google |
| `OPENROUTER_API_KEY` | No | Chat y acciones LLM |
| `OPENROUTER_MODEL` | No | Por defecto `google/gemini-2.5-flash` |
| `GEMINI_API_KEY` | No | Embeddings (OpenRouter no los ofrece) |
| `GEMINI_EMBEDDING_MODEL` | No | `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | No | `1536` (compatible con HNSW de pgvector) |
| `DAILY_TOKEN_QUOTA` | No | Límite por usuario y día |
| `BLOB_READ_WRITE_TOKEN` | No | Adjuntos y backups en Vercel Blob; sin él se usa Postgres |
| `CRON_SECRET` | No | Protege `/api/cron/backup` con `Authorization: Bearer` |
| `RESEND_API_KEY` / `EMAIL_FROM` | No | Verificación por email |

### Google OAuth

En Google Cloud Console crea credenciales OAuth 2.0 y añade como redirect URI:

```
https://TU-DOMINIO/api/auth/google/callback
```

En local: `http://localhost:3000/api/auth/google/callback`.

## Funcionalidad

### Bóvedas y notas

- CRUD de bóvedas con roles (`owner`, `editor`, `viewer`).
- Árbol de carpetas y notas, creación, renombrado, papelera e historial de versiones.
- **Carpetas**: botón de nueva carpeta (con anidamiento `Carpeta/Subcarpeta`), **arrastrar notas dentro y fuera** y **menú contextual** (clic derecho o botón ⋯) para renombrar, mover, etiquetar, crear subcarpetas o eliminar.
- **Selección múltiple** (`Ctrl/Cmd+clic`, `Shift+clic` o el botón de selección) para mover, etiquetar o borrar varias notas en lote.
- **Vistas inteligentes**: Favoritos, Recientes, Huérfanas (sin enlaces) y Sin etiquetas.
- Autosave con debounce y `Ctrl/Cmd+S`.
- Frontmatter YAML editable con un formulario de **propiedades** tipadas.
- **Historial visual** con diff línea a línea y restauración de versiones.
- **Plantillas** (`Plantillas/`) y **nota diaria** (`Diario/AAAA-MM-DD.md`) con variables `{{title}}`, `{{date}}`, `{{time}}`.
- **Gestión de etiquetas**: renombrar, fusionar y eliminar en toda la bóveda.
- Adjuntos hasta 10 MB (Vercel Blob si hay token; si no, Postgres) con galería, copia de `![[…]]` y borrado.
- Exportación completa a ZIP y backups manuales/automáticos.

### Wikilinks, backlinks y grafo

- Sintaxis `[[nota]]`, `[[nota#sección|alias]]` y `![[adjunto.png]]`.
- Resolución por ruta, nombre único, alias y ruta más corta (compatible con Obsidian).
- Renombrar una nota reescribe los enlaces entrantes.
- Panel de backlinks, enlaces salientes y grafo global navegable.

### Búsqueda

- Full-text en español con snippets y resaltado.
- Trigram para rutas y títulos.
- Búsqueda semántica con pgvector y embeddings de Gemini (si hay clave).
- Resultados híbridos con ranking combinado.

### LLM

- Chat RAG con streaming y **citas** a las notas fuente.
- Acciones por nota: revisar, resumir, reorganizar, sugerir etiquetas, crear MOC y notas relacionadas.
- Las acciones que reescriben muestran un **diff antes/después** y solo se aplican si lo confirmas.
- Cuota diaria por usuario + registro de uso en `llm_runs` y `usage_quotas`.
- Las notas se delimitan como datos no confiables para resistir prompt injection.

### Canvas y Bases

- Canvas en el formato abierto **JSON Canvas** (`nodes`, `edges`, `fromNode`, `fromSide`, etc.) renderizado con React Flow.
- Bases: subconjunto funcional de `.base` (YAML) con vistas tabla/cards, filtros `and/or`, `file.inFolder`, `file.hasTag`, `file.hasProperty`, comparaciones, orden y agrupación. Fórmulas avanzadas quedan para v1.1.

### CLI

```bash
cd cli
npm link            # o npm i -g .

granate login --url https://tu-app.vercel.app --token <token>
granate vaults
granate ls
granate search "sensor de humedad"
granate get "10 - TecRural/Guia.md"
granate ask "¿qué decisiones pendientes hay?"
granate export boveda.zip
granate sync ~/Obsidian/MiBoveda --vault <id> --dry-run
granate sync ~/Obsidian/MiBoveda --vault <id>
```

El token se crea en **Ajustes → Tokens de API**. `sync` es bidireccional, guarda un
manifiesto `.granate-sync.json` y ante cambios en ambos lados crea
`nombre.conflicto-local-<fecha>.md` antes de traer la versión remota.

### Compartir

Cada nota tiene un botón **Compartir** para crear enlaces públicos de solo lectura con
caducidad opcional. Desde **Ajustes → Compartir bóveda** se crea un índice público de toda la
bóveda. Los enlaces se pueden revocar y no permiten editar ni ver la papelera.

### MCP

`mcp/granate-mcp.mjs` es un servidor MCP stdio sin dependencias con herramientas para listar
bóvedas, buscar, leer, escribir y listar etiquetas. Instrucciones en
[`mcp/README.md`](mcp/README.md).

### Backups

`POST /api/v1/vaults/<id>/backups` crea un ZIP; si `BLOB_READ_WRITE_TOKEN` existe se guarda en
Vercel Blob y, si no, en Postgres (máximo 25 MB). El cron diario de `vercel.json` conserva las
7 últimas copias por bóveda. Protege el endpoint con `CRON_SECRET`.

## Despliegue en Vercel

1. Sube el repo a GitHub e impórtalo en Vercel.
2. Añade las variables de entorno del apartado anterior (`APP_URL` con el dominio final).
3. Despliega. El framework se detecta automáticamente.
4. Ejecuta en orden `drizzle/0000_init.sql`, `drizzle/0001_features.sql` y
   `drizzle/0002_backup_data.sql` contra tu base de Neon (una sola vez cada uno).

Notas para el plan Hobby:

- Funciones de 60 s: el indexado se hace por nota al guardar y el backfill en lotes de 15 desde Ajustes.
- **Cron diario** (`vercel.json`) para backups. Define `CRON_SECRET` y `BLOB_READ_WRITE_TOKEN`
  si quieres almacenamiento externo; sin Blob las copias van a Postgres.
- Límite de cuerpo: 4,5 MB por petición en Hobby. Los ZIP de importación grandes deben dividirse.

## Seguridad

- Contraseñas con `scrypt` (N=16384) y comparación en tiempo constante.
- Sesiones con token aleatorio; solo se guarda su hash SHA-256.
- Cookies `httpOnly`, `SameSite=Lax`, `Secure` en producción.
- Toda consulta pasa por `requireVault`, que valida pertenencia y rol.
- Tokens de API revocables y con último uso registrado.
- Registro abierto + clave de plataforma: activa cuota diaria, verificación de email y considera Turnstile antes de abrirlo al público.
- El contenido de las notas nunca se ejecuta: el LLM solo devuelve texto y nada se aplica sin confirmación.

## Tests

```bash
npm test          # unitarios de frontmatter, enlaces, chunks, bases y canvas
npm run lint
npm run typecheck
BASE_URL=https://granate-five.vercel.app \
  GRANATE_E2E_EMAIL=... GRANATE_E2E_PASSWORD=... npm run test:e2e
```

El workflow `.github/workflows/e2e.yml` ejecuta Playwright contra el preview de Vercel cuando
existen los secretos `GRANATE_E2E_EMAIL` y `GRANATE_E2E_PASSWORD` (y `E2E_BASE_URL` para
ejecuciones manuales). Cada test crea una bóveda temporal y la elimina al terminar.

## Estructura

```
src/
  app/                 páginas y API routes
  components/          UI (auth, workspace, modales)
  lib/
    ai/                embeddings, indexado, LLM, RAG, acciones
    auth/              sesiones, password, API tokens, email
    db/                esquema Drizzle y conexión Neon
    markdown/          frontmatter, enlaces, chunking
    notes.ts           servicio de notas, enlaces y tags
    search.ts          búsqueda híbrida
    bases.ts           parser/evaluador de .base
    canvas.ts          tipos JSON Canvas
    import-export.ts   ZIP de Obsidian
cli/                   CLI sin dependencias (incluye sync bidireccional)
mcp/                   servidor MCP stdio
drizzle/               SQL de inicialización y migraciones
docs/                  arquitectura y compatibilidad con Obsidian
tests/                 Vitest + Playwright (`tests/e2e`)
```

## Limitaciones conocidas

1. **Sync**: el CLI resuelve conflictos con copias locales, pero no hay demonio de sincronización continua ni resolución visual de conflictos.
2. **Arrastrar notas** funciona con ratón/escritorio. En móvil usa el menú ⋯ → **Mover a…**.
3. **Adjuntos**: si no hay Vercel Blob se guardan en Postgres; el límite práctico recomendado es <100 MB por bóveda.
4. **Bases**: subconjunto, sin fórmulas, resúmenes ni vistas de mapa.
5. **Canvas**: edición básica (mover, crear tarjeta, conectar); sin redimensionado avanzado ni colores por nodo.
6. **PWA**: shell offline; las notas requieren conexión salvo que se añada caché IndexedDB.
7. **Embeddings**: Gemini a 1536 dimensiones; cambiar de modelo exige reindexar.
8. **PDF/Word**: no se indexan; solo Markdown.
9. **Blob**: el plan actual de Vercel puede impedir crear un store nuevo; la app funciona con el fallback de Postgres.

## Roadmap

- v1.2: caché offline de notas, resolución visual de conflictos, comentarios y colaboración en tiempo real.
- v1.3: automatizaciones (reglas por etiqueta), vistas de mapa y fórmulas de Bases.

## Licencia

Código propio. La ingeniería inversa de Obsidian se usó solo para interoperabilidad de formatos; no se incluye código propietario.
