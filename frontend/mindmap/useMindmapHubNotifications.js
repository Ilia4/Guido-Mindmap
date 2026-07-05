import { useEffect, useMemo, useRef, useState } from "react";

import { collectProjectTasks } from "./utils/mindmapPageUtils";

const API_BASE = String(import.meta.env.VITE_API_MINDMAP_BASE || "").replace(/\/+$/, "");
const TOKEN_KEY = String(import.meta.env.VITE_CORE_TOKEN_KEY || "guido_access_token");

const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 60 * 1000;
const STREAM_RETRY_MS = 3000;
const DUE_SOON_DAYS = 3;
const READ_MAP_STORAGE_KEY = "guido_hub_notification_reads_v1";

const severityWeight = {
  high: 0,
  medium: 1,
  low: 2,
};

function normalizeReadMap(value) {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value).reduce((acc, [key, ts]) => {
    if (!key) return acc;
    const time = Number(ts);
    acc[String(key)] = Number.isFinite(time) ? time : Date.now();
    return acc;
  }, {});
}

function readReadMap() {
  if (typeof window === "undefined") return {};

  try {
    return normalizeReadMap(JSON.parse(window.localStorage.getItem(READ_MAP_STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

function writeReadMap(next) {
  if (typeof window === "undefined") return;

  const normalized = normalizeReadMap(next);
  const entries = Object.entries(normalized).sort((left, right) => right[1] - left[1]).slice(0, 500);

  window.localStorage.setItem(READ_MAP_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayDiff(target, base = Date.now()) {
  return Math.round((startOfDay(target).getTime() - startOfDay(base).getTime()) / DAY_MS);
}

function parseResponseError(response, fallbackLabel) {
  return response
    .text()
    .then((text) => text || `${fallbackLabel} (${response.status})`)
    .catch(() => `${fallbackLabel} (${response.status})`);
}

function isNotificationsApiUnsupported(response) {
  return response?.status === 404 || response?.status === 405;
}

function normalizeProject(project) {
  return {
    id: project?.id,
    title: String(project?.title ?? "").trim() || "Без названия проекта",
  };
}

function buildTaskNotification(task) {
  if (task.done) return null;

  const deadlineDate = parseDate(task.deadline);
  if (!deadlineDate) return null;

  const daysLeft = dayDiff(deadlineDate);
  if (daysLeft > DUE_SOON_DAYS) return null;

  let severity = "low";
  let badge = "Скоро";
  let textPrefix = "";

  if (daysLeft < 0) {
    severity = "high";
    badge = "Просрочено";
    textPrefix = `Срок был ${deadlineDate.toLocaleDateString()}`;
  } else if (daysLeft === 0) {
    severity = "high";
    badge = "Сегодня";
    textPrefix = "Срок сегодня";
  } else if (daysLeft === 1) {
    severity = "medium";
    badge = "Завтра";
    textPrefix = "Срок завтра";
  } else {
    severity = "medium";
    badge = `Через ${daysLeft} дн.`;
    textPrefix = `Срок через ${daysLeft} дн.`;
  }

  const contextBits = [task.projectTitle, task.cardTitle];
  if (task.responsible) contextBits.push(`Ответственный: ${task.responsible}`);

  return {
    id: `mindmap:task:${task.id}:${task.deadline}`,
    kind: "mindmap_task_deadline",
    severity,
    serviceId: "mindmap",
    serviceLabel: "MindMap",
    badge,
    title: task.title,
    text: `${textPrefix} • ${contextBits.filter(Boolean).join(" • ")}`,
    route: "/mindmap",
    target: {
      projectId: String(task.projectId),
      cardId: String(task.cardId),
    },
    timestamp: deadlineDate.getTime(),
    readHidesItem: false,
    serverManaged: false,
  };
}

function normalizeServerNotification(raw) {
  const notificationId = Number(raw?.id);
  const createdAt = raw?.created_at ? new Date(raw.created_at).getTime() : Date.now();

  return {
    id: `mindmap:server:${notificationId}`,
    serverId: Number.isFinite(notificationId) ? notificationId : 0,
    kind: String(raw?.kind || "mindmap_event"),
    severity: raw?.kind === "mindmap_access_granted" ? "medium" : "low",
    serviceId: String(raw?.service_id || "mindmap"),
    serviceLabel: String(raw?.service_label || "MindMap"),
    title: String(raw?.title || "Новое уведомление"),
    text: String(raw?.text || "").trim(),
    route: String(raw?.route || "/mindmap"),
    target: {
      projectId: raw?.project_id != null ? String(raw.project_id) : "",
      cardId: raw?.card_id != null ? String(raw.card_id) : "",
    },
    timestamp: Number.isFinite(createdAt) ? createdAt : Date.now(),
    readHidesItem: true,
    read: Boolean(raw?.read_at),
    serverManaged: true,
  };
}

function upsertServerNotification(items, nextItem) {
  const filtered = (Array.isArray(items) ? items : []).filter((item) => item.id !== nextItem.id);
  return [nextItem, ...filtered].sort(compareNotifications);
}

function reconcileServerNotifications(prevItems, nextItems) {
  const nextList = Array.isArray(nextItems) ? nextItems : [];
  const prevList = Array.isArray(prevItems) ? prevItems : [];
  const merged = new Map(nextList.map((item) => [item.id, item]));
  const maxNextServerId = nextList.reduce((maxValue, item) => Math.max(maxValue, Number(item.serverId) || 0), 0);

  prevList
    .filter((item) => (Number(item.serverId) || 0) > maxNextServerId)
    .forEach((item) => merged.set(item.id, item));

  return Array.from(merged.values()).sort(compareNotifications);
}

async function fetchProjects(signal) {
  const token = getToken();
  if (!API_BASE || !token) return [];

  const res = await fetch(`${API_BASE}/api/projects/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!res.ok) {
    throw new Error(await parseResponseError(res, "MindMap projects API"));
  }

  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(normalizeProject);
}

async function fetchProjectBoard(projectId, signal) {
  const token = getToken();
  if (!API_BASE || !token || !projectId) return null;

  const res = await fetch(`${API_BASE}/api/projects/${projectId}/board`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!res.ok) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function loadTaskNotifications(signal) {
  const projects = await fetchProjects(signal);
  const remoteProjects = projects.filter((project) => Number.isFinite(Number(project.id)));
  if (!remoteProjects.length) return [];

  const boardResults = await Promise.all(
    remoteProjects.map(async (project) => {
      const board = await fetchProjectBoard(project.id, signal);
      return board ? { project, board } : null;
    })
  );

  return boardResults
    .filter(Boolean)
    .flatMap(({ project, board }) => collectProjectTasks(project, board))
    .map(buildTaskNotification)
    .filter(Boolean)
    .sort(compareNotifications);
}

async function loadServerNotifications(signal) {
  const token = getToken();
  if (!API_BASE || !token) return { items: [], unsupported: false };

  const res = await fetch(`${API_BASE}/api/notifications?limit=50&unread_only=true`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (isNotificationsApiUnsupported(res)) {
    return { items: [], unsupported: true };
  }

  if (!res.ok) {
    throw new Error(await parseResponseError(res, "MindMap notifications API"));
  }

  const data = await res.json();
  return {
    items: (Array.isArray(data) ? data : []).map(normalizeServerNotification).sort(compareNotifications),
    unsupported: false,
  };
}

async function markServerNotificationsRead(serverIds) {
  const ids = Array.from(new Set((Array.isArray(serverIds) ? serverIds : []).map(Number).filter((value) => value > 0)));
  const token = getToken();
  if (!API_BASE || !token || !ids.length) return;

  await fetch(`${API_BASE}/api/notifications/read`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  }).catch(() => {});
}

function compareNotifications(left, right) {
  const severityDiff = (severityWeight[left.severity] ?? 99) - (severityWeight[right.severity] ?? 99);
  if (severityDiff !== 0) return severityDiff;

  if (left.kind === "mindmap_task_deadline" && right.kind === "mindmap_task_deadline") {
    return (left.timestamp || 0) - (right.timestamp || 0);
  }

  return (right.timestamp || 0) - (left.timestamp || 0);
}

function extractEventBlocks(chunkBuffer) {
  const normalized = chunkBuffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");

  return {
    blocks: parts.slice(0, -1),
    rest: parts[parts.length - 1] || "",
  };
}

function parseEventBlock(block) {
  const lines = String(block || "").split("\n");
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (!dataLines.length) return null;

  try {
    return JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
}

async function consumeNotificationsStream({ signal, sinceId, onNotification }) {
  const token = getToken();
  if (!API_BASE || !token) return { unsupported: false };

  const res = await fetch(`${API_BASE}/api/notifications/stream?since_id=${Math.max(0, Number(sinceId) || 0)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    signal,
  });

  if (isNotificationsApiUnsupported(res)) {
    return { unsupported: true };
  }

  if (!res.ok) {
    throw new Error(await parseResponseError(res, "MindMap notifications stream"));
  }

  if (!res.body) return { unsupported: false };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { blocks, rest } = extractEventBlocks(buffer);
    buffer = rest;

    for (const block of blocks) {
      const payload = parseEventBlock(block);
      if (payload) onNotification?.(normalizeServerNotification(payload));
    }
  }

  return { unsupported: false };
}

export function useMindmapHubNotifications({ enabled = true } = {}) {
  const [taskItems, setTaskItems] = useState([]);
  const [serverItems, setServerItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [readMap, setReadMap] = useState(() => readReadMap());
  const [serverApiSupported, setServerApiSupported] = useState(true);
  const [serverStreamSupported, setServerStreamSupported] = useState(true);
  const latestServerIdRef = useRef(0);

  useEffect(() => {
    setReadMap(readReadMap());
  }, []);

  useEffect(() => {
    if (!enabled) {
      setTaskItems([]);
      setServerItems([]);
      setError("");
      setServerApiSupported(true);
      setServerStreamSupported(true);
      latestServerIdRef.current = 0;
      return undefined;
    }

    if (!API_BASE) {
      setTaskItems([]);
      setServerItems([]);
      setLoading(false);
      setError("VITE_API_MINDMAP_BASE не задан.");
      return undefined;
    }

    let disposed = false;
    let controller = new AbortController();

    async function run({ silent = false } = {}) {
      if (!silent) setLoading(true);

      const [tasksResult, serverResult] = await Promise.allSettled([
        loadTaskNotifications(controller.signal),
        serverApiSupported ? loadServerNotifications(controller.signal) : Promise.resolve({ items: [], unsupported: true }),
      ]);

      if (disposed) return;

      const nextErrors = [];

      if (tasksResult.status === "fulfilled") {
        setTaskItems(tasksResult.value);
      } else if (tasksResult.reason?.name !== "AbortError") {
        nextErrors.push(tasksResult.reason?.message || "Не удалось обновить дедлайны MindMap.");
      }

      if (serverResult.status === "fulfilled") {
        if (serverResult.value.unsupported) {
          setServerApiSupported(false);
          setServerStreamSupported(false);
          setServerItems([]);
        } else {
          setServerApiSupported(true);
          setServerItems((prev) => reconcileServerNotifications(prev, serverResult.value.items));
          latestServerIdRef.current = serverResult.value.items.reduce(
            (maxValue, item) => Math.max(maxValue, Number(item.serverId) || 0),
            latestServerIdRef.current
          );
        }
      } else if (serverResult.reason?.name !== "AbortError") {
        nextErrors.push(serverResult.reason?.message || "Не удалось обновить live-уведомления MindMap.");
      }

      if (serverResult.status === "fulfilled" && !serverResult.value.unsupported) {
        latestServerIdRef.current = serverResult.value.items.reduce(
          (maxValue, item) => Math.max(maxValue, Number(item.serverId) || 0),
          latestServerIdRef.current
        );
      }

      if (nextErrors.length) {
        setError(nextErrors.join(" "));
      } else {
        setError("");
      }

      if (!silent) setLoading(false);
    }

    void run();

    const intervalId = window.setInterval(() => {
      controller.abort();
      controller = new AbortController();
      void run({ silent: true });
    }, POLL_MS);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [enabled, reloadKey, serverApiSupported]);

  useEffect(() => {
    if (!enabled || !API_BASE || !serverApiSupported || !serverStreamSupported) return undefined;

    let disposed = false;
    let reconnectTimer = 0;
    let controller = new AbortController();

    async function connect() {
      try {
        const result = await consumeNotificationsStream({
          signal: controller.signal,
          sinceId: latestServerIdRef.current,
          onNotification: (item) => {
            latestServerIdRef.current = Math.max(latestServerIdRef.current, Number(item.serverId) || 0);
            setServerItems((prev) => upsertServerNotification(prev, item));
          },
        });
        if (result?.unsupported) {
          setServerStreamSupported(false);
          return;
        }
      } catch (error_) {
        if (disposed || error_?.name === "AbortError") return;
      }

      if (disposed) return;

      reconnectTimer = window.setTimeout(() => {
        controller.abort();
        controller = new AbortController();
        void connect();
      }, STREAM_RETRY_MS);
    }

    void connect();

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(reconnectTimer);
    };
  }, [enabled, reloadKey, serverApiSupported, serverStreamSupported]);

  const visibleItems = useMemo(() => {
    const localItems = taskItems
      .map((item) => ({
        ...item,
        read: Boolean(readMap[item.id]),
      }))
      .filter((item) => !(item.read && item.readHidesItem));

    const liveItems = serverItems
      .map((item) => ({
        ...item,
        read: Boolean(item.read),
      }))
      .filter((item) => !item.read);

    return [...liveItems, ...localItems].sort(compareNotifications);
  }, [readMap, serverItems, taskItems]);

  const unreadCount = useMemo(() => visibleItems.filter((item) => !item.read).length, [visibleItems]);

  function markLocalRead(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean)));
    if (!list.length) return;

    setReadMap((prev) => {
      const next = { ...prev };
      const now = Date.now();

      list.forEach((id) => {
        next[id] = now;
      });

      writeReadMap(next);
      return next;
    });
  }

  function markRead(id) {
    if (!id) return;

    const serverItem = serverItems.find((item) => item.id === id);
    if (serverItem) {
      setServerItems((prev) => prev.filter((item) => item.id !== id));
      void markServerNotificationsRead([serverItem.serverId]);
      return;
    }

    markLocalRead(id);
  }

  function markAllRead(ids = []) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    if (!list.length) return;

    const serverIdSet = new Set();
    const localIds = [];

    list.forEach((id) => {
      const serverItem = serverItems.find((item) => item.id === id);
      if (serverItem) {
        serverIdSet.add(serverItem.serverId);
      } else {
        localIds.push(id);
      }
    });

    if (serverIdSet.size) {
      setServerItems((prev) => prev.filter((item) => !list.includes(item.id)));
      void markServerNotificationsRead(Array.from(serverIdSet));
    }

    if (localIds.length) {
      markLocalRead(localIds);
    }
  }

  function refresh() {
    setServerApiSupported(true);
    setServerStreamSupported(true);
    setReloadKey((value) => value + 1);
  }

  return {
    items: visibleItems,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
  };
}
