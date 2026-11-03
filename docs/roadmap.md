# Roadmap

## v1.0 (este repo)

- [x] Auth email/contraseña + Google, registro abierto, sesiones y tokens
- [x] Bóvedas multiusuario con roles
- [x] CRUD de notas, autosave, versiones, papelera
- [x] Frontmatter, wikilinks, backlinks, tags, grafo
- [x] Import/export ZIP de Obsidian (notas, adjuntos, canvas, `.base`)
- [x] Búsqueda full-text español + semántica con pgvector
- [x] Chat RAG con streaming y citas
- [x] Acciones LLM con diff y confirmación
- [x] Canvas (JSON Canvas) y Bases (subconjunto)
- [x] CLI y PWA instalable

## v1.1

- Live preview real en CodeMirror (decoraciones inline estilo Obsidian).
- Fórmulas y resúmenes en Bases; vistas cards y mapa.
- Caché offline de notas con IndexedDB y cola de escritura.
- Adjuntos en Vercel Blob con URLs firmadas.
- Historial visual con restauración y diff.
- Búsqueda con operadores `line:`, `block:`, `section:`, `task:` y `path:`.

## v1.2

- Agente CLI de sync bidireccional:
  - manifiesto de hashes,
  - watcher local,
  - detección de conflictos y copia `(Conflicted copy)`,
  - tombstones para borrados.
- Servidor MCP para consultar la bóveda desde OpenCode/Claude.
- Webhooks y jobs programados (Vercel Cron) para reindexado nocturno.

## v1.3

- Colaboración en tiempo real con Yjs/CRDT por nota.
- Comentarios y menciones.
- Plugins/extensiones propias.
- App móvil nativa (Expo) reutilizando `/api/v1`.

## Deuda técnica

- Tests end-to-end con Playwright sobre una bóveda fixture.
- RLS de Postgres si se expone la base a clientes.
- Verificación de email obligatoria y Turnstile para registro público.
- Observabilidad (Sentry/PostHog) y alertas de coste LLM.
- Migraciones versionadas más allá del SQL inicial.
