import YAML from "yaml";

export type BaseNote = {
  id: string;
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
};

export type BaseView = {
  type: "table" | "cards" | "list" | string;
  name: string;
  filters?: FilterExpr;
  order?: string[];
  sort?: Array<{ property: string; direction: "ASC" | "DESC" }>;
  groupBy?: { property: string };
  limit?: number;
};

export type FilterExpr =
  | string
  | { and: FilterExpr[] }
  | { or: FilterExpr[] }
  | { not: FilterExpr };

export type ParsedBase = {
  filters: FilterExpr | null;
  views: BaseView[];
  formulas: Record<string, string>;
  raw: string;
};

export function parseBase(raw: string): ParsedBase {
  let data: Record<string, unknown> = {};
  try {
    const parsed = YAML.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn("[GRANATE] .base YAML inválido", error);
  }

  const rawViews = Array.isArray(data.views) ? data.views : [];
  const views: BaseView[] = rawViews.map((view, index) => {
    const v = (view ?? {}) as Record<string, unknown>;
    return {
      type: String(v.type ?? "table"),
      name: String(v.name ?? `Vista ${index + 1}`),
      filters: (v.filters as FilterExpr) ?? undefined,
      order: Array.isArray(v.order) ? v.order.map(String) : undefined,
      sort: normalizeSort(v.sort),
      groupBy:
        v.groupBy && typeof v.groupBy === "object"
          ? { property: String((v.groupBy as Record<string, unknown>).property ?? "") }
          : undefined,
      limit: typeof v.limit === "number" ? v.limit : undefined,
    };
  });

  return {
    filters: (data.filters as FilterExpr) ?? null,
    views: views.length ? views : [{ type: "table", name: "Tabla" }],
    formulas: (data.formulas as Record<string, string>) ?? {},
    raw,
  };
}

function normalizeSort(value: unknown): BaseView["sort"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (typeof item === "string") {
        const desc = item.startsWith("-");
        return { property: item.replace(/^-/, ""), direction: desc ? ("DESC" as const) : ("ASC" as const) };
      }
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        return {
          property: String(row.property ?? row.by ?? ""),
          direction: String(row.direction ?? "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC",
        };
      }
      return null;
    })
    .filter((item): item is { property: string; direction: "ASC" | "DESC" } => Boolean(item?.property));
}

function getProperty(note: BaseNote, property: string): unknown {
  const key = property.replace(/^note\./, "").replace(/^file\./, "");
  if (property === "file.name" || property === "file.path" || property === "file.link") {
    return property === "file.path" ? note.path : note.path.split("/").pop()?.replace(/\.md$/, "");
  }
  if (property === "file.tags" || property === "note.tags") return note.tags;
  if (property === "file.mtime") return undefined;
  if (key === "title") return note.title;
  return note.frontmatter[key];
}

function parseLiteral(raw: string): unknown {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function compare(left: unknown, op: string, right: unknown): boolean {
  if (op === "contains") {
    if (Array.isArray(left)) return left.map(String).includes(String(right));
    return String(left ?? "").toLowerCase().includes(String(right).toLowerCase());
  }
  if (op === "==" || op === "=") {
    if (Array.isArray(left) && Array.isArray(right)) return right.every((v) => left.map(String).includes(String(v)));
    return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
  }
  if (op === "!=") return !compare(left, "==", right);
  const a = Number(left);
  const b = Number(right);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    const sa = String(left ?? "");
    const sb = String(right ?? "");
    if (op === ">") return sa > sb;
    if (op === "<") return sa < sb;
    if (op === ">=") return sa >= sb;
    if (op === "<=") return sa <= sb;
    return false;
  }
  if (op === ">") return a > b;
  if (op === "<") return a < b;
  if (op === ">=") return a >= b;
  if (op === "<=") return a <= b;
  return false;
}

export function evaluateFilter(expr: FilterExpr | null | undefined, note: BaseNote): boolean {
  if (!expr) return true;

  if (typeof expr === "string") {
    return evaluateExpression(expr, note);
  }
  if ("and" in expr) return expr.and.every((item) => evaluateFilter(item, note));
  if ("or" in expr) return expr.or.some((item) => evaluateFilter(item, note));
  if ("not" in expr) return !evaluateFilter(expr.not, note);
  return true;
}

function evaluateExpression(expression: string, note: BaseNote): boolean {
  const trimmed = expression.trim();
  if (trimmed.startsWith("!")) return !evaluateExpression(trimmed.slice(1), note);

  const fnMatch = /^(file|note)\.([a-zA-Z]+)\((.+)\)$/.exec(trimmed);
  if (fnMatch) {
    const fn = fnMatch[2];
    const args = fnMatch[3].split(",").map((arg) => String(parseLiteral(arg)));
    if (fn === "inFolder") {
      const folder = args[0].replace(/^["']|["']$/g, "").replace(/\/$/, "");
      return folder === "/" || note.path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);
    }
    if (fn === "hasTag") {
      const tag = args[0].replace(/^#/, "").toLowerCase();
      return note.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().startsWith(`${tag}/`));
    }
    if (fn === "hasProperty") {
      const prop = args[0];
      return Object.prototype.hasOwnProperty.call(note.frontmatter, prop);
    }
    if (fn === "hasLink") return true;
  }

  const cmp = /^(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/.exec(trimmed);
  if (cmp) {
    const property = cmp[1].trim();
    const op = cmp[2];
    const right = parseLiteral(cmp[3]);
    return compare(getProperty(note, property), op, right);
  }

  return true;
}

export type BaseRow = {
  id: string;
  path: string;
  title: string;
  values: Record<string, unknown>;
};

export type BaseResult = {
  view: BaseView;
  columns: string[];
  rows: BaseRow[];
  groups: Array<{ key: string; rows: BaseRow[] }> | null;
};

export function evaluateBase(
  base: ParsedBase,
  notes: BaseNote[],
  viewName?: string,
): BaseResult {
  const view = base.views.find((item) => item.name === viewName) ?? base.views[0] ?? {
    type: "table",
    name: "Tabla",
  };

  const filtered = notes.filter(
    (note) => evaluateFilter(base.filters, note) && evaluateFilter(view.filters, note),
  );

  const columns = view.order?.length
    ? view.order
    : Array.from(
        new Set(
          filtered.flatMap((note) => Object.keys(note.frontmatter).map((key) => `note.${key}`)),
        ),
      ).slice(0, 8);

  const sort = view.sort ?? [];
  const sorted = [...filtered].sort((a, b) => {
    for (const item of sort) {
      const av = getProperty(a, item.property);
      const bv = getProperty(b, item.property);
      if (av === bv) continue;
      const result = compare(av, ">", bv) ? 1 : -1;
      return item.direction === "DESC" ? -result : result;
    }
    return a.path.localeCompare(b.path, "es");
  });

  const limited = view.limit ? sorted.slice(0, view.limit) : sorted;

  const rows: BaseRow[] = limited.map((note) => {
    const values: Record<string, unknown> = {};
    for (const column of columns) values[column] = getProperty(note, column);
    return { id: note.id, path: note.path, title: note.title, values };
  });

  const groupProperty = view.groupBy?.property;
  const groups = groupProperty
    ? Object.entries(
        rows.reduce<Record<string, BaseRow[]>>((acc, row) => {
          const key = String(getProperty(
            { id: row.id, path: row.path, title: row.title, frontmatter: {}, tags: [] } as BaseNote,
            groupProperty,
          ) ?? row.values[groupProperty] ?? "Sin valor");
          (acc[key] ??= []).push(row);
          return acc;
        }, {}),
      ).map(([key, groupRows]) => ({ key, rows: groupRows }))
    : null;

  return { view, columns, rows, groups };
}

export function columnLabel(property: string): string {
  return property
    .replace(/^note\./, "")
    .replace(/^file\./, "")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}
