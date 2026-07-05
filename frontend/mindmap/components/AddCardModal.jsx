import { useEffect } from "react";
import { Plus, X } from "lucide-react";

function IconBtn({ children, onClick, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export default function AddCardModal({
  open,
  theme = "dark",
  rootMode = false,
  side,
  parentTitle,
  value,
  setValue,
  onClose,
  onCreate,
  pending = false,
  error = "",
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape" && !pending) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  const isLight = theme === "light";
  const controlStyle = { colorScheme: isLight ? "light" : "dark" };
  const sideText = side === "top" ? "сверху" : side === "bottom" ? "снизу" : side === "left" ? "слева" : "справа";
  const title = rootMode ? "Новое независимое дерево" : `Новая карточка ${sideText}`;
  const subtitle = rootMode ? "Карточка создастся без родителя и начнёт отдельную ветку." : `Родитель: ${parentTitle || "—"}`;

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/60" onClick={() => !pending && onClose?.()} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`w-full max-w-[520px] rounded-2xl border p-5 shadow-2xl backdrop-blur ${isLight ? "border-zinc-300 bg-white/95 shadow-zinc-400/20" : "border-white/10 bg-zinc-950/80 shadow-black/40"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-base font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{title}</div>
              <div className={`mt-1 truncate text-sm ${isLight ? "text-zinc-500" : "text-white/60"}`}>{subtitle}</div>
            </div>

            <IconBtn
              onClick={onClose}
              disabled={pending}
              className={isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"}
            >
              <X className="h-4 w-4" />
            </IconBtn>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <div className={`mb-1 text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}>Название</div>
              <input
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={rootMode ? "Например: Новый поток задач / Отдельный проект" : "Например: Подзадача / Этап / Идея"}
                style={controlStyle}
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 ${isLight ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-200" : "border-white/10 bg-white/5 text-white placeholder:text-white/35 focus:ring-white/10"}`}
              />
            </label>

            {error ? <div className={`rounded-2xl border px-3 py-2 text-sm ${isLight ? "border-rose-300 bg-rose-50 text-rose-700" : "border-rose-500/20 bg-rose-500/10 text-rose-100"}`}>{error}</div> : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className={`rounded-xl border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"}`}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onCreate}
                disabled={pending}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${isLight ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-white text-zinc-950 hover:bg-white/90"}`}
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  {pending ? "Создаю..." : "Создать"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
