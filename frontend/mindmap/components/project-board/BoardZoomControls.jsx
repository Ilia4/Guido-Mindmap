import { ChevronLeft, ChevronRight } from "lucide-react";

export default function BoardZoomControls({
  theme = "dark",
  zoomPct,
  sidebarOpen,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onToggleSidebar,
}) {
  const isLight = theme === "light";
  const shellClass = isLight ? "border-zinc-300/80 bg-white/88" : "border-white/10 bg-zinc-950/60";
  const buttonClass = isLight
    ? "border-zinc-300/80 bg-white text-zinc-700 hover:bg-zinc-100"
    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10";

  return (
    <div className={`absolute bottom-3 right-3 flex items-center gap-2 rounded-xl border px-2 py-2 backdrop-blur ${shellClass}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onZoomOut?.();
        }}
        className={`h-9 w-9 rounded-lg border transition ${buttonClass}`}
        title="Уменьшить"
      >
        -
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onZoomReset?.();
        }}
        className={`h-9 min-w-[72px] select-none rounded-lg border px-2 text-center text-xs transition ${buttonClass}`}
        title="Сбросить зум"
      >
        {zoomPct}%
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onZoomIn?.();
        }}
        className={`h-9 w-9 rounded-lg border transition ${buttonClass}`}
        title="Увеличить"
      >
        +
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleSidebar?.();
        }}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs transition ${buttonClass}`}
        title={sidebarOpen ? "Скрыть панель" : "Показать панель"}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Панель
      </button>
    </div>
  );
}
