# Canvas y Bases

## JSON Canvas

Formato abierto. Campos observados en el bundle (offsets ~3.316.078 y ~3.401.992):

```json
{
  "nodes": [
    {
      "id": "n1",
      "type": "text | file | group | link",
      "x": 0,
      "y": 0,
      "width": 240,
      "height": 120,
      "color": "1",
      "text": "contenido",
      "file": "Carpeta/Nota.md",
      "subpath": "#seccion",
      "url": "https://..."
    }
  ],
  "edges": [
    {
      "id": "e1",
      "fromNode": "n1",
      "fromSide": "right",
      "fromEnd": "none",
      "toNode": "n2",
      "toSide": "left",
      "toEnd": "arrow",
      "color": "1",
      "label": "depende de"
    }
  ]
}
```

Observaciones:

- El portapapeles usa el MIME `obsidian/canvas`.
- Al duplicar, se regeneran IDs de nodos y aristas y se remapean `fromNode`/`toNode`.
- Los lados (`fromSide`, `toSide`) se calculan automáticamente si faltan.

GRANATE guarda el documento tal cual en `canvases.data` y lo edita con React Flow. Al guardar
conserva los campos desconocidos de cada nodo (`original`), para no perder datos de Obsidian.

## Bases (subconjunto)

Estructura YAML observada (offsets ~2.190.000–2.370.000):

```yaml
filters:
  and:
    - file.inFolder("10 - TecRural")
    - file.hasTag("sensores")
views:
  - type: table
    name: Pendientes
    order: [file.name, note.status, note.prioridad]
    sort:
      - property: note.prioridad
        direction: DESC
    groupBy:
      property: note.status
formulas:
  dias: "(date(today()) - date(note.inicio)) / 86400000"
```

Implementado en `src/lib/bases.ts`:

- Filtros: `and`, `or`, `not`, `file.inFolder`, `file.hasTag`, `file.hasProperty`,
  comparaciones `== != > < >= <= contains`.
- Vistas: `table`, `cards`, `list` (las dos últimas se muestran como tabla por ahora).
- `order`, `sort`, `groupBy`, `limit`.
- Columnas desde frontmatter (`note.*`) y campos `file.name`, `file.path`, `file.tags`.

No implementado todavía:

- Fórmulas y `summaryFormulas`.
- Vistas de mapa y propiedades calculadas.
- `file.mtime`, `file.ctime`, enlaces salientes como columnas.
- Edición inline de propiedades desde la vista.
