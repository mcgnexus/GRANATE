# GRANATE

Bóveda de notas Markdown tipo Obsidian, en la web, guardada en **Neon Postgres** y desplegable en **Vercel**. Incluye login, importación de bóvedas, wikilinks, backlinks, grafo, búsqueda híbrida, Canvas, Bases, PWA y un LLM que revisa, ordena, resume e indexa tus documentos con citas.

> Estado: MVP funcional. Ver [Limitaciones](#limitaciones-conocidas) antes de usarlo con datos críticos.

## Estado de esta entrega

- Proyecto creado en `C:\Users\Manuel Q\Proyectos\GRANATE`.
- Base de datos **Neon** aprovisionada (proyecto `GRANATE`, Postgres 18) y esquema aplicado.
- `.env.local` ya contiene `DATABASE_URL` y la configuración local (no se versiona).
- Datos demo cargados: usuario **`demo@granate.local` / `granate123`** y bóveda **“Bóveda de ejemplo”**.
- Sin claves de LLM todavía: el chat y las acciones devuelven un 400 controlado; la búsqueda
  funciona por texto. Añade `OPENROUTER_API_KEY` y `GEMINI_API_KEY` en `.env.local` para activarlas.
- Verificado contra Neon real: registro/login, bóvedas, notas, tags, backlinks, renombrado con
  reescritura de enlaces, búsqueda, Bases, Canvas, export ZIP, papelera, CLI e importación de la
  bóveda real de Obsidian (23 notas + adjunto, 0 enlaces sin resolver).

> ⚠️ Antes de abrir el registro al público, borra el usuario demo y pon
> `AUTO_VERIFY_EMAILS=false`. Hoy `ALLOW_OPEN_REGISTRATION=true` y la cuenta demo tiene
> credenciales conocidas.

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
- Autosave con debounce y `Ctrl/Cmd+S`.
- Frontmatter YAML editable como propiedades (se conserva el Markdown original).
- Adjuntos hasta 10 MB (guardados en Postgres como base64 en este MVP).
- Exportación completa a ZIP sin lock-in.

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
```

El token se crea en **Ajustes → Tokens de API**.

## Despliegue en Vercel

1. Sube el repo a GitHub e impórtalo en Vercel.
2. Añade las variables de entorno del apartado anterior (`APP_URL` con el dominio final).
3. Despliega. El framework se detecta automáticamente.
4. Ejecuta `drizzle/0000_init.sql` contra tu base de Neon (una sola vez).

Notas para el plan Hobby:

- Funciones de 60 s: el indexado se hace por nota al guardar y el backfill en lotes de 15 desde Ajustes.
- Cron: no se usa en esta versión; añade `vercel.json` cuando quieras mantenimiento nocturno.
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
```

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
cli/                   CLI sin dependencias
drizzle/               SQL de inicialización
docs/                  arquitectura y compatibilidad con Obsidian
tests/                 Vitest
```

## Limitaciones conocidas

1. **Sin sync continuo con Obsidian**: se importa un ZIP y se exporta. El diseño para un agente CLI está documentado en `docs/roadmap.md`.
2. **Adjuntos en Postgres**: válido para bóvedas pequeñas; para >100 MB hay que moverlos a Vercel Blob/S3.
3. **Bases**: subconjunto, sin fórmulas, resúmenes ni vistas de mapa.
4. **Canvas**: edición básica (mover, crear tarjeta, conectar); sin redimensionado avanzado ni colores por nodo.
5. **PWA**: shell offline; las notas requieren conexión salvo que se añada caché IndexedDB (v1.1).
6. **Embeddings**: Gemini a 1536 dimensiones; cambiar de modelo exige reindexar.
7. **PDF/Word**: no se indexan; solo Markdown.

## Roadmap

- v1.1: fórmulas de Bases, historial visual de versiones, caché offline de notas, adjuntos en Blob.
- v1.2: agente CLI de sync bidireccional con detección de conflictos.
- v1.3: MCP server para consultar la bóveda desde OpenCode/Claude, comentarios y colaboración en tiempo real.

## Licencia

Código propio. La ingeniería inversa de Obsidian se usó solo para interoperabilidad de formatos; no se incluye código propietario.
