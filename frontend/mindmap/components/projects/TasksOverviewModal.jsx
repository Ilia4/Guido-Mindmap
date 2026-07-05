import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CheckCircle2, Clock3, FolderKanban, ListTodo, StickyNote, X } from "lucide-react";
import { useEffect, useMemo } from "react";

import { formatDate, formatDateTime, isSameLocalDay } from "../../utils/mindmapPageUtils";
import { Button, IconBtn, Pill } from "../common/MindmapUi";

export default function TasksOverviewModal({
  open,
  onClose,
  loading,
  error,
  filter,
  onFilterChange,
  projectId,
  onProjectChange,
  projects,
  items,
  theme = "dark",
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isLight = theme === "light";
  const controlStyle = { colorScheme: isLight ? "light" : "dark" };

  const filteredItems = useMemo(() => {
    const source = !projectId ? items : items.filter((item) => item.projectId === String(projectId));
    const list = source.filter((item) => {
      if (filter === "completed") return item.done;
      if (filter === "pending") return !item.done;
      if (filter === "today") return item.done && isSameLocalDay(item.completedAt);
      return true;
    });

    return [...list].sort((left, right) => {
      if (filter === "pending") {
        const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDeadline - rightDeadline || left.title.localeCompare(right.title, "ru");
      }

      return (right.completedAt || 0) - (left.completedAt || 0);
    });
  }, [filter, items, projectId]);

  const titleMap = {
    completed: "Выполненные задачи",
    pending: "Задачи в ожидании",
    today: "Активность сегодня",
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-[90]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ y: 14, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 14, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-[980px]"
            >
              <div className={`rounded-3xl border p-5 shadow-2xl backdrop-blur ${isLight ? "border-zinc-300 bg-white/96 shadow-zinc-400/20" : "border-white/10 bg-zinc-950/90 shadow-black/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-base font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{titleMap[filter] || "Задачи"}</div>
                    <div className={`mt-1 text-sm ${isLight ? "text-zinc-500" : "text-white/60"}`}>
                      Можно переключать тип задач и смотреть детали по проектам и карточкам.
                    </div>
                  </div>

                  <IconBtn theme={theme} title="Закрыть" onClick={onClose} className="px-2 py-2">
                    <X className="h-4 w-4" />
                  </IconBtn>
                </div>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button theme={theme} variant={filter === "completed" ? "primary" : "secondary"} onClick={() => onFilterChange("completed")}>
                      Выполненные
                    </Button>
                    <Button theme={theme} variant={filter === "pending" ? "primary" : "secondary"} onClick={() => onFilterChange("pending")}>
                      В ожидании
                    </Button>
                    <Button theme={theme} variant={filter === "today" ? "primary" : "secondary"} onClick={() => onFilterChange("today")}>
                      Сегодня
                    </Button>
                  </div>

                  <div className="w-full lg:w-[320px]">
                    <select
                      value={projectId}
                      onChange={(event) => onProjectChange(event.target.value)}
                      style={controlStyle}
                      className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ${isLight ? "border-zinc-300 bg-white text-zinc-900 focus:ring-2 focus:ring-zinc-200" : "border-white/10 bg-white/5 text-white focus:ring-2 focus:ring-white/10"}`}
                    >
                      <option value="">Все проекты</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title || "Без названия проекта"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {error ? (
                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${isLight ? "border-amber-300 bg-amber-50 text-amber-800" : "border-amber-500/20 bg-amber-500/10 text-amber-100"}`}>
                    {error}
                  </div>
                ) : null}

                <div className={`mt-4 rounded-3xl border ${isLight ? "border-zinc-300 bg-zinc-50/70" : "border-white/10 bg-white/[0.03]"}`}>
                  <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 text-sm ${isLight ? "border-zinc-300 text-zinc-600" : "border-white/10 text-white/65"}`}>
                    <span>Найдено задач: {filteredItems.length}</span>
                    {projectId ? <span>Проект: {projects.find((project) => String(project.id) === String(projectId))?.title}</span> : null}
                  </div>

                  <div className="max-h-[62vh] overflow-auto p-3">
                    {loading ? (
                      <div className={`rounded-2xl border px-4 py-8 text-center text-sm ${isLight ? "border-zinc-300 bg-white text-zinc-500" : "border-white/10 bg-white/5 text-white/55"}`}>
                        Загружаю задачи...
                      </div>
                    ) : filteredItems.length === 0 ? (
                      <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLight ? "border-zinc-300 bg-white text-zinc-500" : "border-white/10 bg-white/[0.02] text-white/45"}`}>
                        Для выбранного фильтра задач пока нет.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredItems.map((task) => (
                          <div key={task.id} className={`rounded-2xl border px-4 py-4 ${isLight ? "border-zinc-300 bg-white" : "border-white/10 bg-zinc-900/70"}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`text-sm font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{task.title}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Pill theme={theme}>
                                    <FolderKanban className="h-3.5 w-3.5" />
                                    {task.projectTitle}
                                  </Pill>
                                  <Pill theme={theme}>
                                    <StickyNote className="h-3.5 w-3.5" />
                                    {task.cardTitle}
                                  </Pill>
                                </div>
                              </div>

                              <Pill
                                theme={theme}
                                className={
                                  task.done
                                    ? isLight
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                                    : isLight
                                      ? "border-amber-300 bg-amber-50 text-amber-800"
                                      : "border-amber-500/20 bg-amber-500/10 text-amber-100"
                                }
                              >
                                {task.done ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Выполнено
                                  </>
                                ) : (
                                  <>
                                    <Clock3 className="h-3.5 w-3.5" />
                                    В ожидании
                                  </>
                                )}
                              </Pill>
                            </div>

                            <div className={`mt-3 flex flex-wrap gap-2 text-xs ${isLight ? "text-zinc-600" : "text-white/70"}`}>
                              {task.deadline ? (
                                <Pill theme={theme}>
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  Дедлайн: {formatDate(task.deadline)}
                                </Pill>
                              ) : null}
                              {task.completedAt ? (
                                <Pill theme={theme}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Закрыта: {formatDateTime(task.completedAt)}
                                </Pill>
                              ) : null}
                              {task.responsible ? (
                                <Pill theme={theme}>
                                  <ListTodo className="h-3.5 w-3.5" />
                                  Ответственный: {task.responsible}
                                </Pill>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
