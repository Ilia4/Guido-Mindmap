import { BarChart3 } from "lucide-react";
import { useEffect, useMemo } from "react";

import { buildProjectTreeProgressSeries, getProjectTreeProgress } from "../../utils/boardMetrics";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BoardTreeProgressModal({ theme = "dark", open, onClose, cards, links }) {
  const isLight = theme === "light";
  const summary = useMemo(() => getProjectTreeProgress(cards, links), [cards, links]);
  const series = useMemo(() => buildProjectTreeProgressSeries(cards, links, 7), [cards, links]);
  const max = Math.max(...series.map((item) => item.progress), 10);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[210]">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={`w-full max-w-[980px] rounded-3xl border p-5 shadow-2xl backdrop-blur ${isLight ? "border-zinc-300 bg-white/95 shadow-zinc-400/20" : "border-white/10 bg-zinc-950/90 shadow-black/50"}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] ${isLight ? "text-zinc-500" : "text-white/40"}`}>
                <BarChart3 className="h-3.5 w-3.5" />
                Прогресс проекта
              </div>
              <div className={`mt-2 text-2xl font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{summary.pct}%</div>
              <div className={`mt-1 text-sm ${isLight ? "text-zinc-500" : "text-white/55"}`}>{summary.done} из {summary.total || 0} веток завершено</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`rounded-2xl border px-4 py-2 text-sm transition ${isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100" : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"}`}
            >
              Закрыть
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className={`rounded-2xl border p-4 ${isLight ? "border-zinc-300 bg-zinc-50" : "border-white/10 bg-white/[0.03]"}`}>
              <div className={`text-[11px] uppercase tracking-[0.14em] ${isLight ? "text-zinc-500" : "text-white/38"}`}>Всего веток</div>
              <div className={`mt-2 text-2xl font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{summary.total}</div>
            </div>
            <div className={`rounded-2xl border p-4 ${isLight ? "border-emerald-200 bg-emerald-50" : "border-white/10 bg-white/[0.03]"}`}>
              <div className={`text-[11px] uppercase tracking-[0.14em] ${isLight ? "text-emerald-700" : "text-white/38"}`}>Выполнено</div>
              <div className={`mt-2 text-2xl font-semibold ${isLight ? "text-emerald-800" : "text-emerald-200"}`}>{summary.done}</div>
            </div>
            <div className={`rounded-2xl border p-4 ${isLight ? "border-amber-200 bg-amber-50" : "border-white/10 bg-white/[0.03]"}`}>
              <div className={`text-[11px] uppercase tracking-[0.14em] ${isLight ? "text-amber-700" : "text-white/38"}`}>В ожидании</div>
              <div className={`mt-2 text-2xl font-semibold ${isLight ? "text-amber-800" : "text-amber-100"}`}>{summary.pending}</div>
            </div>
          </div>

          <div className={`mt-5 rounded-3xl border p-4 ${isLight ? "border-zinc-300 bg-zinc-50/80" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`text-sm font-medium ${isLight ? "text-zinc-900" : "text-white/82"}`}>Динамика за последние 7 дней</div>
              <div className={`text-xs ${isLight ? "text-zinc-500" : "text-white/45"}`}>Накопительный процент выполненных веток</div>
            </div>

            {series.some((item) => item.total > 0) ? (
              <div className="mt-5">
                <div className="flex h-64 items-end gap-3">
                  {series.map((item) => {
                    const height = `${Math.max(10, Math.round((item.progress / max) * 100))}%`;
                    return (
                      <div key={item.key} className="flex flex-1 flex-col items-center gap-3">
                        <div className={`text-xs ${isLight ? "text-zinc-500" : "text-white/45"}`}>{item.progress}%</div>
                        <div className="flex h-full w-full items-end">
                          <div
                            className={cn(
                              "w-full rounded-t-3xl border bg-gradient-to-t transition",
                              isLight ? "border-zinc-300/80" : "border-white/10",
                              item.progress >= 100
                                ? "from-emerald-500/45 to-emerald-300/90"
                                : item.progress >= 50
                                  ? "from-amber-500/45 to-amber-300/85"
                                  : item.progress > 0
                                    ? "from-sky-500/35 to-sky-300/75"
                                    : isLight
                                      ? "from-zinc-200 to-zinc-300"
                                      : "from-white/8 to-white/20"
                            )}
                            style={{ height }}
                            title={`${item.label}: ${item.progress}% (${item.completed}/${item.total || 0} веток)`}
                          />
                        </div>
                        <div className={`text-center text-[11px] ${isLight ? "text-zinc-500" : "text-white/38"}`}>{item.label}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {series.map((item) => (
                    <div key={`${item.key}-meta`} className={`rounded-2xl border px-3 py-2 ${isLight ? "border-zinc-300 bg-white" : "border-white/10 bg-black/20"}`}>
                      <div className={`text-[11px] uppercase tracking-[0.14em] ${isLight ? "text-zinc-500" : "text-white/35"}`}>{item.label}</div>
                      <div className={`mt-1 text-sm ${isLight ? "text-zinc-900" : "text-white/78"}`}>
                        {item.completed} / {item.total || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`mt-4 rounded-2xl border border-dashed px-4 py-12 text-center text-sm ${isLight ? "border-zinc-300 bg-white text-zinc-500" : "border-white/10 bg-white/[0.02] text-white/45"}`}>
                График появится, когда в проекте появятся карточки.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
