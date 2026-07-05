import { CheckCircle2, Layers3, ListTodo, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildCardProgressMap,
  collectBoardTasks,
  getCardPriorityValue,
  getImportanceLabel,
  getProjectTreeProgress,
  getUrgencyLabel,
  getUrgencyShortLabel,
  sortBoardTasks,
} from "../utils/boardMetrics";
import BoardCardTreeItem from "./board-tree/BoardCardTreeItem";
import BoardTreeProgressModal from "./board-tree/BoardTreeProgressModal";
import BoardTreeTaskItem from "./board-tree/BoardTreeTaskItem";

function uniq(arr) {
  return Array.from(new Set(arr));
}

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

function buildTree(cards, links) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const children = new Map();
  const indeg = new Map();

  for (const card of cards) {
    children.set(card.id, []);
    indeg.set(card.id, 0);
  }

  for (const link of links) {
    if (!byId.has(link.from) || !byId.has(link.to)) continue;
    children.get(link.from).push(link.to);
    indeg.set(link.to, (indeg.get(link.to) || 0) + 1);
  }

  for (const [id, items] of children.entries()) {
    children.set(id, uniq(items));
  }

  const roots = cards.filter((card) => (indeg.get(card.id) || 0) === 0).map((card) => card.id);
  return { byId, children, roots };
}

function priorityTone(priority) {
  if (priority >= 20) return "border-rose-400/25 bg-rose-500/12 text-rose-100";
  if (priority >= 10) return "border-amber-400/25 bg-amber-500/12 text-amber-100";
  if (priority >= 5) return "border-sky-400/25 bg-sky-500/12 text-sky-100";
  return "border-white/10 bg-white/5 text-white/70";
}

function progressTone(pct) {
  if (pct >= 100) return "bg-emerald-400/90";
  if (pct >= 70) return "bg-emerald-300/80";
  if (pct >= 40) return "bg-amber-300/80";
  if (pct >= 10) return "bg-orange-300/80";
  return "bg-white/10";
}

function MetricChip({ icon: Icon, label, value, light }) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${light ? "border-zinc-300 bg-white text-zinc-600" : "border-white/10 bg-white/[0.04] text-white/68"}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">
        {label}: {value}
      </span>
    </div>
  );
}

export default function BoardTreePanelContent({
  theme = "dark",
  cards,
  links,
  activeId,
  onHover,
  onHoverOut,
  onClick,
  onDoubleClick,
  title = "Карточки проекта",
}) {
  const [tab, setTab] = useState("tasks");
  const [showCompleted, setShowCompleted] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const isLight = theme === "light";

  const { byId, children, roots } = useMemo(() => buildTree(cards, links), [cards, links]);
  const progressById = useMemo(() => buildCardProgressMap(cards, links), [cards, links]);

  const metricsById = useMemo(() => {
    const cache = new Map();

    for (const card of cards) {
      const progress = progressById.get(String(card.id));
      cache.set(card.id, {
        priority: getCardPriorityValue(card),
        kind: progress?.kind === "children" ? "children" : "tasks",
        total: progress?.total ?? 0,
        done: progress?.done ?? 0,
        pct: progress?.pct ?? 0,
        urgencyFull: getUrgencyLabel(card?.urgency),
        urgencyShort: getUrgencyShortLabel(card?.urgency),
        importanceLabel: getImportanceLabel(card?.importance),
      });
    }

    return cache;
  }, [cards, progressById]);

  const taskItems = useMemo(() => collectBoardTasks(cards), [cards]);
  const pendingTasks = useMemo(() => sortBoardTasks(taskItems.filter((item) => !item.done), "priority"), [taskItems]);
  const completedTasks = useMemo(() => sortBoardTasks(taskItems.filter((item) => item.done), "priority"), [taskItems]);
  const summary = useMemo(() => getProjectTreeProgress(cards, links), [cards, links]);

  const toggleCollapsed = (id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sortedRoots = useMemo(() => {
    return [...roots].sort((leftId, rightId) => {
      const left = metricsById.get(leftId)?.priority ?? 0;
      const right = metricsById.get(rightId)?.priority ?? 0;
      if (right !== left) return right - left;
      const leftTitle = byId.get(leftId)?.title || "";
      const rightTitle = byId.get(rightId)?.title || "";
      return leftTitle.localeCompare(rightTitle, "ru");
    });
  }, [byId, metricsById, roots]);

  const orphaned = useMemo(() => {
    const seen = new Set();
    const stack = [...roots];

    while (stack.length) {
      const current = stack.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      const items = children.get(current) || [];
      for (const item of items) stack.push(item);
    }

    return cards.map((card) => card.id).filter((id) => !seen.has(id));
  }, [cards, roots, children]);

  const textSubtle = isLight ? "text-zinc-500" : "text-white/35";
  const textBase = isLight ? "text-zinc-900" : "text-white";
  const cardClass = isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]";
  const activeCardClass = isLight ? "border-zinc-900/30 bg-zinc-900/5 text-zinc-900" : "border-white/25 bg-white/[0.08]";

  return (
    <>
      <BoardTreeProgressModal theme={theme} open={progressOpen} onClose={() => setProgressOpen(false)} cards={cards} links={links} />

      <div className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-[11px] uppercase tracking-[0.16em] ${textSubtle}`}>{title}</div>
            <div className={`mt-1 text-xs ${isLight ? "text-zinc-500" : "text-white/45"}`}>Клик центрирует карточку, двойной клик открывает подробности.</div>
          </div>

          <button
            type="button"
            className={`rounded-xl border px-3 py-1.5 text-[11px] transition ${isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white/85"}`}
            onClick={() => setProgressOpen(true)}
          >
            График прогресса
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <MetricChip icon={ListTodo} label="Открытые" value={pendingTasks.length} light={isLight} />
          <MetricChip icon={CheckCircle2} label="Выполнено" value={completedTasks.length} light={isLight} />
          <MetricChip icon={Layers3} label="Карточек" value={cards.length} light={isLight} />
          <MetricChip icon={Sparkles} label="Прогресс" value={`${summary.pct}%`} light={isLight} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab("tasks")}
            className={cn("rounded-2xl border px-3 py-2 text-sm transition", tab === "tasks" ? (isLight ? "border-zinc-900 bg-zinc-900 text-white" : "border-white/20 bg-white/10 text-white") : cardClass)}
          >
            Задачи
          </button>
          <button
            type="button"
            onClick={() => setTab("cards")}
            className={cn("rounded-2xl border px-3 py-2 text-sm transition", tab === "cards" ? (isLight ? "border-zinc-900 bg-zinc-900 text-white" : "border-white/20 bg-white/10 text-white") : cardClass)}
          >
            Карточки
          </button>
        </div>

        <div className="tree-scroll flex-1 space-y-3 overflow-auto pr-1">
          {tab === "tasks" ? (
            <>
              {pendingTasks.length ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className={`text-[11px] uppercase tracking-[0.14em] ${textSubtle}`}>В ожидании</div>
                    <div className={`text-[11px] ${isLight ? "text-zinc-400" : "text-white/38"}`}>Сортировка по приоритету</div>
                  </div>

                  {pendingTasks.map((item) => (
                    <BoardTreeTaskItem
                      key={item.id}
                      theme={theme}
                      item={item}
                      activeId={activeId}
                      onHover={onHover}
                      onHoverOut={onHoverOut}
                      onClick={onClick}
                      onDoubleClick={onDoubleClick}
                      priorityTone={priorityTone}
                    />
                  ))}
                </div>
              ) : (
                <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLight ? "border-zinc-300 bg-zinc-50 text-zinc-500" : "border-white/10 bg-white/[0.02] text-white/45"}`}>
                  В этом проекте пока нет открытых задач.
                </div>
              )}

              {completedTasks.length ? (
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCompleted((value) => !value)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition ${isLight ? "border-zinc-300 bg-white hover:bg-zinc-50" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                  >
                    <div>
                      <div className={`text-[11px] uppercase tracking-[0.14em] ${textSubtle}`}>Выполненные</div>
                      <div className={`mt-1 text-sm ${isLight ? "text-zinc-700" : "text-white/75"}`}>{completedTasks.length} задач</div>
                    </div>

                    <div className={`rounded-xl border p-1 ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-700" : "border-white/10 bg-white/5 text-white/65"}`}>
                      {showCompleted ? "−" : "+"}
                    </div>
                  </button>

                  {showCompleted ? (
                    <div className="space-y-2">
                      {completedTasks.map((item) => (
                        <BoardTreeTaskItem
                          key={item.id}
                          theme={theme}
                          item={item}
                          activeId={activeId}
                          onHover={onHover}
                          onHoverOut={onHoverOut}
                          onClick={onClick}
                          onDoubleClick={onDoubleClick}
                          priorityTone={priorityTone}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {sortedRoots.length ? (
                sortedRoots.map((rootId) => (
                  <BoardCardTreeItem
                    key={rootId}
                    theme={theme}
                    id={rootId}
                    byId={byId}
                    childrenMap={children}
                    metricsById={metricsById}
                    level={0}
                    collapsed={collapsed}
                    toggleCollapsed={toggleCollapsed}
                    onHover={onHover}
                    onHoverOut={onHoverOut}
                    onClick={onClick}
                    onDoubleClick={onDoubleClick}
                    activeId={activeId}
                    pathSet={new Set()}
                    priorityTone={priorityTone}
                    progressTone={progressTone}
                  />
                ))
              ) : (
                <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLight ? "border-zinc-300 bg-zinc-50 text-zinc-500" : "border-white/10 bg-white/[0.02] text-white/45"}`}>
                  Не удалось определить корневые карточки. Возможно, в связях есть цикл.
                </div>
              )}

              {orphaned.length ? (
                <div className="pt-2">
                  <div className={`mb-2 text-[11px] uppercase tracking-[0.14em] ${textSubtle}`}>Прочие карточки</div>
                  <div className="space-y-2">
                    {orphaned.map((id) => {
                      const card = byId.get(id);
                      const metrics = metricsById.get(id);
                      if (!card || !metrics) return null;

                      return (
                        <button
                          key={id}
                          type="button"
                          onMouseEnter={() => onHover?.(id)}
                          onMouseLeave={() => onHoverOut?.()}
                          onClick={() => onClick?.(id)}
                          onDoubleClick={() => onDoubleClick?.(id)}
                          className={cn("w-full rounded-2xl border px-3 py-3 text-left transition", activeId === id ? activeCardClass : cardClass)}
                          title={card.title || "Без названия"}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`text-sm font-medium ${textBase}`}>{card.title || "Без названия"}</div>
                              <div className={`mt-1 text-[11px] ${isLight ? "text-zinc-500" : "text-white/40"}`}>{metrics.urgencyFull}</div>
                            </div>
                            <div className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", priorityTone(metrics.priority))}>
                              Приоритет {metrics.priority}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
