import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import BoardCard from "../BoardCard";

const OUT = 10;
const EDGE = 28;

function pickSide(localX, localY, w, h) {
  const dTop = localY;
  const dBottom = h - localY;
  const dLeft = localX;
  const dRight = w - localX;

  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return "top";
  if (min === dBottom) return "bottom";
  if (min === dLeft) return "left";
  return "right";
}

export default function BoardCardShell({
  theme = "dark",
  card,
  cam,
  onPointerDown,
  onOpen,
  onMeasure,
  onAddFromSide,
  onResizeStart,
}) {
  const [hoverSide, setHoverSide] = useState(null);
  const shellRef = useRef(null);
  const rectRef = useRef(null);
  const hoverSideRef = useRef(null);
  const hoverRafRef = useRef(0);
  const hoverPendingSideRef = useRef(null);
  const isLight = theme === "light";

  const applyHoverSide = (side) => {
    if (hoverSideRef.current === side) return;
    hoverSideRef.current = side;
    hoverPendingSideRef.current = side;

    if (hoverRafRef.current) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      setHoverSide(hoverPendingSideRef.current);
    });
  };

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const updateMeasure = () => {
      const r = el.getBoundingClientRect();
      rectRef.current = r;

      const w = (r.width - OUT * 2) / cam.zoom;
      const h = (r.height - OUT * 2) / cam.zoom;
      onMeasure?.(card.id, w, h);
    };

    updateMeasure();

    const ro = new ResizeObserver(updateMeasure);
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [cam.zoom, card.id, onMeasure]);

  return (
    <div
      ref={shellRef}
      className="relative"
      style={{
        touchAction: "none",
        padding: OUT,
        margin: -OUT,
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => {
        rectRef.current = e.currentTarget.getBoundingClientRect();
      }}
      onPointerLeave={() => {
        rectRef.current = null;
        applyHoverSide(null);
      }}
      onPointerMove={(e) => {
        if (!rectRef.current) rectRef.current = e.currentTarget.getBoundingClientRect();

        const r = rectRef.current;
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;

        const innerX = x - OUT;
        const innerY = y - OUT;
        const innerW = r.width - OUT * 2;
        const innerH = r.height - OUT * 2;

        if (innerW <= 0 || innerH <= 0) return;

        const nearEdge =
          innerX < EDGE ||
          innerX > innerW - EDGE ||
          innerY < EDGE ||
          innerY > innerH - EDGE ||
          innerX < 0 ||
          innerX > innerW ||
          innerY < 0 ||
          innerY > innerH;

        if (!nearEdge) {
          applyHoverSide(null);
          return;
        }

        const cx = Math.max(0, Math.min(innerX, innerW));
        const cy = Math.max(0, Math.min(innerY, innerH));

        applyHoverSide(pickSide(cx, cy, innerW, innerH));
      }}
    >
      <div className="transition-transform duration-150 hover:-translate-y-0.5">
        <BoardCard theme={theme} card={card} onOpen={onOpen} onResizeStart={onResizeStart} />
      </div>

      {hoverSide ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddFromSide?.(card.id, hoverSide);
          }}
          className={`absolute flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100" : "border-white/15 bg-zinc-950/80 text-white/85 hover:bg-white/10"}`}
          style={{
            left:
              hoverSide === "top" || hoverSide === "bottom"
                ? "50%"
                : hoverSide === "left"
                ? -OUT
                : undefined,
            right: hoverSide === "right" ? -OUT : undefined,
            top:
              hoverSide === "left" || hoverSide === "right"
                ? "50%"
                : hoverSide === "top"
                ? -OUT
                : undefined,
            bottom: hoverSide === "bottom" ? -OUT : undefined,
            transform:
              hoverSide === "top" || hoverSide === "bottom"
                ? "translateX(-50%)"
                : "translateY(-50%)",
          }}
          title="Добавить карточку"
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
