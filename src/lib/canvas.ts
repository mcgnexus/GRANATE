export type CanvasNodeType = "text" | "file" | "group" | "link";

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toNode: string;
  toSide?: "top" | "right" | "bottom" | "left";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
};

export type CanvasDocument = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export function createEmptyCanvas(): CanvasDocument {
  return { nodes: [], edges: [] };
}

export function parseCanvas(raw: string): CanvasDocument {
  try {
    const data = JSON.parse(raw) as Partial<CanvasDocument>;
    return {
      nodes: Array.isArray(data.nodes) ? (data.nodes as CanvasNode[]) : [],
      edges: Array.isArray(data.edges) ? (data.edges as CanvasEdge[]) : [],
    };
  } catch {
    return createEmptyCanvas();
  }
}

export function serializeCanvas(canvas: CanvasDocument): string {
  return JSON.stringify(canvas, null, 2);
}

export function validateCanvas(value: unknown): CanvasDocument {
  const data = (value ?? {}) as Partial<CanvasDocument>;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error("Canvas inválido: faltan nodes o edges");
  }
  const nodes = data.nodes.map((node) => {
    if (!node || typeof node.id !== "string" || typeof node.type !== "string") {
      throw new Error("Nodo de canvas inválido");
    }
    return node as CanvasNode;
  });
  return { nodes, edges: data.edges as CanvasEdge[] };
}
