import React, { useMemo } from "react";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function sideVec(side) {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "bottom") return { x: 0, y: 1 };
  if (side === "left") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function norm(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function bezierCtrlBySides(x1, y1, x2, y2, fromSide, toSide) {
  const p0 = { x: x1, y: y1 };
  const p3 = { x: x2, y: y2 };

  const dist = Math.hypot(x2 - x1, y2 - y1);
  const handle = Math.max(90, dist * 0.35);

  const v0 = sideVec(fromSide || "right");
  const v3 = sideVec(toSide || "left");

  const p1 = { x: p0.x + v0.x * handle, y: p0.y + v0.y * handle };
  const p2 = { x: p3.x + v3.x * handle, y: p3.y + v3.y * handle };

  return { p0, p1, p2, p3 };
}

function bezierD(p0, p1, p2, p3) {
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}

function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function bezierTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function ArrowHead({ x, y, dir, size = 10, light = false }) {
  const n = norm(dir);
  const nx = n.x;
  const ny = n.y;

  const px = -ny;
  const py = nx;

  const tipX = x + nx * size;
  const tipY = y + ny * size;

  const baseX = x - nx * size * 0.6;
  const baseY = y - ny * size * 0.6;

  const w = size * 0.65;
  const leftX = baseX + px * w;
  const leftY = baseY + py * w;
  const rightX = baseX - px * w;
  const rightY = baseY - py * w;

  const d = `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
  const glow = light ? "rgba(24,24,27,0.12)" : "rgba(255,255,255,0.14)";
  const fill = light ? "rgba(39,39,42,0.90)" : "rgba(255,255,255,0.90)";

  return (
    <>
      <path d={d} fill={glow} />
      <path d={d} fill={fill} />
    </>
  );
}

function BezierPathWithArrow({ x1, y1, x2, y2, fromSide, toSide, gap = 15, light = false }) {
  const { p0, p1, p2, p3 } = bezierCtrlBySides(x1, y1, x2, y2, fromSide, toSide);

  const endP = bezierPoint(p0, p1, p2, p3, 1);
  const tan = bezierTangent(p0, p1, p2, p3, 1);
  const dir = norm(tan);
  const trimmedEnd = { x: endP.x - dir.x * gap, y: endP.y - dir.y * gap };
  const d = bezierD(p0, p1, p2, trimmedEnd);
  const glowStroke = light ? "rgba(24,24,27,0.08)" : "rgba(255,255,255,0.10)";
  const mainStroke = light ? "rgba(39,39,42,0.72)" : "rgba(255,255,255,0.72)";

  return (
    <>
      <path d={d} stroke={glowStroke} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={d} stroke={mainStroke} strokeWidth="3" fill="none" strokeLinecap="round" />
      <ArrowHead x={trimmedEnd.x} y={trimmedEnd.y} dir={dir} size={11} light={light} />
    </>
  );
}

export default function BoardEdges({ theme = "dark", cards, links, sizes, viewportRect, cam }) {
  const isLight = theme === "light";

  const getAnchor = (card, side) => {
    const s = sizes[card.id] || { w: 340, h: 220 };
    const w = s.w;
    const h = s.h;

    if (side === "top") return { x: card.x + w / 2, y: card.y };
    if (side === "bottom") return { x: card.x + w / 2, y: card.y + h };
    if (side === "left") return { x: card.x, y: card.y + h / 2 };
    return { x: card.x + w, y: card.y + h / 2 };
  };

  const worldW = viewportRect?.width ? viewportRect.width / cam.zoom : 2000;
  const worldH = viewportRect?.height ? viewportRect.height / cam.zoom : 1200;

  const edges = useMemo(() => {
    return links
      .map((l) => {
        const a = cards.find((c) => c.id === l.from);
        const b = cards.find((c) => c.id === l.to);
        if (!a || !b) return null;

        const p1 = getAnchor(a, l.fromSide || "right");
        const p2 = getAnchor(b, l.toSide || "left");
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const gap = clamp(dist * 0.06, 12, 22);

        return { id: l.id, p1, p2, gap, fromSide: l.fromSide, toSide: l.toSide };
      })
      .filter(Boolean);
  }, [cards, links, sizes]);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={worldW}
      height={worldH}
      viewBox={`0 0 ${worldW} ${worldH}`}
      style={{ overflow: "visible" }}
    >
      {edges.map((e) => (
        <BezierPathWithArrow
          key={e.id}
          x1={e.p1.x}
          y1={e.p1.y}
          x2={e.p2.x}
          y2={e.p2.y}
          fromSide={e.fromSide}
          toSide={e.toSide}
          gap={e.gap}
          light={isLight}
        />
      ))}
    </svg>
  );
}
