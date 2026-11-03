import { describe, expect, it } from "vitest";
import { createEmptyCanvas, parseCanvas, serializeCanvas, validateCanvas } from "@/lib/canvas";

describe("canvas", () => {
  it("round-trips a JSON Canvas document", () => {
    const doc = {
      nodes: [
        { id: "n1", type: "text" as const, x: 0, y: 0, width: 200, height: 100, text: "Hola" },
      ],
      edges: [],
    };
    const parsed = parseCanvas(serializeCanvas(doc));
    expect(parsed.nodes[0].text).toBe("Hola");
  });

  it("returns an empty canvas for invalid JSON", () => {
    expect(parseCanvas("{")).toEqual(createEmptyCanvas());
  });

  it("validates node structure", () => {
    expect(() => validateCanvas({ nodes: [{ id: 1 }], edges: [] })).toThrow();
    expect(validateCanvas({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });
});
