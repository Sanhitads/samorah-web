import type { DependencyGraph as Graph } from "@/services/incidentService";

/**
 * Dependency graph (Phase 4) — a deterministic layered SVG of how upstream systems cascade into
 * downstream ones. Nodes with active incidents are highlighted. Presentational; no client JS.
 */
const NODE_W = 118, NODE_H = 38, COL = 168, ROW = 62, PAD = 20;

export function DependencyGraph({ graph }: { graph: Graph }) {
  const layers = new Map<number, typeof graph.nodes>();
  for (const n of graph.nodes) { if (!layers.has(n.layer)) layers.set(n.layer, []); layers.get(n.layer)!.push(n); }
  const maxLayer = Math.max(0, ...graph.nodes.map((n) => n.layer));
  const maxRows = Math.max(1, ...[...layers.values()].map((l) => l.length));
  const pos = new Map<string, { x: number; y: number }>();
  for (const [layer, nodes] of layers) {
    const offset = (maxRows - nodes.length) / 2;
    nodes.forEach((n, i) => pos.set(n.id, { x: PAD + layer * COL, y: PAD + (i + offset) * ROW }));
  }
  const width = PAD * 2 + maxLayer * COL + NODE_W;
  const height = PAD * 2 + (maxRows - 1) * ROW + NODE_H;

  return (
    <div className="inc-depgraph">
      <svg viewBox={`0 0 ${width} ${height}`} className="inc-depgraph__svg" role="img" aria-label="System dependency graph">
        <defs>
          <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--smoke, #9a8f82)" /></marker>
        </defs>
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          const activeEdge = graph.nodes.find((n) => n.id === e.from)?.active && graph.nodes.find((n) => n.id === e.to)?.active;
          return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={activeEdge ? "#b3261e" : "var(--ad-hair, #e5ded4)"} strokeWidth={activeEdge ? 2 : 1.2} markerEnd="url(#dep-arrow)" />;
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} fill={n.active ? "#fdf0ef" : "#fff"} stroke={n.active ? "#b3261e" : "var(--ad-hair, #e5ded4)"} strokeWidth={n.active ? 2 : 1} />
              <text x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 4} textAnchor="middle" fontSize="12" fontFamily="var(--font-sans)" fill={n.active ? "#b3261e" : "var(--ink, #1f1a16)"}>{n.active ? "● " : ""}{n.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="admin__muted" style={{ fontSize: 11 }}>Red = a system with an active incident. Arrows show how a failure cascades downstream.</p>
    </div>
  );
}
