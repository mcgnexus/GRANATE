# Sintaxis de búsqueda

Obsidian registra operadores en un mapa (`app.js`, offset ~1.469.742):

| Operador | Significado |
|---|---|
| `match-case` / `ignore-case` | Sensibilidad a mayúsculas |
| `path:` | Ruta del archivo |
| `file:` | Nombre del archivo |
| `content:` | Contenido |
| `line:` | Línea |
| `block:` | Bloque |
| `section:` | Sección |
| `task:` | Tareas |
| `task-todo` / `task-done` | Estado de tarea |

GRANATE implementa el subconjunto con sentido en servidor:

- Texto libre → `websearch_to_tsquery('spanish', …)`.
- `path:` y `file:` → búsqueda por ruta/título con trigram.
- `tag:` / panel de etiquetas → filtro SQL por `tags`.
- `content:` → full-text sobre el cuerpo.
- Búsqueda semántica → embeddings de Gemini + `pgvector` (si hay clave).

La sintaxis exacta de Obsidian (`line:`, `block:`, `section:`, `task:`) se puede añadir en el
parser sin cambiar el esquema. Hoy `line:`/`block:` se tratan como texto.

## Ranking

1. `ts_rank` de Postgres para full-text.
2. Similitud coseno para semántica.
3. Fusión por orden (RRF simplificado): los resultados de texto mandan y la semántica rellena.

## Índices

- `notes_fts_idx`: GIN sobre `to_tsvector('spanish', title || ' ' || content)`.
- `notes_path_trgm_idx`, `notes_title_trgm_idx`: GIN trigram.
- `chunks_embedding_idx`: HNSW con `vector_cosine_ops`.
