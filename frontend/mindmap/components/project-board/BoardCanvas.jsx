import BoardCardShell from "../BoardCardShell";
import BoardEdges from "../BoardEdges";

export default function BoardCanvas({
  theme = "dark",
  viewportRef,
  dotBgStyle,
  onViewportPointerDown,
  onViewportPointerMove,
  onViewportPointerUp,
  onWheel,
  cam,
  cards,
  links,
  sizes,
  viewportRect,
  activeId,
  dragActive,
  setSizes,
  onOpenCard,
  onResizeStart,
  onCardPointerDown,
  onOpenAdd,
  onEmptyAction,
  emptyActionLabel,
  emptyTitle,
  emptyHint,
}) {
  const isLight = theme === "light";
  const supportsCssZoom =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("zoom", "1");

  const sceneStyle = supportsCssZoom
    ? {
        transform: `translate(${cam.x * cam.zoom}px, ${cam.y * cam.zoom}px)`,
        transformOrigin: "0 0",
      }
    : {
        transform: `scale(${cam.zoom}) translate(${cam.x}px, ${cam.y}px)`,
        transformOrigin: "0 0",
      };

  const worldLayerStyle = supportsCssZoom
    ? {
        zoom: cam.zoom,
        transformOrigin: "0 0",
      }
    : undefined;

  return (
    <div
      ref={viewportRef}
      className={`relative h-full cursor-grab overflow-hidden rounded-2xl border active:cursor-grabbing ${isLight ? "border-zinc-300/80" : "border-white/10"}`}
      style={dotBgStyle}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onViewportPointerMove}
      onPointerUp={onViewportPointerUp}
      onPointerCancel={onViewportPointerUp}
      onWheel={onWheel}
    >
      <div className={`pointer-events-none absolute inset-0 ${isLight ? "bg-white/35" : "bg-white/[0.04]"}`} />

      <div className="absolute inset-0" style={sceneStyle}>
        <div className="relative h-full w-full" style={worldLayerStyle}>
          <BoardEdges theme={theme} cards={cards} links={links} sizes={sizes} viewportRect={viewportRect} cam={cam} />

          {cards.map((card) => (
            <div
              key={card.id}
              className="absolute"
              style={{
                left: card.x,
                top: card.y,
                willChange: dragActive ? "left, top" : "auto",
              }}
            >
              <div
                className={[
                  "rounded-2xl transition",
                  activeId === card.id
                    ? isLight
                      ? "ring-2 ring-zinc-700/70 shadow-[0_0_0_6px_rgba(24,24,27,0.08)]"
                      : "ring-2 ring-white/60 shadow-[0_0_0_6px_rgba(255,255,255,0.10)]"
                    : "",
                ].join(" ")}
              >
                <BoardCardShell
                  theme={theme}
                  card={card}
                  cam={cam}
                  onOpen={onOpenCard}
                  onResizeStart={onResizeStart}
                  onPointerDown={(event) => onCardPointerDown(event, card.id)}
                  onMeasure={(id, w, h) =>
                    setSizes((prev) =>
                      prev[id] && Math.abs(prev[id].w - w) < 1 && Math.abs(prev[id].h - h) < 1
                        ? prev
                        : { ...prev, [id]: { w, h } }
                    )
                  }
                  onAddFromSide={onOpenAdd}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!cards.length ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className={`max-w-md rounded-3xl border border-dashed px-6 py-5 text-center backdrop-blur ${isLight ? "border-zinc-300 bg-white/90" : "border-white/10 bg-zinc-950/75"}`}>
            <div className={`text-base font-semibold ${isLight ? "text-zinc-900" : "text-white/88"}`}>{emptyTitle || "Здесь пока пусто"}</div>
            {emptyHint ? <div className={`mt-2 text-sm leading-6 ${isLight ? "text-zinc-500" : "text-white/50"}`}>{emptyHint}</div> : null}
            {emptyActionLabel ? (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onEmptyAction?.();
                }}
                className={`mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition ${isLight ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-white text-zinc-950 hover:bg-white/90"}`}
              >
                {emptyActionLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`absolute bottom-3 left-3 rounded-xl border px-3 py-2 text-xs backdrop-blur ${isLight ? "border-zinc-300/80 bg-white/85 text-zinc-600" : "border-white/10 bg-zinc-950/60 text-white/70"}`}>
        Пан: ЛКМ по пустому месту • Зум: колёсико • Карточки: ЛКМ по карточке
      </div>
    </div>
  );
}
