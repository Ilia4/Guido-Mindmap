import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckSquare,
  Clock,
  Image as ImageIcon,
  Palette,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getImportanceLabel, getUrgencyLabel } from "../utils/boardMetrics";

const cn = (...parts) => parts.filter(Boolean).join(" ");
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = (p = "t") => `${p}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

const scale = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : null;
};

const bytes = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1048576).toFixed(1)} МБ`;
};

const toUrl = (base, value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const normalizedBase = String(base || "").replace(/\/+$/, "");
  return raw.startsWith("/")
    ? normalizedBase
      ? `${normalizedBase}${raw}`
      : raw
    : normalizedBase
      ? `${normalizedBase}/${raw.replace(/^\/+/, "")}`
      : raw;
};

const normTask = (task, index = 0) => ({
  id: String(task?.id ?? uid(`task${index}`)),
  title: String(task?.title ?? task?.text ?? "").trim(),
  done: Boolean(task?.done ?? task?.checked ?? false),
  description: String(task?.description ?? "").trim(),
  time: Number.isFinite(Number(task?.time)) ? Number(task.time) : 0,
  deadline: String(task?.deadline ?? ""),
  responsible: String(task?.responsibleName ?? task?.responsible ?? "").trim(),
  responsibleId: task?.responsibleId ?? null,
  completedAt: task?.completedAt ?? task?.completed_at ?? null,
});

const normDoc = (doc, index = 0) => ({
  id: String(doc?.id ?? doc?.docId ?? uid(`doc${index}`)),
  dbId: Number.isFinite(Number(doc?.id)) ? Number(doc.id) : doc?.dbId ?? null,
  docId: String(doc?.docId ?? doc?.id ?? uid(`docref${index}`)),
  name: String(doc?.name ?? "Документ").trim() || "Документ",
  file_url: String(doc?.file_url ?? "").trim(),
  type: String(doc?.type ?? "application/octet-stream"),
  size: Number.isFinite(Number(doc?.size)) ? Number(doc.size) : 0,
});

function norm(card) {
  if (!card) return null;
  const rest = { ...card };
  delete rest.progressMetrics;
  const sourceTasks = Array.isArray(card.tasks) ? card.tasks : Array.isArray(card.checklist) ? card.checklist : [];
  return {
    ...rest,
    archived: Boolean(card?.archived ?? false),
    title: String(card.title ?? card.content ?? "").trim(),
    content: String(card.content ?? card.title ?? "").trim(),
    importance: scale(card.importance),
    urgency: scale(card.urgency),
    deadline: String(card.deadline ?? ""),
    color: String(card.color ?? "#71717a"),
    documents: Array.isArray(card.documents) ? card.documents.map((item, index) => normDoc(item, index)) : [],
    tasks: sourceTasks.map((task, index) => normTask(task, index)),
  };
}

const splitDocs = (card) => {
  const docs = Array.isArray(card?.documents) ? card.documents : [];
  const images = docs.filter((doc) => String(doc?.type || "").startsWith("image/"));
  const files = docs.filter((doc) => !String(doc?.type || "").startsWith("image/"));
  return {
    files,
    images,
    docsCount: docs.length ? files.length : Number(card?.docsCount ?? 0),
    imagesCount: docs.length ? images.length : Number(card?.imagesCount ?? 0),
  };
};

const totalHours = (card) => {
  const tasks = Array.isArray(card?.tasks) ? card.tasks : [];
  const taskHours = tasks.reduce((sum, task) => sum + (Number.isFinite(task.time) ? task.time : 0), 0);
  if (taskHours > 0) return taskHours;
  const base = Number(card?.totalHours ?? 0);
  return Number.isFinite(base) ? base : 0;
};

const progress = (card, externalMetrics) => {
  if (externalMetrics?.kind === "children") {
    const total = Math.max(0, Number(externalMetrics.total ?? 0) || 0);
    const done = clamp(Math.round(Number(externalMetrics.done ?? 0) || 0), 0, total || 0);
    const pct = clamp(Math.round(Number(externalMetrics.pct ?? 0) || 0), 0, 100);
    return { kind: "children", total, done, pct };
  }

  const tasks = Array.isArray(card?.tasks) ? card.tasks : [];
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return { kind: "tasks", total, done, pct: total ? clamp(Math.round((done / total) * 100), 0, 100) : 0 };
};

function payload(card) {
  const rest = { ...(card || {}) };
  delete rest.progressMetrics;
  const tasks = (Array.isArray(card?.tasks) ? card.tasks : []).map((task) => ({
    id: task.id,
    title: task.title,
    done: !!task.done,
    description: task.description || "",
    time: Number.isFinite(Number(task.time)) ? Number(task.time) : 0,
    deadline: task.deadline || "",
    responsible: task.responsible || "",
    responsibleId: task.responsibleId ?? null,
    completedAt: task.completedAt ?? null,
  }));
  const { docsCount, imagesCount } = splitDocs(card);
  return {
    ...rest,
    title: card?.title?.trim() || "Без названия",
    content: card?.title?.trim() || "Без названия",
    archived: Boolean(card?.archived ?? false),
    importance: card?.importance ?? null,
    urgency: card?.urgency ?? null,
    deadline: card?.deadline || "",
    color: card?.color || "#71717a",
    tasks,
    tasksTotal: tasks.length,
    tasksDone: tasks.filter((task) => task.done).length,
    totalHours: totalHours({ ...rest, tasks }),
    docsCount,
    imagesCount,
    checklist: tasks.map((task) => ({
      id: task.id,
      text: task.title,
      checked: task.done,
      description: task.description || "",
      time: task.time,
      deadline: task.deadline || "",
      responsible: task.responsible || "",
      responsibleId: task.responsibleId ?? null,
      responsibleName: task.responsible || "",
      completedAt: task.completedAt ?? null,
    })),
  };
}

function Chip({ icon: Icon, label, value, light = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        light ? "border-zinc-300 bg-white text-zinc-700 shadow-sm shadow-zinc-200/50" : "border-white/10 bg-white/5 text-white/70"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}: {value}
    </span>
  );
}

function FieldLabel({ icon: Icon, children, light = false }) {
  return (
    <label className={`mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] ${light ? "text-zinc-500" : "text-white/40"}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </label>
  );
}

export default function CardDetailsModal({
  open,
  theme = "dark",
  card,
  onClose,
  onSave,
  onDelete,
  onToggleArchive,
  onUploadDocument,
  onDeleteDocument,
  apiBase = "",
  saving = false,
  errorMessage = "",
}) {
  const [local, setLocal] = useState(() => norm(card));
  const [tab, setTab] = useState("tasks");
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachErr, setAttachErr] = useState("");
  const panelRef = useRef(null);
  const fileRef = useRef(null);
  const isLight = theme === "light";

  useEffect(() => {
    if (!open) return;
    setLocal(norm(card));
    setTab("tasks");
    setNewTask("");
    setBusy(false);
    setAttachErr("");
  }, [open, card?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => panelRef.current?.focus?.(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const taskCount = Array.isArray(local?.tasks) ? local.tasks.length : 0;
  const { total, done, pct, kind } = useMemo(() => progress(local, card?.progressMetrics), [local, card?.progressMetrics]);
  const progressLabel = kind === "children" ? "веток" : "задач";
  const hrs = useMemo(() => totalHours(local), [local]);
  const { files, images, docsCount, imagesCount } = useMemo(() => splitDocs(local), [local]);
  const barTone =
    pct >= 100 ? "bg-emerald-400/90" : pct >= 70 ? "bg-emerald-300/80" : pct >= 40 ? "bg-amber-300/80" : pct >= 10 ? "bg-orange-300/80" : "bg-rose-400/80";

  const fieldClass = isLight
    ? "w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm shadow-zinc-200/60 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white [&>option]:bg-white [&>option]:text-zinc-900"
    : "w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-sm text-white/85 outline-none transition focus:border-white/25";
  const mutedClass = isLight ? "text-zinc-500" : "text-white/45";
  const surfaceClass = isLight ? "border-zinc-200 bg-white shadow-sm shadow-zinc-200/50" : "border-white/10 bg-white/[0.03]";
  const altSurfaceClass = isLight ? "border-zinc-200 bg-zinc-50" : "border-white/10 bg-zinc-950/70";
  const secondaryBtnClass = isLight
    ? "border-zinc-300 bg-white text-zinc-700 shadow-sm shadow-zinc-200/60 hover:bg-zinc-100"
    : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10";
  const controlStyle = { colorScheme: isLight ? "light" : "dark" };

  const patch = (value) => setLocal((prev) => (prev ? { ...prev, ...value } : prev));
  const patchTask = (id, value) =>
    setLocal((prev) => (prev ? { ...prev, tasks: prev.tasks.map((task) => (task.id === id ? { ...task, ...value } : task)) } : prev));
  const dropTask = (id) => setLocal((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((task) => task.id !== id) } : prev));
  const toggleTask = (id) =>
    setLocal((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((task) =>
              task.id === id ? { ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : null } : task
            ),
          }
        : prev
    );

  const addTask = () => {
    const title = newTask.trim();
    if (!title) return;
    setLocal((prev) =>
      prev
        ? {
            ...prev,
            tasks: [...prev.tasks, { id: uid(), title, done: false, description: "", time: 1, deadline: "", responsible: "", responsibleId: null }],
          }
        : prev
    );
    setNewTask("");
  };

  const save = async () => {
    if (!local) return;
    const result = await onSave?.(payload(local));
    if (result !== false) onClose?.();
  };

  const archive = async () => {
    if (!local || !onToggleArchive) return;
    const result = await onToggleArchive(payload({ ...local, archived: !local.archived }));
    if (result !== false) onClose?.();
  };

  const remove = async () => {
    if (!local || !onDelete) return;
    const confirmed = window.confirm(`Удалить карточку "${local.title || "Без названия"}"?`);
    if (!confirmed) return;
    const result = await onDelete(payload(local));
    if (result !== false) onClose?.();
  };

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !local?.id || !onUploadDocument) return;
    try {
      setBusy(true);
      setAttachErr("");
      const result = await onUploadDocument(local.id, file);
      const next = norm(result?.card);
      const one = result?.document ? normDoc(result.document) : null;
      setLocal((prev) =>
        !prev ? prev : next?.id === prev.id ? { ...prev, documents: next.documents } : one ? { ...prev, documents: [...prev.documents, one] } : prev
      );
    } catch (error) {
      setAttachErr(error?.message || "Не удалось загрузить вложение.");
    } finally {
      setBusy(false);
    }
  };

  const del = async (doc) => {
    if (!local?.id || !doc?.id || !onDeleteDocument) return;
    try {
      setBusy(true);
      setAttachErr("");
      const result = await onDeleteDocument(local.id, doc);
      const next = norm(result?.card);
      setLocal((prev) =>
        !prev
          ? prev
          : next?.id === prev.id
            ? { ...prev, documents: next.documents }
            : { ...prev, documents: prev.documents.filter((item) => String(item.id) !== String(doc.id)) }
      );
    } catch (error) {
      setAttachErr(error?.message || "Не удалось удалить вложение.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && local ? (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
        >
          <div className="absolute inset-0 bg-black/70" />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            style={controlStyle}
            className={`relative z-10 flex max-h-[90vh] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-3xl border outline-none backdrop-blur ${
              isLight ? "border-zinc-300 bg-zinc-50 text-zinc-900 shadow-2xl shadow-zinc-400/20" : "border-white/10 bg-zinc-950/90 shadow-2xl shadow-black/50"
            }`}
            initial={{ y: 16, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className={`flex items-center justify-between gap-4 border-b px-5 py-4 ${isLight ? "border-zinc-300" : "border-white/10"}`}>
              <div className="min-w-0">
                <div className={`text-xs uppercase tracking-[0.18em] ${isLight ? "text-zinc-500" : "text-white/35"}`}>Карточка</div>
                <div className={`mt-1 truncate text-lg font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{local.title || "Без названия"}</div>
              </div>
              <button type="button" onClick={() => onClose?.()} className={`grid h-10 w-10 place-items-center rounded-2xl border transition ${secondaryBtnClass}`} title="Закрыть">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`border-b px-5 py-4 ${isLight ? "border-zinc-300" : "border-white/10"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                  <div className={`mb-2 flex items-center justify-between text-[12px] ${isLight ? "text-zinc-600" : "text-white/65"}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckSquare className="h-4 w-4" />
                      Прогресс карточки
                    </span>
                    <span>
                      {done}/{total} {progressLabel} • {pct}%
                    </span>
                  </div>
                  <div className={`h-3 overflow-hidden rounded-full ${isLight ? "bg-zinc-200" : "bg-white/10"}`}>
                    <div className={cn("h-full", barTone)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip icon={Clock} label="Часы" value={hrs.toFixed(1)} light={isLight} />
                  <Chip icon={Paperclip} label="Док" value={docsCount} light={isLight} />
                  <Chip icon={ImageIcon} label="Изобр" value={imagesCount} light={isLight} />
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className={`border-r p-5 ${isLight ? "border-zinc-300 bg-zinc-100/80" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="space-y-5">
                  <div>
                    <FieldLabel light={isLight}>Название</FieldLabel>
                    <textarea
                      value={local.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      rows={4}
                      style={controlStyle}
                      className={`${fieldClass} resize-none`}
                      placeholder="Название карточки"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <FieldLabel icon={CalendarDays} light={isLight}>Дедлайн</FieldLabel>
                      <input type="date" value={local.deadline || ""} onChange={(event) => patch({ deadline: event.target.value })} style={controlStyle} className={fieldClass} />
                    </div>
                    <div>
                      <FieldLabel icon={Palette} light={isLight}>Цвет рамки</FieldLabel>
                      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${altSurfaceClass}`}>
                        <input
                          type="color"
                          value={local.color || "#71717a"}
                          onChange={(event) => patch({ color: event.target.value })}
                          style={controlStyle}
                          className={`h-10 w-12 cursor-pointer rounded-lg border ${isLight ? "border-zinc-300 bg-white" : "border-white/10 bg-transparent"}`}
                        />
                        <div className={`text-sm ${isLight ? "text-zinc-700" : "text-white/60"}`}>{local.color || "#71717a"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel light={isLight}>Важность</FieldLabel>
                      <select value={local.importance ?? ""} onChange={(event) => patch({ importance: event.target.value ? Number(event.target.value) : null })} style={controlStyle} className={fieldClass}>
                        <option value="">Не задано</option>
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                          <option key={value} value={value}>
                            {value}. {getImportanceLabel(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel light={isLight}>Срочность</FieldLabel>
                      <select value={local.urgency ?? ""} onChange={(event) => patch({ urgency: event.target.value ? Number(event.target.value) : null })} style={controlStyle} className={fieldClass}>
                        <option value="">Не задано</option>
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                          <option key={value} value={value}>
                            {value}. {getUrgencyLabel(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`p-5 ${isLight ? "bg-zinc-50" : ""}`}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("tasks")}
                    className={`rounded-2xl border px-4 py-2 text-sm transition ${
                      tab === "tasks" ? (isLight ? "border-zinc-900 bg-zinc-900 text-white" : "border-white/15 bg-white/10 text-white") : secondaryBtnClass
                    }`}
                  >
                    Задачи ({taskCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("attachments")}
                    className={`rounded-2xl border px-4 py-2 text-sm transition ${
                      tab === "attachments" ? (isLight ? "border-zinc-900 bg-zinc-900 text-white" : "border-white/15 bg-white/10 text-white") : secondaryBtnClass
                    }`}
                  >
                    Вложения ({docsCount + imagesCount})
                  </button>
                </div>

                {tab === "tasks" ? (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input
                        value={newTask}
                        onChange={(event) => setNewTask(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addTask();
                          }
                        }}
                        placeholder="Добавить задачу"
                        style={controlStyle}
                        className={`flex-1 ${fieldClass}`}
                      />
                      <button type="button" onClick={addTask} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${secondaryBtnClass}`}>
                        <Plus className="h-4 w-4" />
                        Добавить
                      </button>
                    </div>

                    {local.tasks.length ? (
                      <div className="space-y-3">
                        {local.tasks.map((task) => (
                          <div key={task.id} className={`rounded-3xl border p-4 ${surfaceClass}`}>
                            <div className="flex items-start gap-3">
                              <input type="checkbox" checked={!!task.done} onChange={() => toggleTask(task.id)} style={controlStyle} className="mt-1 h-4 w-4 accent-zinc-900" />
                              <div className="min-w-0 flex-1 space-y-3">
                                <input
                                  value={task.title}
                                  onChange={(event) => patchTask(task.id, { title: event.target.value })}
                                  style={controlStyle}
                                  className={cn(fieldClass, task.done ? (isLight ? "text-zinc-400 line-through" : "text-white/45 line-through") : "")}
                                  placeholder="Название задачи"
                                />
                                <textarea
                                  value={task.description}
                                  onChange={(event) => patchTask(task.id, { description: event.target.value })}
                                  rows={3}
                                  style={controlStyle}
                                  className={`${fieldClass} resize-none ${isLight ? "text-zinc-700" : "text-white/75"}`}
                                  placeholder="Описание задачи"
                                />
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                  <div>
                                    <FieldLabel light={isLight}>Время, ч</FieldLabel>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={task.time}
                                      onChange={(event) => patchTask(task.id, { time: event.target.value === "" ? 0 : Number(event.target.value) })}
                                      style={controlStyle}
                                      className={fieldClass}
                                    />
                                  </div>
                                  <div>
                                    <FieldLabel light={isLight}>Дедлайн</FieldLabel>
                                    <input type="date" value={task.deadline || ""} onChange={(event) => patchTask(task.id, { deadline: event.target.value })} style={controlStyle} className={fieldClass} />
                                  </div>
                                  <div>
                                    <FieldLabel light={isLight}>Ответственный</FieldLabel>
                                    <input value={task.responsible} onChange={(event) => patchTask(task.id, { responsible: event.target.value })} style={controlStyle} className={fieldClass} placeholder="Имя" />
                                  </div>
                                </div>
                              </div>
                              <button type="button" onClick={() => dropTask(task.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-600 transition hover:bg-rose-500/15" title="Удалить задачу">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`rounded-3xl border border-dashed px-6 py-10 text-center text-sm ${isLight ? "border-zinc-300 bg-zinc-50 text-zinc-500" : "border-white/10 bg-white/[0.02] text-white/45"}`}>
                        У этой карточки пока нет задач.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.webp" onChange={pick} />
                    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-3xl border px-4 py-3 ${surfaceClass}`}>
                      <div className={`text-sm ${isLight ? "text-zinc-600" : "text-white/60"}`}>Можно прикреплять документы и изображения. Они сохраняются отдельно от текста карточки.</div>
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${secondaryBtnClass}`}>
                        <Plus className="h-4 w-4" />
                        {busy ? "Загрузка..." : "Добавить вложение"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className={`rounded-3xl border p-4 ${surfaceClass}`}>
                        <div className={`mb-3 inline-flex items-center gap-2 text-sm font-medium ${isLight ? "text-zinc-900" : "text-white/85"}`}>
                          <Paperclip className="h-4 w-4" />
                          Документы
                        </div>
                        {files.length ? (
                          <div className="space-y-2">
                            {files.map((doc) => (
                              <div key={doc.id || doc.name} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${altSurfaceClass}`}>
                                <a href={toUrl(apiBase, doc.file_url) || "#"} target={doc.file_url ? "_blank" : undefined} rel="noreferrer" className={`min-w-0 flex-1 text-sm transition ${isLight ? "text-zinc-700 hover:text-zinc-900" : "text-white/75 hover:text-white"}`}>
                                  <div className="truncate">{doc.name || "Документ"}</div>
                                  {bytes(doc.size) ? <div className={`mt-1 text-xs ${mutedClass}`}>{bytes(doc.size)}</div> : null}
                                </a>
                                <button type="button" onClick={() => del(doc)} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-600 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50" title="Удалить документ">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={`text-sm ${isLight ? "text-zinc-500" : "text-white/45"}`}>Документы пока не добавлены.</div>
                        )}
                      </div>

                      <div className={`rounded-3xl border p-4 ${surfaceClass}`}>
                        <div className={`mb-3 inline-flex items-center gap-2 text-sm font-medium ${isLight ? "text-zinc-900" : "text-white/85"}`}>
                          <ImageIcon className="h-4 w-4" />
                          Изображения
                        </div>
                        {images.length ? (
                          <div className="grid grid-cols-2 gap-3">
                            {images.map((doc) => (
                              <div key={doc.id || doc.name} className={`overflow-hidden rounded-2xl border ${altSurfaceClass}`}>
                                <a href={toUrl(apiBase, doc.file_url) || "#"} target={doc.file_url ? "_blank" : undefined} rel="noreferrer" className="block">
                                  <div className={`aspect-[4/3] ${isLight ? "bg-zinc-100" : "bg-black/30"}`}>
                                    <img src={toUrl(apiBase, doc.file_url)} alt={doc.name || "Изображение"} className="h-full w-full object-cover" />
                                  </div>
                                  <div className={`truncate px-3 py-2 text-sm ${isLight ? "text-zinc-700" : "text-white/75"}`}>{doc.name || "Изображение"}</div>
                                </a>
                                <div className={`flex items-center justify-between gap-2 border-t px-3 py-2 ${isLight ? "border-zinc-300" : "border-white/10"}`}>
                                  <div className={`truncate text-xs ${mutedClass}`}>{bytes(doc.size) || "Файл"}</div>
                                  <button type="button" onClick={() => del(doc)} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50" title="Удалить изображение">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={`text-sm ${isLight ? "text-zinc-500" : "text-white/45"}`}>Изображения пока не добавлены.</div>
                        )}
                      </div>
                    </div>

                    {attachErr ? <div className="text-sm text-rose-500">{attachErr}</div> : null}
                  </div>
                )}
              </div>
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 ${isLight ? "border-zinc-300" : "border-white/10"}`}>
              <div className="min-w-0">{errorMessage ? <div className="text-xs text-rose-500">{errorMessage}</div> : null}</div>
              <div className="flex flex-wrap items-center gap-2">
                {onDelete ? (
                  <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-700 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                ) : null}
                {onToggleArchive ? (
                  <button type="button" onClick={archive} disabled={saving} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${secondaryBtnClass}`}>
                    {local.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    {local.archived ? "Вернуть" : "В архив"}
                  </button>
                ) : null}
                <button type="button" onClick={() => onClose?.()} disabled={saving} className={`rounded-2xl border px-4 py-2.5 text-sm transition ${secondaryBtnClass}`}>
                  Отмена
                </button>
                <button type="button" onClick={save} disabled={saving} className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${isLight ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-white text-zinc-950 hover:bg-white/90"}`}>
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
