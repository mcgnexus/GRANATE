"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Plus, Save } from "lucide-react";
import { createEmptyCanvas, type CanvasDocument, type CanvasEdge, type CanvasNode } from "@/lib/canvas";
import { useDialogs } from "@/components/ui/confirm-dialog";

type RfNode = Node<{ label: string; canvasType: string; original: CanvasNode }>;

function toFlow(doc: CanvasDocument): { nodes: RfNode[]; edges: Edge[] } {
  const nodes: RfNode[] = doc.nodes.map((node) => ({
    id: node.id,
    type: node.type === "group" ? "group" : "default",
    position: { x: node.x, y: node.y },
    data: {
      label:
        node.type === "text"
          ? (node.text ?? "").slice(0, 80) || "Texto"
          : node.type === "file"
            ? (node.file ?? "").split("/").pop() ?? "Archivo"
            : node.type === "link"
              ? (node.url ?? "Enlace")
              : (node.label ?? "Grupo"),
      canvasType: node.type,
      original: node,
    },
    style: {
      width: node.width,
      height: node.height,
      background: node.color ? `var(--${node.color})` : undefined,
    },
  }));

  const edges: Edge[] = doc.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    label: edge.label,
    data: { original: edge },
    style: edge.color ? { stroke: `var(--${edge.color})` } : undefined,
  }));

  return { nodes, edges };
}

function toCanvas(nodes: RfNode[], edges: Edge[]): CanvasDocument {
  return {
    nodes: nodes.map((node) => {
      const original = node.data.original;
      return {
        ...original,
        id: node.id,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: Math.round((node.style?.width as number) ?? original.width ?? 240),
        height: Math.round((node.style?.height as number) ?? original.height ?? 120),
        text: node.data.canvasType === "text" ? node.data.label : original.text,
      };
    }),
    edges: edges.map((edge) => {
      const original = (edge.data as { original?: CanvasEdge } | undefined)?.original;
      return {
        ...original,
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
        label: typeof edge.label === "string" ? edge.label : original?.label,
      };
    }),
  };
}

export function CanvasView({
  vaultId,
  canvasId,
  canvasPath,
  onSaved,
}: {
  vaultId: string;
  canvasId?: string;
  canvasPath?: string;
  onSaved?: () => void;
}) {
  const [nodes, setNodes] = useState<RfNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [currentId, setCurrentId] = useState(canvasId ?? "");
  const [path, setPath] = useState(canvasPath ?? "");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const { prompt, dialogNode } = useDialogs();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const query = canvasId ? `?id=${canvasId}` : canvasPath ? `?path=${encodeURIComponent(canvasPath)}` : "";
        const response = await fetch(`/api/v1/vaults/${vaultId}/canvases${query}`);
        if (!response.ok) throw new Error("Canvas no encontrado");
        const data = (await response.json()) as {
          canvas: { id: string; path: string; data: CanvasDocument };
        };
        if (!active) return;
        const flow = toFlow(data.canvas.data ?? createEmptyCanvas());
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setCurrentId(data.canvas.id);
        setPath(data.canvas.path);
      } catch {
        if (active) {
          const flow = toFlow(createEmptyCanvas());
          setNodes(flow.nodes);
          setEdges(flow.edges);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [vaultId, canvasId, canvasPath]);

  const flowNodes = useMemo(() => nodes, [nodes]);

  function onConnect(connection: Connection) {
    setEdges((current) => addEdge({ ...connection, id: `e-${Date.now().toString(36)}` }, current));
  }

  function addTextNode() {
    const id = `n-${Date.now().toString(36)}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: "default",
        position: { x: 80 + current.length * 24, y: 80 + current.length * 18 },
        data: {
          label: "Nueva tarjeta",
          canvasType: "text",
          original: {
            id,
            type: "text",
            x: 80 + current.length * 24,
            y: 80 + current.length * 18,
            width: 240,
            height: 120,
            text: "Nueva tarjeta",
          } satisfies CanvasNode,
        },
        style: { width: 240, height: 120 },
      },
    ]);
  }

  async function save() {
    setStatus("Guardando…");
    try {
      if (!path) {
        const suggested = `Canvas ${new Date().toISOString().slice(0, 10)}.canvas`;
        const chosen = await prompt({
          title: "Guardar canvas",
          message: "Elige la ruta del canvas:",
          initialValue: suggested,
        });
        if (!chosen) {
          setStatus("");
          return;
        }
        setPath(chosen.endsWith(".canvas") ? chosen : `${chosen}.canvas`);
        const response = await fetch(`/api/v1/vaults/${vaultId}/canvases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: chosen.endsWith(".canvas") ? chosen : `${chosen}.canvas`,
            data: toCanvas(nodes, edges),
          }),
        });
        const data = (await response.json()) as { canvas?: { id: string } };
        if (data.canvas) setCurrentId(data.canvas.id);
      } else {
        const response = await fetch(`/api/v1/vaults/${vaultId}/canvases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: currentId || undefined, path, data: toCanvas(nodes, edges) }),
        });
        const data = (await response.json()) as { canvas?: { id: string } };
        if (data.canvas?.id) setCurrentId(data.canvas.id);
      }
      setStatus("Guardado");
      onSaved?.();
      window.setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Error al guardar");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 size={16} className="animate-spin" /> Cargando canvas…
      </div>
    );
  }

  return (
    <div className="canvas-shell flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <input
          className="input h-8 max-w-[320px] py-1 text-xs"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="ruta del canvas"
        />
        <button type="button" onClick={addTextNode} className="btn h-8 text-xs">
          <Plus size={13} /> Tarjeta
        </button>
        <button type="button" onClick={save} className="btn btn-primary h-8 text-xs">
          <Save size={13} /> Guardar
        </button>
        {status ? <span className="text-[11px] text-[var(--muted)]">{status}</span> : null}
        <span className="ml-auto hidden text-[10px] text-[var(--muted)] sm:block">
          Doble clic para editar · arrastra para mover
        </span>
      </div>
      {dialogNode}
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          onNodesChange={(changes) =>
            setNodes((current) =>
              current
                .map((node) => {
                  const change = changes.find(
                    (item) => item.type === "position" && item.id === node.id,
                  );
                  if (change && change.type === "position" && change.position) {
                    return { ...node, position: change.position };
                  }
                  return node;
                })
                .filter((node) => {
                  const removal = changes.find(
                    (item) => item.type === "remove" && item.id === node.id,
                  );
                  return !removal;
                }),
            )
          }
          onEdgesChange={(changes) =>
            setEdges((current) =>
              current.filter(
                (edge) =>
                  !changes.some((item) => item.type === "remove" && item.id === edge.id),
              ),
            )
          }
          onConnect={onConnect}
          onNodeDoubleClick={async (_, node) => {
            const next = await prompt({
              title: "Texto de la tarjeta",
              initialValue: node.data.label as string,
            });
            if (next) {
              setNodes((current) =>
                current.map((item) =>
                  item.id === node.id ? { ...item, data: { ...item.data, label: next } } : item,
                ),
              );
            }
          }}
          fitView
          colorMode="dark"
        >
          <Background gap={22} size={1} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="var(--accent)" maskColor="rgba(0,0,0,0.45)" />
        </ReactFlow>
      </div>
    </div>
  );
}
