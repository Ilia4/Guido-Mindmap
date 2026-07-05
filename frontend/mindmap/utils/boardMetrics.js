export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export const IMPORTANCE_LABELS = {
  10: "10 000 000₽",
  9: "5 000 000₽",
  8: "1 000 000₽",
  7: "100 000₽",
  6: "50 000₽",
  5: "30 000₽",
  4: "10 000₽",
  3: "1 000₽",
  2: "хорошие бы, но не более того",
  1: "прикольно",
};

export const URGENCY_LABELS = {
  10: "сейчас",
  9: "сегодня",
  8: "ближайшие три дня",
  7: "в течение недели",
  6: "в течение двух недель",
  5: "в течение месяца",
  4: "в течение двух месяцев",
  3: "в течение трёх месяцев",
  2: "в течение полугода",
  1: "в течение года",
};

const URGENCY_SHORT_LABELS = {
  10: "сейчас",
  9: "сегодня",
  8: "3 дня",
  7: "неделя",
  6: "2 недели",
  5: "месяц",
  4: "2 месяца",
  3: "3 месяца",
  2: "полгода",
  1: "год",
};

export function normalizeScaleValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return rounded >= 1 && rounded <= 10 ? rounded : null;
}

export function getImportanceLabel(value, fallback = "Не задано") {
  const normalized = normalizeScaleValue(value);
  return normalized ? IMPORTANCE_LABELS[normalized] || String(normalized) : fallback;
}

export function getUrgencyLabel(value, fallback = "Не задано") {
  const normalized = normalizeScaleValue(value);
  return normalized ? URGENCY_LABELS[normalized] || String(normalized) : fallback;
}

export function getUrgencyShortLabel(value, fallback = "Без срока") {
  const normalized = normalizeScaleValue(value);
  return normalized ? URGENCY_SHORT_LABELS[normalized] || getUrgencyLabel(normalized, fallback) : fallback;
}

export function taskDone(task) {
  return Boolean(task?.done ?? task?.checked ?? false);
}

export function normalizeTask(task, index = 0) {
  return {
    id: String(task?.id ?? `task_${index}`),
    title: String(task?.title ?? task?.text ?? "").trim() || "Без названия задачи",
    done: taskDone(task),
    time: Number.isFinite(Number(task?.time)) ? Number(task.time) : 0,
    deadline: String(task?.deadline ?? "").trim(),
    responsible: String(task?.responsibleName ?? task?.responsible ?? "").trim(),
    importance: normalizeScaleValue(task?.importance),
    urgency: normalizeScaleValue(task?.urgency),
    completedAt: task?.completedAt ?? task?.completed_at ?? null,
  };
}

export function getTaskItems(card) {
  const source = Array.isArray(card?.tasks)
    ? card.tasks
    : Array.isArray(card?.checklist)
    ? card.checklist
    : [];

  return source.map((task, index) => normalizeTask(task, index));
}

export function roundPriority(number) {
  const value = Number(number);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value > 0 && value < 1) return 1;
  return Math.floor(value + 0.5);
}

export function calculateTaskPriority(task, card) {
  if (taskDone(task)) return 0;

  const normalizedTask = normalizeTask(task);
  const timeValue = normalizedTask.time > 0 ? normalizedTask.time : 1;
  const importance = normalizedTask.importance ?? normalizeScaleValue(card?.importance) ?? 1;
  const urgency = normalizedTask.urgency ?? normalizeScaleValue(card?.urgency) ?? 1;

  return (importance * urgency) / timeValue;
}

export function getTaskPriorityValue(task, card) {
  return roundPriority(calculateTaskPriority(task, card));
}

export function getCardProgress(card) {
  const tasks = getTaskItems(card);
  const total = Number(card?.tasksTotal ?? tasks.length ?? 0);
  const done =
    Number(card?.tasksDone) ||
    tasks.reduce((sum, task) => sum + (task.done ? 1 : 0), 0);

  return {
    total,
    done,
    pending: Math.max(0, total - done),
    pct: total ? clamp(Math.round((done / total) * 100), 0, 100) : 0,
  };
}

function buildCardGraph(cards, links) {
  const sourceCards = Array.isArray(cards) ? cards : [];
  const byId = new Map();

  sourceCards.forEach((card) => {
    const id = String(card?.id ?? "").trim();
    if (!id) return;
    byId.set(id, card);
  });

  const children = new Map();
  const indeg = new Map();

  for (const id of byId.keys()) {
    children.set(id, []);
    indeg.set(id, 0);
  }

  for (const link of Array.isArray(links) ? links : []) {
    const from = String(link?.from ?? "").trim();
    const to = String(link?.to ?? "").trim();
    if (!from || !to || from === to) continue;
    if (!byId.has(from) || !byId.has(to)) continue;

    const nextChildren = children.get(from);
    if (!nextChildren || nextChildren.includes(to)) continue;

    nextChildren.push(to);
    indeg.set(to, (indeg.get(to) || 0) + 1);
  }

  const roots = Array.from(byId.keys()).filter((id) => (indeg.get(id) || 0) === 0);
  return { byId, children, roots };
}

function normalizeProgressMetric(metric, fallbackKind = "tasks") {
  const total = Math.max(0, Number(metric?.total ?? 0) || 0);
  const done = clamp(Math.round(Number(metric?.done ?? 0) || 0), 0, total || 0);
  const pctValue = Number(metric?.pct ?? 0);
  const pct = clamp(Math.round(Number.isFinite(pctValue) ? pctValue : 0), 0, 100);

  return {
    kind: metric?.kind === "children" ? "children" : fallbackKind,
    total,
    done,
    pending: Math.max(0, total - done),
    pct,
  };
}

function buildCardProgressMapWith(cards, links, leafProgressResolver) {
  const { byId, children } = buildCardGraph(cards, links);
  const cache = new Map();
  const visiting = new Set();

  const visit = (cardId) => {
    const id = String(cardId ?? "").trim();
    if (!id || !byId.has(id)) return normalizeProgressMetric(null);
    if (cache.has(id)) return cache.get(id);

    const card = byId.get(id);
    const leafProgress = normalizeProgressMetric(leafProgressResolver(card), "tasks");
    const childIds = children.get(id) || [];

    if (!childIds.length) {
      cache.set(id, leafProgress);
      return leafProgress;
    }

    if (visiting.has(id)) {
      return leafProgress;
    }

    visiting.add(id);

    const childMetrics = childIds.map((childId) => visit(childId));
    visiting.delete(id);

    const total = childIds.length;
    const done = childMetrics.filter((metric) => metric.pct >= 100).length;
    const pct = total
      ? clamp(
          Math.round(childMetrics.reduce((sum, metric) => sum + Number(metric?.pct ?? 0), 0) / total),
          0,
          100
        )
      : leafProgress.pct;

    const branchProgress = normalizeProgressMetric(
      {
        kind: "children",
        total,
        done,
        pct,
      },
      "children"
    );

    cache.set(id, branchProgress);
    return branchProgress;
  };

  for (const id of byId.keys()) {
    visit(id);
  }

  return cache;
}

export function buildCardProgressMap(cards, links) {
  return buildCardProgressMapWith(cards, links, (card) => getCardProgress(card));
}

function summarizeTreeProgress(cards, links, progressById) {
  const { byId, roots } = buildCardGraph(cards, links);
  const summaryIds = (roots.length ? roots : Array.from(byId.keys())).filter((id) => progressById.has(id));
  const total = summaryIds.length;
  const done = summaryIds.filter((id) => (progressById.get(id)?.pct ?? 0) >= 100).length;
  const pct = total
    ? clamp(
        Math.round(summaryIds.reduce((sum, id) => sum + Number(progressById.get(id)?.pct ?? 0), 0) / total),
        0,
        100
      )
    : 0;

  return {
    total,
    done,
    pending: Math.max(0, total - done),
    pct,
  };
}

export function getProjectTreeProgress(cards, links) {
  const progressById = buildCardProgressMap(cards, links);
  return summarizeTreeProgress(cards, links, progressById);
}

export function getCardPriority(card) {
  const tasks = getTaskItems(card).filter((task) => !task.done);
  if (tasks.length) {
    return Math.max(...tasks.map((task) => calculateTaskPriority(task, card)));
  }

  const importance = normalizeScaleValue(card?.importance) ?? 1;
  const urgency = normalizeScaleValue(card?.urgency) ?? 1;
  const timeValue = Number(card?.totalHours) > 0 ? Number(card.totalHours) : 1;
  return (importance * urgency) / timeValue;
}

export function getCardPriorityValue(card) {
  return roundPriority(getCardPriority(card));
}

export function getProjectProgress(cards) {
  const tasks = (Array.isArray(cards) ? cards : []).flatMap((card) => getTaskItems(card));
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return {
    total,
    done,
    pending: Math.max(0, total - done),
    pct: total ? clamp(Math.round((done / total) * 100), 0, 100) : 0,
  };
}

function parseCompletedTime(task, fallbackTime) {
  if (!task.done) return null;
  const raw = task.completedAt;
  if (!raw) return fallbackTime;
  const value = new Date(raw).getTime();
  return Number.isNaN(value) ? fallbackTime : value;
}

function parseDeadlineTime(deadline) {
  if (!deadline) return Number.POSITIVE_INFINITY;
  const value = new Date(deadline).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function collectBoardTasks(cards) {
  const source = Array.isArray(cards) ? cards : [];
  const items = [];

  source.forEach((card) => {
    const tasks = getTaskItems(card);
    const cardPriority = getCardPriorityValue(card);

    tasks.forEach((task, index) => {
      const priority = calculateTaskPriority(task, card);
      const priorityValue = roundPriority(priority);

      items.push({
        id: `${card?.id ?? "card"}:${task.id || index}`,
        cardId: String(card?.id ?? ""),
        cardTitle: String(card?.title ?? card?.content ?? "").trim() || "Без названия карточки",
        taskId: String(task.id || index),
        title: task.title,
        done: task.done,
        time: Number(task.time || 0),
        deadline: task.deadline,
        responsible: task.responsible,
        completedAt: task.completedAt,
        importance: task.importance ?? normalizeScaleValue(card?.importance),
        urgency: task.urgency ?? normalizeScaleValue(card?.urgency),
        priority,
        priorityValue,
        fallbackCardPriority: cardPriority,
      });
    });
  });

  return items;
}

export function sortBoardTasks(items, sortMode = "priority") {
  const list = [...(Array.isArray(items) ? items : [])];

  return list.sort((left, right) => {
    if (sortMode === "deadline") {
      const deadlineDiff = parseDeadlineTime(left.deadline) - parseDeadlineTime(right.deadline);
      if (deadlineDiff !== 0) return deadlineDiff;
    }

    if (sortMode === "time") {
      const leftTime = Number(left?.time ?? 0);
      const rightTime = Number(right?.time ?? 0);
      if (rightTime !== leftTime) return rightTime - leftTime;
    }

    const rightPriority = Number(right?.priority ?? right?.fallbackCardPriority ?? 0);
    const leftPriority = Number(left?.priority ?? left?.fallbackCardPriority ?? 0);
    if (rightPriority !== leftPriority) return rightPriority - leftPriority;

    const leftDeadline = parseDeadlineTime(left.deadline);
    const rightDeadline = parseDeadlineTime(right.deadline);
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;

    return String(left?.title ?? "").localeCompare(String(right?.title ?? ""), "ru");
  });
}

export function buildProjectProgressSeries(cards, days = 7) {
  const tasks = (Array.isArray(cards) ? cards : []).flatMap((card) => getTaskItems(card));
  const total = tasks.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fallbackTime = today.getTime();

  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - index));

    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);
    const endMs = endOfDay.getTime();

    const completed = tasks.filter((task) => {
      const completedAt = parseCompletedTime(task, fallbackTime);
      return completedAt !== null && completedAt <= endMs;
    }).length;

    return {
      key: `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`,
      label: `${String(day.getDate()).padStart(2, "0")}.${String(day.getMonth() + 1).padStart(2, "0")}`,
      completed,
      total,
      progress: total ? clamp(Math.round((completed / total) * 100), 0, 100) : 0,
    };
  });
}

export function buildProjectTreeProgressSeries(cards, links, days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fallbackTime = today.getTime();

  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - index));

    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);
    const endMs = endOfDay.getTime();

    const progressById = buildCardProgressMapWith(cards, links, (card) => {
      const tasks = getTaskItems(card);
      const total = Number(card?.tasksTotal ?? tasks.length ?? 0);
      const done = tasks.filter((task) => {
        const completedAt = parseCompletedTime(task, fallbackTime);
        return completedAt !== null && completedAt <= endMs;
      }).length;

      return {
        kind: "tasks",
        total,
        done,
        pct: total ? clamp(Math.round((done / total) * 100), 0, 100) : 0,
      };
    });

    const summary = summarizeTreeProgress(cards, links, progressById);

    return {
      key: `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`,
      label: `${String(day.getDate()).padStart(2, "0")}.${String(day.getMonth() + 1).padStart(2, "0")}`,
      completed: summary.done,
      total: summary.total,
      progress: summary.pct,
    };
  });
}
