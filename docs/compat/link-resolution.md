# Resolución de enlaces

La pieza central observada es `metadataCache.getFirstLinkpathDest(path, sourcePath)` en
`app.js` (offset ~1.572.427). GRANATE replica su precedencia en `src/lib/markdown/links.ts`.

## Sintaxis soportada

```
[[Nota]]
[[Carpeta/Nota]]
[[Nota#Encabezado]]
[[Nota#Encabezado|texto visible]]
[[Nota|texto visible]]
![[Nota]]            # embed de nota
![[imagen.png]]      # embed de adjunto
[texto](Carpeta/Nota.md#encabezado)
```

## Precedencia de resolución

1. **Ruta exacta** (sin extensión, insensible a mayúsculas).
2. **Sufijo de ruta**: `Nota` casa con `Carpeta/Nota.md`; gana la ruta más corta.
3. **Nombre de archivo único**; si hay varios, se prefiere el de la misma carpeta y después el
   de menor profundidad.
4. **Alias** declarado en `frontmatter.aliases`.
5. Sin coincidencia → enlace no resuelto (se muestra, y al hacer clic se ofrece crear la nota,
   igual que Obsidian).

## Renombrado

`app.json` de la bóveda observada tiene `alwaysUpdateLinks: true`. Al renombrar una nota,
GRANATE:

1. Actualiza `notes.path`.
2. Recorre las notas de la bóveda y reescribe los wikilinks que resolvían al destino anterior,
   conservando `#encabezado` y `|alias`.
3. Recalcula `links` y `tags` de las notas afectadas.

Limitación: los enlaces Markdown `[texto](ruta.md)` no se reescriben automáticamente en v1.

## Backlinks

Tabla `links` con:

- `source_note_id`, `raw_target`, `target_path`, `target_note_id`
- `kind` (`wikilink`, `embed`, `markdown`)
- `heading`, `alias`, `resolved`

Los backlinks se consultan por `target_note_id`; los enlaces no resueltos también se guardan para
poder ofrecer su creación.
