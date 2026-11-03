import { describe, expect, it } from "vitest";
import { chunkNote } from "@/lib/markdown/chunk";

describe("chunkNote", () => {
  it("splits by headings and keeps heading metadata", () => {
    const chunks = chunkNote("# Uno\ntexto uno\n## Dos\ntexto dos");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe("Uno");
    expect(chunks[1].heading).toBe("Dos");
  });

  it("returns no chunks for empty content", () => {
    expect(chunkNote("   \n\n")).toEqual([]);
  });

  it("splits very long sections with overlap", () => {
    const long = "a".repeat(13000);
    const chunks = chunkNote(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 6000)).toBe(true);
  });
});
