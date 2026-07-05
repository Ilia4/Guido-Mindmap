import { ChevronDown, ChevronRight, Clock3, Flag } from "lucide-react";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BoardCardTreeItem({
  theme = "dark",
  id,
  byId,
  childrenMap,
  metricsById,
  level,
  collapsed,
  toggleCollapsed,
  onHover,
  onHoverOut,
  onClick,
  onDoubleClick,
  activeId,
  pathSet,
  priorityTone,
  progressTone,
}) {
  const card = byId.get(id);
  const metrics = metricsById.get(id);
  if (!card || !metrics) return null;

  if (pathSet.has(id)) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100/85" style={{ marginLeft: level * 12 }}>
        Обнаружен цикл в связях карточек: {id}
      </div>
    );
  }

  const isLight = theme === "light";
  const children = childrenMap.get(id) || [];
  const hasKids = children.length > 0;
  const isCollapsed = collapsed[id] === true;
  const isActive = activeId === id;
  const progressLabel = metrics.kind === "children" ? "веток" : "задач";
  const nextPath = new Set(pathSet);
  nextPath.add(id);

  const sortedChildren = [...children].sort((leftId, rightId) => {
    const left = metricsById.get(leftId)?.priority ?? 0;
    const right = metricsById.get(rightId)?.priority ?? 0;
    if (right !== left) return right - left;
    const leftTitle = byId.get(leftId)?.title || "";
    const rightTitle = byId.get(rightId)?.title || "";
    return leftTitle.localeCompare(rightTitle, "ru");
  });

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-2xl border px-3 py-3 transition",
          isActive
            ? isLight
              ? "border-zinc-900/30 bg-zinc-900/5"
              : "border-white/25 bg-white/[0.08]"
            : isLight
            ? "border-zinc-300 bg-white hover:bg-zinc-50"
            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
        )}
        style={{ marginLeft: level * 12 }}
        onMouseEnter={() => onHover?.(id)}
        onMouseLeave={() => onHoverOut?.()}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border transition",
              hasKids
                ? isLight
                  ? "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                : "pointer-events-none border-transparent bg-transparent text-transparent"
            )}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapsed(id);
            }}
            title={isCollapsed ? "Развернуть ветку" : "Свернуть ветку"}
          >
            {hasKids ? (isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : null}
          </button>

          <button type="button" className="min-w-0 flex-1 text-left" title={card.title || "Без названия"} onClick={() => onClick?.(id)} onDoubleClick={() => onDoubleClick?.(id)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-sm font-medium leading-snug ${isLight ? "text-zinc-900" : "text-white/88"}`}>{card.title || "Без названия"}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/60"}`}>
                    <Clock3 className="h-3 w-3" />
                    {metrics.urgencyShort}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/60"}`}>
                    <Flag className="h-3 w-3" />
                    {metrics.importanceLabel}
                  </span>
                </div>
              </div>

              <div className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", priorityTone(metrics.priority))}>
                Приоритет {metrics.priority}
              </div>
            </div>

            <div className="mt-3">
              <div className={`mb-1 flex items-center justify-between gap-3 text-[11px] ${isLight ? "text-zinc-500" : "text-white/42"}`}>
                <span>
                  {metrics.done}/{metrics.total || 0} {progressLabel}
                </span>
                <span>{metrics.pct}%</span>
              </div>
              <div className={`h-1.5 overflow-hidden rounded-full ${isLight ? "bg-zinc-200" : "bg-white/10"}`}>
                <div className={cn("h-full", progressTone(metrics.pct))} style={{ width: `${metrics.pct}%` }} />
              </div>
            </div>

            <div className={`mt-2 flex items-center justify-between gap-3 text-[11px] ${isLight ? "text-zinc-500" : "text-white/38"}`}>
              <span>{metrics.urgencyFull}</span>
              {hasKids ? <span>Дочерних: {children.length}</span> : null}
            </div>
          </button>
        </div>
      </div>

      {hasKids && !isCollapsed ? (
        <div className="space-y-2">
          {sortedChildren.map((childId) => (
            <BoardCardTreeItem
              key={childId}
              theme={theme}
              id={childId}
              byId={byId}
              childrenMap={childrenMap}
              metricsById={metricsById}
              level={level + 1}
              collapsed={collapsed}
              toggleCollapsed={toggleCollapsed}
              onHover={onHover}
              onHoverOut={onHoverOut}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              activeId={activeId}
              pathSet={nextPath}
              priorityTone={priorityTone}
              progressTone={progressTone}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
