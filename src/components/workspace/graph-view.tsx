"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Loader2 } from "lucide-react";

type GraphNode = SimulationNodeDatum & { id: string; label: string; path: string };
type GraphLink = SimulationLinkDatum<GraphNode>;

export function GraphView({
  vaultId,
  onOpenNote,
  centerId,
  local = false,
}: {
  vaultId: string;
  onOpenNote: (path: string) => void;
  centerId?: string;
  local?: boolean;
}) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const width = 900;
  const height = 600;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/v1/vaults/${vaultId}/graph`);
        const data = (await response.json()) as {
          nodes: Array<{ id: string; label: string; path: string }>;
          edges: Array<{ source: string; target: string }>;
        };
        if (!active) return;

        const graphNodes: GraphNode[] = data.nodes.map((node, index) => ({
          ...node,
          x: width / 2 + Math.cos(index) * 160,
          y: height / 2 + Math.sin(index) * 160,
        }));
        const graphLinks: GraphLink[] = data.edges
          .filter((edge) => graphNodes.some((node) => node.id === edge.source) && graphNodes.some((node) => node.id === edge.target))
          .map((edge) => ({ source: edge.source, target: edge.target }));

        if (local && centerId) {
          const neighborIds = new Set<string>([centerId]);
          for (const edge of data.edges) {
            if (edge.source === centerId) neighborIds.add(edge.target);
            if (edge.target === centerId) neighborIds.add(edge.source);
          }
          const filteredNodes = graphNodes.filter((node) => neighborIds.has(node.id));
          const filteredLinks = graphLinks.filter((link) => {
            const source = typeof link.source === "string" ? link.source : (link.source as GraphNode).id;
            const target = typeof link.target === "string" ? link.target : (link.target as GraphNode).id;
            return neighborIds.has(source) && neighborIds.has(target);
          });
          setNodes(filteredNodes);
          setLinks(filteredLinks);
        } else {
          setNodes(graphNodes);
          setLinks(graphLinks);
        }
        setLoading(false);

        const simulation = forceSimulation<GraphNode>(graphNodes)
          .force(
            "link",
            forceLink<GraphNode, GraphLink>(graphLinks)
              .id((node) => node.id)
              .distance(85)
              .strength(0.7),
          )
          .force("charge", forceManyBody().strength(-260))
          .force("center", forceCenter(width / 2, height / 2))
          .force("collide", forceCollide(30))
          .alpha(0.9)
          .on("tick", () => {
            setNodes((current) => [...current]);
          });

        simulationRef.current = simulation;
      } catch {
        if (active) {
          setError("No se pudo cargar el grafo.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      simulationRef.current?.stop();
    };
  }, [vaultId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 size={16} className="animate-spin" /> Construyendo grafo…
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-sm text-[var(--accent-2)]">{error}</div>;
  }

  if (nodes.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-[var(--muted)]">
        Aún no hay notas enlazadas. Crea wikilinks como <code>[[Otra nota]]</code>.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <defs>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="#d85d63" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d85d63" stopOpacity="0" />
          </radialGradient>
        </defs>
        {links.map((link, index) => {
          const source = link.source as GraphNode;
          const target = link.target as GraphNode;
          if (!source?.x || !target?.x) return null;
          return (
            <line
              key={index}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="var(--border)"
              strokeWidth={1.4}
            />
          );
        })}
        {nodes.map((node) => {
          const degree = links.filter(
            (link) =>
              (link.source as GraphNode)?.id === node.id ||
              (link.target as GraphNode)?.id === node.id,
          ).length;
          const radius = 8 + Math.min(degree, 6) * 2;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
              className="cursor-pointer"
              onClick={() => onOpenNote(node.path)}
            >
              {degree > 0 ? <circle r={radius + 16} fill="url(#nodeGlow)" /> : null}
              <circle
                r={radius}
                fill={degree > 1 ? "var(--accent)" : "var(--panel-3)"}
                stroke={degree > 1 ? "var(--accent-2)" : "var(--border)"}
                strokeWidth={1}
              />
              <text
                y={radius + 14}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-soft)"
                style={{ pointerEvents: "none" }}
              >
                {node.label.length > 26 ? `${node.label.slice(0, 26)}…` : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
