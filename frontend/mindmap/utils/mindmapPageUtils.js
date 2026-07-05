export function createLocalProjectId() {
  return "p_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function formatDate(ts) {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(ts) {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseTaskTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function isSameLocalDay(ts, nowTs = Date.now()) {
  if (!ts) return false;
  const a = new Date(ts);
  const b = new Date(nowTs);

  return (
    !Number.isNaN(a.getTime()) &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function taskDone(task) {
  return Boolean(task?.done ?? task?.checked ?? false);
}

export function collectProjectTasks(project, board) {
  const cards = Array.isArray(board?.cards) ? board.cards : [];
  const items = [];

  cards.forEach((card) => {
    const taskSource = Array.isArray(card?.tasks)
      ? card.tasks
      : Array.isArray(card?.checklist)
      ? card.checklist
      : [];

    taskSource.forEach((task, index) => {
      const done = taskDone(task);
      const completedAt = parseTaskTimestamp(task?.completedAt ?? task?.completed_at);

      items.push({
        id: `${project.id}:${card?.id ?? "card"}:${task?.id ?? index}`,
        projectId: String(project.id),
        projectTitle: project.title || "Без названия проекта",
        cardId: String(card?.id ?? ""),
        cardTitle: card?.title || card?.content || "Без названия карточки",
        title: String(task?.title ?? task?.text ?? "").trim() || "Без названия задачи",
        done,
        completedAt,
        deadline: String(task?.deadline ?? "").trim(),
        responsible: String(task?.responsibleName ?? task?.responsible ?? "").trim(),
      });
    });
  });

  return items;
}

export function buildTaskStats(items) {
  const list = Array.isArray(items) ? items : [];
  const now = Date.now();

  return {
    items: list,
    completed: list.filter((item) => item.done).length,
    pending: list.filter((item) => !item.done).length,
    today: list.filter((item) => item.done && isSameLocalDay(item.completedAt, now)).length,
  };
}

export function normalizeShareItem(item) {
  return {
    userId: Number(item?.user_id ?? item?.userId ?? 0),
    username: String(item?.username ?? "").trim(),
    email: String(item?.email ?? "").trim(),
    permission: String(item?.permission ?? "write").trim().toLowerCase() === "read" ? "read" : "write",
    lastActive: item?.last_active
      ? new Date(item.last_active).getTime()
      : item?.lastActive
      ? new Date(item.lastActive).getTime()
      : null,
  };
}

export function sharePermissionLabel(permission) {
  return permission === "read" ? "Просмотр" : "Редактирование";
}
