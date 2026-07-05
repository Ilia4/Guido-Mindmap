import { useMemo, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Image as ImageIcon,
  MoveDiagonal2,
  Paperclip,
} from "lucide-react";

import {
  calculateTaskPriority,
  clamp,
  getCardPriorityValue,
  getImportanceLabel,
  getTaskItems,
  getUrgencyLabel,
} from "./utils/boardMetrics";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

function calcProgress(card) {
  if (card?.progressMetrics) {
    const total = Math.max(0, Number(card.progressMetrics.total ?? 0) || 0);
    const done = clamp(Math.round(Number(card.progressMetrics.done ?? 0) || 0), 0, total || 0);
    const pct = clamp(Math.round(Number(card.progressMetrics.pct ?? 0) || 0), 0, 100);
    return {
      kind: card.progressMetrics.kind === "children" ? "children" : "tasks",
      total,
      done,
      pct,
    };
  }

  const total = Number(card?.tasksTotal ?? card?.tasks?.length ?? 0);
  const done = Number(card?.tasksDone ?? (Array.isArray(card?.tasks) ? card.tasks.filter((task) => task.done).length : 0));

  if (!total) return { kind: "tasks", total: 0, done: 0, pct: 0 };
  const pct = clamp(Math.round((done / total) * 100), 0, 100);
  return { kind: "tasks", total, done, pct };
}

function calcTaskProgress(card) {
  const tasks = getTaskItems(card);
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return { total, done };
}

function normalizeTasks(card) {
  return getTaskItems(card).map((task) => ({
    id: task.id,
    title: task.title,
    done: task.done,
    deadline: task.deadline,
    responsible: task.responsible,
    priority: calculateTaskPriority(task, card),
  }));
}

function taskMeta(task) {
  const parts = [];
  if (task.deadline) parts.push(`до ${task.deadline}`);
  if (task.responsible) parts.push(task.responsible);
  return parts.join(" • ");
}

export default function BoardCard({ theme = "dark", card, onOpen, onResizeStart, className = "" }) {
  const [tasksOpen, setTasksOpen] = useState(false);
  const isLight = theme === "light";

  const title = card?.title ?? "Без названия";
  const importance = getImportanceLabel(card?.importance);
  const urgency = getUrgencyLabel(card?.urgency);
  const totalHours = Number(card?.totalHours ?? 0);
  const docsCount = Number(card?.docsCount ?? 0);
  const imagesCount = Number(card?.imagesCount ?? 0);
  const width = Math.max(340, Number(card?.width ?? 420) || 420);
  const minHeight = Math.max(220, Number(card?.height ?? 260) || 260);
  const priority = getCardPriorityValue(card);

  const widthScale = width / 420;
  const heightScale = minHeight / 260;
  const typeScale = Math.max(1.22, Math.pow(widthScale * 0.68 + heightScale * 0.32, 0.58) * 1.2);
  const titleSize = clamp(Math.round(20 * typeScale), 20, 52);
  const chipSize = clamp(Math.round(13 * typeScale), 13, 26);
  const bodyPadding = clamp(Math.round(18 * typeScale), 18, 34);
  const topBarHeight = clamp(Math.round(46 * typeScale), 46, 82);
  const taskLabelSize = clamp(Math.round(14 * typeScale), 14, 28);
  const helperSize = clamp(Math.round(12.5 * typeScale), 12, 22);

  const tasks = useMemo(() => normalizeTasks(card), [card]);
  const sortedTasks = useMemo(() => [...tasks].sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0)), [tasks]);
  const visibleTasks = tasksOpen ? sortedTasks.slice(0, 5) : [];
  const hiddenTasksCount = Math.max(0, tasks.length - visibleTasks.length);

  const { total, done, pct, kind } = calcProgress(card);
  const { total: taskTotal, done: taskDone } = calcTaskProgress(card);
  const progressLabel = kind === "children" ? "веток" : "задач";

  const progressColor =
    pct >= 100
      ? "bg-emerald-400/90"
      : pct >= 70
      ? "bg-emerald-300/80"
      : pct >= 40
      ? "bg-amber-300/80"
      : pct >= 10
      ? "bg-orange-300/80"
      : "bg-rose-400/80";

  function handleOpen(event) {
    event?.stopPropagation?.();
    onOpen?.(card);
  }

  function stopEvent(event) {
    event.stopPropagation();
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur shadow-xl select-none",
        isLight ? "border-zinc-300/80 bg-white/92 text-zinc-900 shadow-zinc-400/15" : "border-white/10 bg-zinc-950/70 text-white shadow-black/30",
        className
      )}
      style={{
        width,
        minHeight,
        borderColor: card?.color || undefined,
      }}
      onDoubleClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpen(event);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className={`relative ${isLight ? "bg-zinc-100" : "bg-white/5"}`} style={{ height: topBarHeight }}>
        <div className="absolute inset-0 opacity-70" />
        <div className={cn("h-full", progressColor)} style={{ width: `${pct}%` }} />
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <div className="font-semibold text-zinc-950" style={{ fontSize: chipSize }}>
            {pct}%
          </div>
          <div className="text-zinc-950/80" style={{ fontSize: chipSize }}>
            {done}/{total || 0} {progressLabel}
          </div>
        </div>
      </div>

      <div style={{ padding: bodyPadding, paddingBottom: bodyPadding + 14 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`truncate font-semibold ${isLight ? "text-zinc-900" : "text-white"}`} style={{ fontSize: titleSize, lineHeight: 1.22 }}>
              {title}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2" style={{ fontSize: chipSize }}>
              <span className={`rounded-full border px-2 py-0.5 ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/70"}`}>
                Важность: {importance}
              </span>
              <span className={`rounded-full border px-2 py-0.5 ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/70"}`}>
                Срочность: {urgency}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
                isLight
                  ? "border-amber-300 bg-amber-100 text-amber-900"
                  : "border-amber-400/20 bg-amber-500/10 text-amber-100"
              }`}
              style={{ fontSize: chipSize }}
            >
              Приоритет: {priority}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${isLight ? "border-zinc-300 bg-zinc-100 text-zinc-600" : "border-white/10 bg-white/5 text-white/75"}`} style={{ fontSize: chipSize }}>
              <Clock className="h-3.5 w-3.5" />
              {Number.isFinite(totalHours) ? `${totalHours.toFixed(1)} ч` : "—"}
            </span>
          </div>
        </div>

        <div className={`mt-3 flex flex-wrap gap-2 ${isLight ? "text-zinc-600" : "text-white/70"}`} style={{ fontSize: chipSize }}>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${isLight ? "border-zinc-300 bg-zinc-100" : "border-white/10 bg-white/5"}`}>
            <Paperclip className="h-3.5 w-3.5" />
            Док: {docsCount}
          </span>

          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${isLight ? "border-zinc-300 bg-zinc-100" : "border-white/10 bg-white/5"}`}>
            <ImageIcon className="h-3.5 w-3.5" />
            Изобр: {imagesCount}
          </span>

          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${isLight ? "border-zinc-300 bg-zinc-100" : "border-white/10 bg-white/5"}`}>
            <CheckSquare className="h-3.5 w-3.5" />
            Задачи: {taskTotal}
          </span>
        </div>

        <div className={`mt-3 rounded-2xl border ${isLight ? "border-zinc-300 bg-zinc-50/90" : "border-white/10 bg-black/20"}`} onPointerDown={stopEvent} onClick={stopEvent}>
          <button
            type="button"
            onPointerDown={stopEvent}
            onClick={() => setTasksOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          >
            <div className="min-w-0">
              <div className={`uppercase tracking-[0.14em] ${isLight ? "text-zinc-500" : "text-white/40"}`} style={{ fontSize: helperSize }}>
                Список задач
              </div>
              <div className={isLight ? "mt-1 text-zinc-700" : "mt-1 text-white/78"} style={{ fontSize: taskLabelSize }}>
                {tasks.length ? `${taskDone} из ${tasks.length} выполнено` : "Задач пока нет"}
              </div>
            </div>

            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${isLight ? "border-zinc-300 bg-white text-zinc-600" : "border-white/10 bg-white/5 text-white/70"}`}>
              {tasksOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {tasksOpen && tasks.length ? (
            <div className={`border-t px-3 pb-3 pt-2 ${isLight ? "border-zinc-300" : "border-white/10"}`}>
              <div className="space-y-2">
                {visibleTasks.map((task) => (
                  <div key={task.id} className={`rounded-xl border px-3 py-2 ${isLight ? "border-zinc-300 bg-white" : "border-white/10 bg-white/[0.03]"}`}>
                    <div className="flex items-start gap-2">
                      <div
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                          task.done
                            ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
                            : isLight
                            ? "border-zinc-300 bg-zinc-100 text-zinc-400"
                            : "border-white/10 bg-white/5 text-white/45"
                        )}
                      >
                        {task.done ? "✓" : ""}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className={cn("font-medium", task.done ? (isLight ? "text-zinc-400 line-through" : "text-white/45 line-through") : isLight ? "text-zinc-900" : "text-white/85")} style={{ fontSize: taskLabelSize }}>
                          {task.title}
                        </div>
                        {!task.done ? (
                          <div className={isLight ? "mt-1 text-zinc-500" : "mt-1 text-white/40"} style={{ fontSize: helperSize }}>
                            Приоритет: {Math.max(1, Math.floor(Number(task.priority || 0) + 0.5))}
                          </div>
                        ) : null}
                        {taskMeta(task) ? (
                          <div className={isLight ? "mt-1 text-zinc-500" : "mt-1 text-white/45"} style={{ fontSize: helperSize }}>
                            {taskMeta(task)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {hiddenTasksCount > 0 ? (
                <div className={isLight ? "mt-2 text-zinc-500" : "mt-2 text-white/40"} style={{ fontSize: helperSize }}>
                  Ещё {hiddenTasksCount} задач в подробной карточке.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={isLight ? "mt-3 text-zinc-500" : "mt-3 text-white/35"} style={{ fontSize: helperSize }}>
          Клик по карточке открывает подробности
        </div>
      </div>

      <button
        type="button"
        title="Изменить размер карточки"
        className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-xl border transition ${isLight ? "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700" : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80"}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onResizeStart?.(event, card);
        }}
        onClick={stopEvent}
      >
        <MoveDiagonal2 className="h-4 w-4" />
      </button>
    </div>
  );
}
