import { getAliases, type Frontmatter } from "./frontmatter";

export type ParsedLink = {
  rawTarget: string;
  target: string;
  heading: string | null;
  alias: string | null;
  kind: "wikilink" | "embed" | "markdown";
};

const WIKILINK_RE = /(!)?\[\[([^\]\n]+?)\]\]/g;
const MD_LINK_RE = /(!)?\[([^\]\n]*)\]\(([^)\n]+)\)/g;

function splitWikilink(inner: string): ParsedLink | null {
  const pipe = inner.indexOf("|");
  const targetPart = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();
  const hash = targetPart.indexOf("#");
  const target = (hash === -1 ? targetPart : targetPart.slice(0, hash)).trim();
  const heading = hash === -1 ? null : targetPart.slice(hash + 1).trim() || null;
  if (!target) return null;
  return {
    rawTarget: inner,
    target,
    heading,
    alias: alias ?? null,
    kind: "wikilink",
  };
}

export function parseLinks(body: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  let match: RegExpExecArray | null;

  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(body))) {
    const parsed = splitWikilink(match[2]);
    if (parsed) {
      if (match[1]) parsed.kind = "embed";
      links.push(parsed);
    }
  }

  MD_LINK_RE.lastIndex = 0;
  while ((match = MD_LINK_RE.exec(body))) {
    const href = match[3].trim();
    if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) continue;
    if (!/\.md($|[?#])/i.test(href)) continue;
    let decoded = href.split("#")[0];
    try { decoded = decodeURIComponent(decoded); } catch { /* keep raw */ }
    const heading = href.includes("#") ? href.split("#").slice(1).join("#") : null;
    links.push({
      rawTarget: href,
      target: decoded.replace(/^\.\//, ""),
      heading,
      alias: match[2] || null,
      kind: match[1] ? "embed" : "markdown",
    });
  }

  return links;
}

export type ResolvableNote = {
  id: string;
  path: string;
  aliases?: string[];
};

function stripMd(path: string): string {
  return path.replace(/\.md$/i, "");
}

function normalize(target: string): string {
  return target
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

/**
 * Mirrors Obsidian's `metadataCache.getFirstLinkpathDest`: path match first,
 * then unique basename, then alias, then shortest path.
 */
export function resolveLink(
  target: string,
  sourcePath: string,
  notes: ResolvableNote[],
): ResolvableNote | null {
  const clean = normalize(target);
  if (!clean) return null;

  if (clean.includes("/")) {
    const exact = notes.find((note) => normalize(note.path) === clean);
    if (exact) return exact;
    const suffix = notes
      .filter((note) => normalize(note.path).endsWith(`/${clean}`))
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
    if (suffix[0]) return suffix[0];
  }

  const base = clean.split("/").pop()!;
  const byBasename = notes.filter((note) => {
    const noteBase = normalize(note.path).split("/").pop();
    return noteBase === base;
  });
  if (byBasename.length > 0) {
    const sameFolder = byBasename.find(
      (note) => note.path.split("/").slice(0, -1).join("/").toLowerCase() ===
        sourcePath.split("/").slice(0, -1).join("/").toLowerCase(),
    );
    return (
      sameFolder ??
      byBasename.sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0]
    );
  }

  const byAlias = notes.find((note) =>
    (note.aliases ?? []).some((alias) => alias.toLowerCase() === clean),
  );
  return byAlias ?? null;
}

export type LinkRef = {
  link: ParsedLink;
  target: ResolvableNote | null;
};

/** Replaces wikilinks that point at `oldPath` with links to `newPath`. */
export function rewriteLinks(
  body: string,
  oldPath: string,
  newPath: string,
  notes: ResolvableNote[],
): string {
  const oldNote = notes.find((note) => note.path === oldPath);
  if (!oldNote) return body;
  const newTarget = stripMd(newPath);

  return body.replace(WIKILINK_RE, (full, bang: string | undefined, inner: string) => {
    const parsed = splitWikilink(inner);
    if (!parsed) return full;
    const resolved = resolveLink(parsed.target, oldPath, notes);
    if (!resolved || resolved.id !== oldNote.id) return full;
    const heading = parsed.heading ? `#${parsed.heading}` : "";
    const alias = parsed.alias ? `|${parsed.alias}` : "";
    return `${bang ? "!" : ""}[[${newTarget}${heading}${alias}]]`;
  });
}

export function buildAliasMap(
  items: Array<{ id: string; path: string; frontmatter: Frontmatter }>,
): ResolvableNote[] {
  return items.map((item) => ({
    id: item.id,
    path: item.path,
    aliases: getAliases(item.frontmatter),
  }));
}
