# Arquitectura

```
┌──────────────────────────── Vercel ────────────────────────────┐
│  Next.js 16 (App Router)                                        │
│  ├── Server Components: auth, lista de bóvedas                  │
│  ├── Client Workspace: árbol, editor, paneles, canvas, bases    │
│  └── Route Handlers /api/v1/*  ← web, CLI y clientes            │
│         │                                                       │
│         ├── Drizzle ORM ──────────────► Neon Postgres           │
│         │     ├── notas, enlaces, tags, versiones               │
│         │     ├── pgvector (embeddings 1536) + HNSW             │
│         │     └── FTS español + pg_trgm                         │
│         │                                                       │
│         ├── OpenRouter (chat + acciones, SSE)                   │
│         └── Gemini (embeddings, batch)                          │
└─────────────────────────────────────────────────────────────────┘
```

## Decisiones

### Postgres como fuente de verdad

El Markdown se guarda tal cual en `notes.content`; `frontmatter` es una caché parseada para
consultas y UI. Esto permite round-trip fiel y exportación sin pérdida. No hay CRDT en v1: el
autosave es last-write-wins por nota.

### Autorización

`vault_members` define el rol. Toda ruta llama a `withVault` (API) o `getVaultAccess` (Server
Component). No hay RLS de Postgres en v1 porque toda la app pasa por el servidor; si se abre un
cliente directo a la base, añadir RLS es obligatorio.

### Búsqueda

Dos índices independientes:

- `notes_fts_idx` (expresión GIN con `to_tsvector('spanish', …)`).
- `chunks_embedding_idx` (HNSW, coseno).

La fusión es por orden: full-text primero y semántica como relleno. Para consultas sin clave de
Gemini, el chat cae a full-text y luego a las notas más recientes.

### Indexado

- Al guardar: `after()` ejecuta `indexNote` fuera de la respuesta.
- Manual: Ajustes → Reindexar 15 notas.
- Sin clave de embeddings: se omite silenciosamente y la búsqueda sigue funcionando por texto.
- Chunking por encabezados, máximo 6.000 caracteres y solape de 400.

### LLM

- `retrieveContext` construye bloques numerados y citas.
- El prompt de sistema delimita el contexto como datos y prohíbe seguirlo como instrucciones.
- Las acciones que reescriben devuelven texto y la UI muestra original vs propuesta; solo se
  aplica con confirmación.
- `usage_quotas` + `llm_runs` limitan y auditan el gasto.

### CLI

La CLI usa los mismos endpoints con `Authorization: Bearer <api_token>`. El token se almacena
hasheado en `api_tokens` y es revocable. Esto deja la puerta abierta a un agente de sync futuro.

## Esquema (resumen)

```
users ─┬─ sessions
       ├─ api_tokens
       ├─ oauth_accounts
       ├─ vault_members ─ vaults ─┬─ folders
       │                          ├─ notes ─┬─ note_versions
       │                          │         ├─ links
       │                          │         ├─ note_tags ─ tags
       │                          │         └─ note_chunks
       │                          ├─ attachments
       │                          ├─ canvases
       │                          └─ bases
       ├─ llm_runs
       └─ usage_quotas
```

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Prompt injection en notas | contexto delimitado, sin tool calls, aplicar solo con confirmación |
| Coste LLM | cuota diaria, modelo barato, límite de tokens, registro de uso |
| Hobby 60 s | indexado por nota y backfill por lotes |
| Neon free 0,5 GB | adjuntos pequeños; mover a Blob en v1.1 |
| Duplicados de ruta | índice único `lower(path)` por bóveda |
| Pérdida de datos al importar | `note_versions`, export ZIP, import idempotente por ruta |
