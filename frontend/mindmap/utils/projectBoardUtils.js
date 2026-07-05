export function uid() {
  return "c_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function oppositeSide(side) {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function normalizeCardWidth(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(340, Math.round(n)) : 420;
}

export function normalizeCardHeight(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(220, Math.round(n)) : 260;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
