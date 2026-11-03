# Compatibilidad con Obsidian

Documento basado en la observación del artefacto instalado (Obsidian 1.14.5) y en la bóveda real
de `C:\Users\Manuel Q\Documents\Obsidian Vault`. Ver `docs/REA.md` para la evidencia y sus límites.

## Estructura de una bóveda

```
Mi bóveda/
├── .obsidian/
│   ├── app.json               # alwaysUpdateLinks, pdfExportSettings
│   ├── appearance.json        # cssTheme, temas, snippets
│   ├── core-plugins.json      # plugins core activos
│   ├── community-plugins.json # plugins de comunidad
│   ├── workspace.json         # disposición de la UI de escritorio
│   ├── workspace-mobile.json  # disposición móvil
│   ├── graph.json             # ajustes del grafo
│   ├── hotkeys.json
│   ├── types.json             # tipos de propiedades
│   ├── themes/<tema>/theme.css
│   └── plugins/<id>/{main.js,manifest.json,data.json,styles.css}
├── 10 - TecRural/
├── 90 - Adjuntos/
└── Bienvenido.md
```

Observaciones:

- `workspace.json` y `workspace-mobile.json` se gestionan por separado (offset 2.880.435).
- Los archivos de configuración se clasifican por nombre y ruta; `core-plugins.json` tiene un
  arreglo especial en la rutina de sync (`patchCorePluginsFile`).
- Las carpetas y notas se identifican por ruta con `/`, no por ID. La comparación es
  insensible a mayúsculas en Windows.
- Los archivos ignorados incluyen `node_modules`, dotfiles y `__MACOSX`.

### Importación en GRANATE

`src/lib/import-export.ts` recorre el ZIP:

1. `.md` → notas (se conserva el contenido íntegro, incluido el frontmatter).
2. `.canvas` → tabla `canvases` (JSON Canvas).
3. `.base` → tabla `bases` (YAML en bruto + parseado).
4. resto → adjuntos (máx. 10 MB cada uno).
5. `.obsidian/`, `.git/` y basura del sistema se omiten.
6. Segunda pasada de resolución de enlaces para que los wikilinks entre notas recién importadas
   queden resueltos.

## Frontmatter

Obsidian usa un tokenizador propio de Markdown que reconoce `---` al inicio del documento
(offset 763.007). En GRANATE usamos `yaml` y conservamos el cuerpo sin normalizar, para que el
round-trip sea fiel.

Propiedades especiales observadas:

- `aliases` (texto o lista)
- `cssclasses` (multitexto)
- `tags` (lista o cadena separada por comas/espacios)
- Fechas: `YYYY-MM-DD` se infiere como `date`; `YYYY-MM-DD[T]HH:mm[:ss]` como `datetime`
  (regex en offset 1.767.973).

GRANATE extrae `tags`, `aliases` y muestra el resto de propiedades como metadatos. No reescribe
el YAML salvo que el usuario edite la nota.

## Notas y adjuntos

- El nombre del archivo es el título visible; `frontmatter.title` no sustituye al nombre en el
  explorador.
- Los enlaces a adjuntos usan `![[archivo.png]]`; en la web se traducen a
  `/api/v1/vaults/<id>/attachments?path=...`.
- Los enlaces a bloques (`^id`) y a secciones (`#Encabezado`) se conservan en el texto y se
  muestran como parte del enlace; el salto a sección queda para v1.1.

## Diferencias deliberadas

| Obsidian | GRANATE |
|---|---|
| Almacenamiento local | Postgres (Neon) |
| Sync E2EE propietario | Import/export ZIP (sync vía CLI en roadmap) |
| Plugins de comunidad | API y CLI propios; sin runtime de plugins |
| Bases completo | Subconjunto de vistas y filtros |
| Editor live preview | Código + vista previa separada (live preview en v1.1) |
