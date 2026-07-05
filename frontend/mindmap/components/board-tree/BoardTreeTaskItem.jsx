import { Clock3, Flag } from "lucide-react";

import { getImportanceLabel, getUrgencyShortLabel } from "../../utils/boardMetrics";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BoardTreeTaskItem({ theme = "dark", item, activeId, onHover, onHoverOut, onClick, onDoubleClick, priorityTone }) {
  const isActive = activeId === item.cardId;
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onMouseEnter={() => onHover?.(item.cardId)}
      onMouseLeave={() => onHoverOut?.()}
      onClick={() => onClick?.(item.cardId)}
      onDoubleClick={() => onDoubleClick?.(item.cardId)}
      className={cn(
        "w-full rounded-2xl border px-3 py-3 text-left transition",
        isActive
          ? isLight
            ? "border-zinc-900/30 bg-zinc-900/5"
            : "border-white/25 bg-white/[0.08]"
          : isLight
          ? "border-zinc-300 bg-white hover:bg-zinc-50"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("text-sm font-medium leading-snug", item.done ? (isLight ? "text-zinc-400 line-through" : "text-white/45 line-through") : isLight ? "text-zinc-900" : "text-white/86")}>
            {item.title}
          </div>
          <div className={`mt-1 text-[11px] ${isLight ? "text-zinc-500" : "text-white/40"}`}>Карточка: {item.cardTitle}</div>
        </div>

        <div className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", priorityTone(item.priorityValue))}>
          Приоритет {item.priorityValue}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/60"}`}>
          <Clock3 className="h-3 w-3" />
          {getUrgencyShortLabel(item.urgency)}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/60"}`}>
          <Flag className="h-3 w-3" />
          {getImportanceLabel(item.importance)}
        </span>
        {item.deadline ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/60"}`}>
            До {item.deadline}
          </span>
        ) : null}
        {item.responsible ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/60"}`}>
            {item.responsible}
          </span>
        ) : null}
      </div>
    </button>
  );
}
