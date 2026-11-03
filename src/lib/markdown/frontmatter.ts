import YAML from "yaml";

export type Frontmatter = Record<string, unknown>;

export type ParsedNote = {
  frontmatter: Frontmatter;
  body: string;
  rawYaml: string | null;
  hasFrontmatter: boolean;
};

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseFrontmatter(raw: string): ParsedNote {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw, rawYaml: null, hasFrontmatter: false };
  }

  let frontmatter: Frontmatter = {};
  try {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Frontmatter;
    }
  } catch (error) {
    console.warn("[GRANATE] Frontmatter YAML inválido", error);
  }

  return {
    frontmatter,
    body: raw.slice(match[0].length),
    rawYaml: match[1],
    hasFrontmatter: true,
  };
}

export function serializeFrontmatter(frontmatter: Frontmatter, body: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return body;
  const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body}`;
}

export function getAliases(frontmatter: Frontmatter): string[] {
  const raw = frontmatter.aliases ?? frontmatter.alias;
  if (typeof raw === "string") return [raw.trim()].filter(Boolean);
  if (Array.isArray(raw)) return raw.map(String).map((v) => v.trim()).filter(Boolean);
  return [];
}

export function getFrontmatterTags(frontmatter: Frontmatter): string[] {
  const raw = frontmatter.tags ?? frontmatter.tag;
  if (typeof raw === "string") {
    return raw
      .split(/[, ]+/)
      .map((tag) => normalizeTag(tag))
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .flatMap((value) => String(value).split(/[, ]+/))
      .map((tag) => normalizeTag(tag))
      .filter(Boolean);
  }
  return [];
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").trim();
}

/** Extracts inline #tags ignoring code fences and URLs. */
export function getInlineTags(body: string): string[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const tags = new Set<string>();
  for (const line of withoutCode.split(/\r?\n/)) {
    const withoutUrls = line.replace(/https?:\/\/\S+/g, "");
    const re = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
    let match: RegExpExecArray | null;
    while ((match = re.exec(withoutUrls))) {
      const tag = match[2].replace(/[.,;:!?)]+$/, "");
      if (tag && !/^\d+$/.test(tag)) tags.add(tag);
    }
  }
  return Array.from(tags);
}

export function collectTags(frontmatter: Frontmatter, body: string): string[] {
  return Array.from(
    new Set([...getFrontmatterTags(frontmatter), ...getInlineTags(body)]),
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export type OutlineItem = { level: number; text: string; line: number };

export function extractOutline(body: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = body.split(/\r?\n/);
  let inCode = false;
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) inCode = !inCode;
    if (inCode) return;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      items.push({ level: match[1].length, text: match[2], line: index + 1 });
    }
  });
  return items;
}

export function stripMarkdownForEmbedding(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
