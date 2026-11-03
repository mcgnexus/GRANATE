# Ingeniería inversa con REA

## Objetivo

Entender los formatos y comportamientos observables de Obsidian 1.14.5 para que GRANATE pueda
importar y exportar bóvedas sin pérdida, y replicar la resolución de enlaces, búsqueda, Canvas y
Bases. No se ha copiado código propietario ni se ha redistribuido ningún derivado.

## Artefacto

| Dato | Valor |
|---|---|
| App | Obsidian 1.14.5 |
| Ejecutable | `C:\Program Files\Obsidian\Obsidian.exe` (239.528.720 bytes) |
| Wrapper Electron | `resources/app.asar` (480.128 bytes) |
| Aplicación real | `resources/obsidian.asar` (28.177.896 bytes) |
| SHA-256 de `obsidian.asar` | `3a349274f789b62c5b35ad19de10311909a94e8783033569c2210a4bac491780` |
| Entradas del ASAR | 398 (370 archivos, 28 directorios) |

La app está empaquetada y minificada (`app.js`, 3.942.126 bytes). El análisis AST completo superó
el presupuesto de 300 s del proveedor (`provider_timeout`), así que se combinó:

1. Inspección neutral del artefacto y extracción controlada con REA.
2. Lectura dirigida de `app.js` por offsets sobre cadenas y estructuras.
3. Contraste con la bóveda real del usuario.

## Evidencia REA

| Operación | Evidence ID |
|---|---|
| `analyze_javascript_application` (timeout con observación parcial) | `ev_8f0a0b135d3900abdd49c67ab9409710a8b4440884024423319f6d97e89803fb` |
| `open_binary` + `inspect_artifact` (inventario ASAR) | `ev_5806346102bcc269e6e16ed915db3d95f1979e4703738ca2fa3ab1ebf02af810` |
| Inventario de miembros | `ev_6a579f2cab808e08265d6b4330b3536bb57dfabba0ca27fd6d0a7d52d7de6355` |
| `extract_artifact` (370 archivos a directorio temporal) | `ev_fe8cea9d91aa03f1eaa4cd190db9481ef21032c5f7175f79b519a66fb622c610` |

## Hallazgos (observados)

| Tema | Evidencia | Offset |
|---|---|---|
| Resolución de enlaces | `metadataCache.getFirstLinkpathDest(path, sourcePath)` | 1.572.427 |
| Tokenizador de frontmatter `---` | parser micromark propio | 763.007 |
| Estado de UI escritorio | `workspace.json`, `workspace-mobile.json` | 2.880.435 |
| Config core | `core-plugins.json`, `app.json`, `appearance.json`, `hotkeys.json` | 3.708.282 |
| Canvas: nodos/aristas | `fromNode`, `fromSide`, `toNode`, `toSide`, `fromEnd`, `toEnd` | 3.316.078 / 3.401.992 |
| Canvas: portapapeles | MIME `obsidian/canvas` | 3.332.158 |
| Bases: funciones | `file.inFolder`, `file.hasTag`, `file.hasProperty` | 2.238.611 |
| Bases: vistas | `getViewConfig`, `views`, `filters`, `formulas` | 2.355.082 |
| Bases: filtros lógicos | claves `and`, `or`, `not` | 2.356.878 |
| Búsqueda | `match-case`, `ignore-case`, `path`, `file`, `content`, `line`, `block`, `section`, `task` | 1.469.742 |
| Propiedades especiales | `aliases`, `cssclasses`, `tags` | 1.767.973 |
| Fechas YAML | `YYYY-MM-DD`, `YYYY-MM-DD[T]HH:mm[:ss]` | 1.767.973 |
| Sync (contexto) | resolución de conflictos `(Conflicted copy)` | 3.757.852 |

## Inferencias

- La búsqueda de Obsidian es un motor propio con operadores; GRANATE implementa el subconjunto
  útil en SQL y deja el resto documentado.
- `getFirstLinkpathDest` resuelve por ruta/nombre/alias, con desempate por ruta más corta. La
  réplica en `src/lib/markdown/links.ts` coincide con los casos probados en la bóveda real.
- El archivo `.base` es YAML con `filters`, `views`, `formulas` y `summaries`; el parser de
  GRANATE cubre filtros y vistas, no fórmulas.

## Incógnitas / no cubierto

- No se ejecutó Obsidian ni se instrumentó su runtime; no hay observación dinámica.
- No se analizó el protocolo de Obsidian Sync (E2EE) ni se intentó descifrar contenido.
- El conjunto completo de funciones de Bases y su gramática de fórmulas no se ha mapeado.
- El comportamiento exacto de plugins de comunidad no forma parte de este trabajo.
- La licencia/EULA de Obsidian puede restringir usos distintos de la interoperabilidad; revisa
  las condiciones antes de distribuir derivados.

## Cómo reproducir

```bash
rea --version
# La CLI de REA puede analizar el ASAR directamente:
npx -y rea-agents@6.8.0 analyze-javascript-application \
  "C:/Program Files/Obsidian/resources/obsidian.asar" --json
```

El análisis completo requiere más de 300 s; para iterar es mejor extraer y seleccionar
`source_paths` o inspeccionar por offsets como se hizo aquí.
