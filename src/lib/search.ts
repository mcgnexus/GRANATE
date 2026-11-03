import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { config } from "@/lib/config";

export type SearchHit = {
  id: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  source: "fulltext" | "semantic" | "title";
};

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

export async function searchNotes(
  vaultId: string,
  query: string,
  options: { limit?: number; tag?: string; folder?: string; semantic?: boolean } = {},
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = options.limit ?? 20;

  const filters: ReturnType<typeof sql>[] = [];
  if (options.tag) {
    filters.push(sql`exists (
      select 1 from note_tags nt
      join tags t on t.id = nt.tag_id
      where nt.note_id = n.id and lower(t.name) = ${options.tag.replace(/^#/, "").toLowerCase()}
    )`);
  }
  if (options.folder) {
    filters.push(sql`lower(n.path) like ${`${options.folder.toLowerCase()}/%`}`);
  }

  const fulltext = rowsOf(
    await db.execute(sql`
      select n.id, n.path, n.title, n.content,
        ts_rank(
          to_tsvector('spanish', coalesce(n.title,'') || ' ' || coalesce(n.content,'')),
          websearch_to_tsquery('spanish', ${trimmed})
        ) as rank,
        ts_headline(
          'spanish',
          n.content,
          websearch_to_tsquery('spanish', ${trimmed}),
          'MaxWords=45, MinWords=8, StartSel=«, StopSel=»'
        ) as snippet
      from notes n
      where n.vault_id = ${vaultId}
        and n.deleted_at is null
        and to_tsvector('spanish', coalesce(n.title,'') || ' ' || coalesce(n.content,''))
            @@ websearch_to_tsquery('spanish', ${trimmed})
        ${filters.length ? sql`and ${sql.join(filters, sql` and `)}` : sql``}
      order by rank desc
      limit ${limit}
    `),
  );

  const hits: SearchHit[] = fulltext.map((row, index) => ({
    id: String(row.id),
    path: String(row.path),
    title: String(row.title),
    snippet: String(row.snippet ?? "").replace(/\s+/g, " ").slice(0, 220),
    score: 1 / (index + 1),
    source: "fulltext" as const,
  }));

  if (options.semantic !== false && config.hasEmbeddings && hits.length < limit) {
    try {
      const { embedQuery } = await import("@/lib/ai/embeddings");
      const vector = await embedQuery(trimmed);
      const semantic = rowsOf(
        await db.execute(sql`
          select n.id, n.path, n.title,
            min(c.embedding <=> ${vector}::vector) as distance
          from note_chunks c
          join notes n on n.id = c.note_id
          where c.vault_id = ${vaultId}
            and n.deleted_at is null
            and c.embedding is not null
          group by n.id, n.path, n.title
          order by distance asc
          limit ${limit}
        `),
      );

      for (const row of semantic) {
        if (hits.some((hit) => hit.id === String(row.id))) continue;
        hits.push({
          id: String(row.id),
          path: String(row.path),
          title: String(row.title),
          snippet: "",
          score: 1 / (hits.length + 1),
          source: "semantic",
        });
      }
    } catch (error) {
      console.warn("[GRANATE] Búsqueda semántica no disponible", error);
    }
  }

  return hits.slice(0, limit);
}
