export type TextChunk = {
  idx: number;
  heading: string | null;
  content: string;
  tokens: number;
};

const MAX_CHARS = 6000;
const OVERLAP_CHARS = 400;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunks a note by headings, then by size. Keeps headings as metadata so RAG
 * citations can point to a section instead of the whole note.
 */
export function chunkNote(body: string): TextChunk[] {
  const sections: Array<{ heading: string | null; content: string }> = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  let inCode = false;

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) sections.push({ heading: currentHeading, content });
    buffer = [];
  };

  for (const line of body.split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) inCode = !inCode;
    const headingMatch = !inCode && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].trim();
      buffer.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();

  const chunks: TextChunk[] = [];
  let idx = 0;

  for (const section of sections) {
    const text = section.content;
    if (text.length <= MAX_CHARS) {
      chunks.push({
        idx: idx++,
        heading: section.heading,
        content: text,
        tokens: estimateTokens(text),
      });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + MAX_CHARS);
      if (end < text.length) {
        const lastBreak = text.lastIndexOf("\n\n", end);
        if (lastBreak > start + MAX_CHARS / 2) end = lastBreak;
      }
      const slice = text.slice(start, end).trim();
      if (slice) {
        chunks.push({
          idx: idx++,
          heading: section.heading,
          content: slice,
          tokens: estimateTokens(slice),
        });
      }
      if (end === text.length) break;
      start = Math.max(start + 1, end - OVERLAP_CHARS);
    }
  }

  return chunks;
}
