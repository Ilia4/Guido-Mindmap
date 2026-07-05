import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, CheckCircle2, ChevronRight, Clock3, Folder, FolderKanban, FolderPlus, Moon, Plus, Search, Sun } from "lucide-react";

import ProjectBoard from "./ProjectBoard";
import { Button, ConfirmTopSheet, IconBtn, Modal, Pill } from "./components/common/MindmapUi";
import ProjectAccessModal from "./components/projects/ProjectAccessModal";
import ProjectCard from "./components/projects/ProjectCard";
import ProjectFormModal from "./components/projects/ProjectFormModal";
import KpiCard from "./components/projects/KpiCard";
import TasksOverviewModal from "./components/projects/TasksOverviewModal";
import {
  buildTaskStats,
  collectProjectTasks,
  normalizeShareItem,
} from "./utils/mindmapPageUtils";

export default function MindmapPageContent({ onBack, entryIntent }) {
  const API_BASE = String(import.meta.env.VITE_API_MINDMAP_BASE || "").replace(/\/+$/, "");
  const TOKEN_KEY = String(import.meta.env.VITE_CORE_TOKEN_KEY || "guido_access_token");
  const PINNED_PROJECTS_STORAGE_KEY = "guido_mindmap_pinned_projects_v1";
  const THEME_STORAGE_KEY = "guido_mindmap_workspace_theme_v1";

  const [q, setQ] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [viewMode, setViewMode] = useState("active");
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newFolderId, setNewFolderId] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  const [folderOpen, setFolderOpen] = useState(false);
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderNote, setFolderNote] = useState("");
  const [openedFolderId, setOpenedFolderId] = useState("");

  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [moveFolderSaving, setMoveFolderSaving] = useState(false);
  const [moveFolderProject, setMoveFolderProject] = useState(null);
  const [moveFolderId, setMoveFolderId] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState("");

  const [taskStats, setTaskStats] = useState({ items: [], completed: 0, pending: 0, today: 0 });
  const [taskStatsLoading, setTaskStatsLoading] = useState(false);
  const [taskStatsError, setTaskStatsError] = useState("");
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [tasksModalFilter, setTasksModalFilter] = useState("completed");
  const [tasksModalProjectId, setTasksModalProjectId] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [shareProject, setShareProject] = useState(null);
  const [shareItems, setShareItems] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRemovingUserId, setShareRemovingUserId] = useState(null);

  const [openedProject, setOpenedProject] = useState(null);
  const [handledEntryNonce, setHandledEntryNonce] = useState(null);
  const isLight = theme === "light";

  function mapProject(project) {
    const pinnedIds = readPinnedProjectIds();
    return {
      id: project.id,
      title: project.title ?? "",
      note: project.note ?? "",
      folderId: project.folder_id == null ? null : String(project.folder_id),
      folderName: project.folder_name ?? "",
      nodes: Number(project.nodes ?? 0),
      edges: Number(project.edges ?? 0),
      pinned: pinnedIds.has(String(project.id)) || Boolean(project.pinned ?? false),
      archived: Boolean(project.archived ?? false),
      isOwner: Boolean(project.is_owner ?? true),
      sharePermission: String(project.share_permission ?? (project.is_owner === false ? "write" : "owner")),
      ownerName: project.owner_name ?? "",
      ownerEmail: project.owner_email ?? "",
      updatedAt: project.updated_at ? new Date(project.updated_at).getTime() : Date.now(),
      createdAt: project.created_at ? new Date(project.created_at).getTime() : null,
      _rawUserId: project.user_id,
    };
  }

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  function readPinnedProjectIds() {
    try {
      const raw = localStorage.getItem(PINNED_PROJECTS_STORAGE_KEY);
      const parsed = JSON.parse(raw || "[]");
      return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)) : []);
    } catch {
      return new Set();
    }
  }

  function writePinnedProjectIds(ids) {
    localStorage.setItem(PINNED_PROJECTS_STORAGE_KEY, JSON.stringify([...ids]));
  }

  function mapFolder(folder) {
    return {
      id: String(folder.id),
      name: folder.name ?? "",
      note: folder.note ?? "",
      color: folder.color ?? null,
      projectsCount: Number(folder.projects_count ?? 0),
      activeProjectsCount: Number(folder.active_projects_count ?? 0),
      archivedProjectsCount: Number(folder.archived_projects_count ?? 0),
      updatedAt: folder.updated_at ? new Date(folder.updated_at).getTime() : Date.now(),
    };
  }

  async function loadTaskStats(projectItems) {
    const remoteProjects = (Array.isArray(projectItems) ? projectItems : []).filter((project) =>
      Number.isFinite(Number(project?.id))
    );

    if (!remoteProjects.length) {
      setTaskStats({ items: [], completed: 0, pending: 0, today: 0 });
      setTaskStatsError("");
      return;
    }

    setTaskStatsLoading(true);
    setTaskStatsError("");

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}).`);

      const boardResults = await Promise.all(
        remoteProjects.map(async (project) => {
          try {
            const res = await fetch(`${API_BASE}/api/projects/${project.id}/board`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
              const message = await res.text().catch(() => "");
              throw new Error(message || `HTTP ${res.status}`);
            }

            const board = await res.json();
            return { project, board, ok: true };
          } catch (error) {
            console.warn("Failed to load task stats for project", project.id, error);
            return { project, board: null, ok: false };
          }
        })
      );

      const items = boardResults
        .filter((entry) => entry.ok && entry.board)
        .flatMap((entry) => collectProjectTasks(entry.project, entry.board));

      setTaskStats(buildTaskStats(items));

      const failedCount = boardResults.filter((entry) => !entry.ok).length;
      setTaskStatsError(
        failedCount > 0 ? `Не удалось загрузить задачи для части проектов (${failedCount}).` : ""
      );
    } catch (error) {
      setTaskStats({ items: [], completed: 0, pending: 0, today: 0 });
      setTaskStatsError(error?.message || "Не удалось загрузить статистику по задачам.");
    } finally {
      setTaskStatsLoading(false);
    }
  }

  async function _loadProjects() {
    setLoading(true);
    setErr("");

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан (Render env + rebuild).");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}). Сначала залогинься в Guido Core.`);

      const res = await fetch(`${API_BASE}/api/projects/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен. Перелогинься.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка API (${res.status}): ${text || res.statusText}`);
      }

      const data = await res.json();
      const mapped = (Array.isArray(data) ? data : []).map(mapProject);

      setProjects(mapped);
      void loadTaskStats(mapped);
    } catch (error) {
      setErr(error?.message || "Не удалось загрузить проекты");
      setProjects([]);
      setTaskStats({ items: [], completed: 0, pending: 0, today: 0 });
      setTaskStatsError("");
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace() {
    setLoading(true);
    setErr("");

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан (Render env + rebuild).");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}). Сначала залогинься в Guido Core.`);

      const [projectsRes, foldersRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/api/project-folders/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (projectsRes.status === 401 || foldersRes.status === 401) {
        throw new Error("401: токен недействителен/просрочен. Перелогинься.");
      }
      if (!projectsRes.ok) {
        const text = await projectsRes.text().catch(() => "");
        throw new Error(`Ошибка API (${projectsRes.status}): ${text || projectsRes.statusText}`);
      }
      if (!foldersRes.ok) {
        const text = await foldersRes.text().catch(() => "");
        throw new Error(`Ошибка folders API (${foldersRes.status}): ${text || foldersRes.statusText}`);
      }

      const projectsData = await projectsRes.json();
      const foldersData = await foldersRes.json();
      const mappedProjects = (Array.isArray(projectsData) ? projectsData : []).map(mapProject);
      const mappedFolders = (Array.isArray(foldersData) ? foldersData : []).map(mapFolder);

      setProjects(mappedProjects);
      setFolders(mappedFolders);
      void loadTaskStats(mappedProjects);
    } catch (error) {
      setErr(error?.message || "Не удалось загрузить проекты");
      setProjects([]);
      setFolders([]);
      setTaskStats({ items: [], completed: 0, pending: 0, today: 0 });
      setTaskStatsError("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!entryIntent?.nonce || !entryIntent?.projectId || loading) return;
    if (handledEntryNonce === entryIntent.nonce) return;

    const targetProject = projects.find((project) => String(project.id) === String(entryIntent.projectId));
    if (!targetProject) return;

    setHandledEntryNonce(entryIntent.nonce);

    if (!openedProject || String(openedProject.id) !== String(targetProject.id)) {
      void openProject(targetProject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIntent?.nonce, entryIntent?.projectId, loading, projects, openedProject?.id, handledEntryNonce]);

  const { activeProjects, archivedProjects, filtered } = useMemo(() => {
    const active = projects.filter((project) => !project.archived);
    const archived = projects.filter((project) => project.archived);
    const source = viewMode === "archived" ? archived : active;
    const query = q.trim().toLowerCase();

    const list = !query
      ? source
      : source.filter(
          (project) =>
            (project.title || "").toLowerCase().includes(query) ||
            (project.note || "").toLowerCase().includes(query)
        );

    return {
      activeProjects: active,
      archivedProjects: archived,
      filtered: [...list].sort((left, right) => {
        if (!!left.pinned !== !!right.pinned) return left.pinned ? -1 : 1;
        return (right.updatedAt || 0) - (left.updatedAt || 0);
      }),
    };
  }, [projects, q, viewMode]);

  const openedFolder = useMemo(
    () => folders.find((folder) => String(folder.id) === String(openedFolderId)) || null,
    [folders, openedFolderId]
  );

  function openTasksModal(filter) {
    setTasksModalFilter(filter);
    setTasksModalProjectId("");
    setTasksModalOpen(true);
  }

  function nextAutoTitle() {
    const index = projects.length + 1;
    return `Проект ${index}`;
  }

  function openFolder(folder) {
    setOpenedFolderId(String(folder.id));
    setQ("");
  }

  function openCreateProjectModal(defaultFolderId = "") {
    setNewFolderId(defaultFolderId || "");
    setCreateOpen(true);
  }

  async function openProject(project) {
    setOpening(true);
    setOpenErr("");

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      const res = await fetch(`${API_BASE}/api/projects/${project.id}/board`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к проекту.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка board (${res.status}): ${text || res.statusText}`);
      }

      const board = await res.json();
      setOpenedProject({ ...project, board });
    } catch (error) {
      setOpenErr(error?.message || "Не удалось открыть проект");
    } finally {
      setOpening(false);
    }
  }

  async function loadProjectShares(projectId) {
    if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

    const res = await fetch(`${API_BASE}/api/projects/${projectId}/shares`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
    if (res.status === 403) throw new Error("403: нет доступа к проекту.");
    if (res.status === 404) throw new Error("404: проект не найден.");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ошибка доступа (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    const nextShares = Array.isArray(data?.shares) ? data.shares.map(normalizeShareItem) : [];

    setShareProject((prev) =>
      prev && Number(prev.id) === Number(projectId)
        ? {
            ...prev,
            ownerName: data?.owner_name ?? prev.ownerName ?? "",
            ownerEmail: data?.owner_email ?? prev.ownerEmail ?? "",
          }
        : prev
    );
    setShareItems(nextShares);
    return data;
  }

  async function openShareModal(project) {
    if (!project?.isOwner) {
      setErr("Доступом к проекту может управлять только владелец.");
      return;
    }

    setShareProject(project);
    setShareItems([]);
    setShareEmail("");
    setShareError("");
    setShareRemovingUserId(null);
    setShareOpen(true);
    setShareLoading(true);

    try {
      await loadProjectShares(project.id);
    } catch (error) {
      setShareError(error?.message || "Не удалось загрузить список доступов.");
    } finally {
      setShareLoading(false);
    }
  }

  async function submitProjectShare() {
    if (!shareProject) return;

    const email = shareEmail.trim();
    if (!email) return;

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      setShareSaving(true);
      setShareError("");

      const res = await fetch(`${API_BASE}/api/projects/${shareProject.id}/shares`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, permission: "write" }),
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к управлению проектом.");
      if (res.status === 404) throw new Error("Пользователь с таким email пока не найден в новом mindmap.");
      if (res.status === 409) throw new Error("Этому пользователю доступ уже выдан.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка шаринга (${res.status}): ${text || res.statusText}`);
      }

      setShareEmail("");
      await loadProjectShares(shareProject.id);
    } catch (error) {
      setShareError(error?.message || "Не удалось выдать доступ.");
    } finally {
      setShareSaving(false);
    }
  }

  async function revokeProjectShare(share) {
    if (!shareProject || !share?.userId) return;

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      setShareSaving(true);
      setShareRemovingUserId(share.userId);
      setShareError("");

      const res = await fetch(`${API_BASE}/api/projects/${shareProject.id}/shares/${share.userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к управлению проектом.");
      if (res.status === 404) throw new Error("Эта запись доступа уже удалена.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка отзыва доступа (${res.status}): ${text || res.statusText}`);
      }

      await loadProjectShares(shareProject.id);
    } catch (error) {
      setShareError(error?.message || "Не удалось убрать доступ.");
    } finally {
      setShareSaving(false);
      setShareRemovingUserId(null);
    }
  }

  function closeShareModal() {
    setShareOpen(false);
    setShareProject(null);
    setShareItems([]);
    setShareError("");
    setShareEmail("");
    setShareLoading(false);
    setShareSaving(false);
    setShareRemovingUserId(null);
  }

  function togglePin(project) {
    const pinnedIds = readPinnedProjectIds();
    const key = String(project.id);
    if (pinnedIds.has(key)) pinnedIds.delete(key);
    else pinnedIds.add(key);
    writePinnedProjectIds(pinnedIds);
    setProjects((prev) =>
      prev.map((item) => (item.id === project.id ? { ...item, pinned: !item.pinned, updatedAt: Date.now() } : item))
    );
  }

  async function toggleArchive(project) {
    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      const nextArchived = !project.archived;
      const res = await fetch(`${API_BASE}/api/projects/${project.id}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archived: nextArchived }),
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к проекту.");
      if (res.status === 404) throw new Error("404: проект не найден.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка архивации (${res.status}): ${text || res.statusText}`);
      }

      setErr("");
      setProjects((prev) =>
        prev.map((item) => (item.id === project.id ? { ...item, archived: nextArchived, updatedAt: Date.now() } : item))
      );
      setOpenedProject((prev) => (prev && prev.id === project.id ? { ...prev, archived: nextArchived } : prev));
    } catch (error) {
      setErr(error?.message || "Не удалось обновить состояние архива");
    }
  }

  function askDelete(project) {
    setDeleteTarget(project);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      const res = await fetch(`${API_BASE}/api/projects/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к проекту.");
      if (res.status === 404) throw new Error("404: проект не найден.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка удаления (${res.status}): ${text || res.statusText}`);
      }

      setErr("");
      setProjects((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setTaskStats((prev) =>
        buildTaskStats(prev.items.filter((item) => item.projectId !== String(deleteTarget.id)))
      );
      setTasksModalProjectId((prev) => (String(prev) === String(deleteTarget.id) ? "" : prev));
      setDeleteTarget(null);
    } catch (error) {
      setErr(error?.message || "Не удалось удалить проект");
    }
  }

  function openEdit(project) {
    setEditId(project.id);
    setEditTitle(project.title || "");
    setEditNote(project.note || "");
    setEditOpen(true);
  }

  function openMoveToFolder(project) {
    setMoveFolderProject(project);
    setMoveFolderId(project.folderId || "");
    setMoveFolderOpen(true);
  }

  async function saveEdit() {
    const title = (editTitle || "").trim() || nextAutoTitle();
    const note = (editNote || "").trim();

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      setErr("");
      const res = await fetch(`${API_BASE}/api/projects/${editId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, note }),
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к проекту.");
      if (res.status === 404) throw new Error("404: проект или папка не найдены.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка обновления проекта (${res.status}): ${text || res.statusText}`);
      }

      const updatedProject = mapProject(await res.json());
      setProjects((prev) => prev.map((item) => (item.id === editId ? updatedProject : item)));
      setOpenedProject((prev) => (prev && prev.id === editId ? { ...prev, ...updatedProject } : prev));
      setEditOpen(false);
      setEditId(null);
      setEditTitle("");
      setEditNote("");
      await loadWorkspace();
    } catch (error) {
      setErr(error?.message || "Не удалось обновить проект");
    }
  }

  async function submitMoveToFolder() {
    if (!moveFolderProject) return;

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE РЅРµ Р·Р°РґР°РЅ.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`РќРµС‚ С‚РѕРєРµРЅР° РІ localStorage (${TOKEN_KEY})`);

      setMoveFolderSaving(true);
      setErr("");

      const res = await fetch(`${API_BASE}/api/projects/${moveFolderProject.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: moveFolderProject.title || "",
          note: moveFolderProject.note || "",
          folder_id: moveFolderId ? Number(moveFolderId) : null,
        }),
      });

      if (res.status === 401) throw new Error("401: С‚РѕРєРµРЅ РЅРµРґРµР№СЃС‚РІРёС‚РµР»РµРЅ/РїСЂРѕСЃСЂРѕС‡РµРЅ.");
      if (res.status === 403) throw new Error("403: РЅРµС‚ РґРѕСЃС‚СѓРїР° Рє РїСЂРѕРµРєС‚Сѓ.");
      if (res.status === 404) throw new Error("404: РїСЂРѕРµРєС‚ РёР»Рё РїР°РїРєР° РЅРµ РЅР°Р№РґРµРЅС‹.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`РћС€РёР±РєР° РїРµСЂРµРјРµС‰РµРЅРёСЏ РїСЂРѕРµРєС‚Р° (${res.status}): ${text || res.statusText}`);
      }

      setMoveFolderOpen(false);
      setMoveFolderProject(null);
      setMoveFolderId("");
      await loadWorkspace();
    } catch (error) {
      setErr(error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРјРµСЃС‚РёС‚СЊ РїСЂРѕРµРєС‚ РІ РїР°РїРєСѓ");
    } finally {
      setMoveFolderSaving(false);
    }
  }

  async function createProject() {
    const title = newTitle.trim() || nextAutoTitle();
    const note = newNote.trim();
    const folderId = newFolderId || null;

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      setCreateSaving(true);
      setErr("");

      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, note, folder_id: folderId ? Number(folderId) : null }),
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка создания проекта (${res.status}): ${text || res.statusText}`);
      }

      const project = mapProject(await res.json());

      setProjects((prev) => [project, ...prev.filter((item) => String(item.id) !== String(project.id))]);
      setNewTitle("");
      setNewNote("");
      setNewFolderId("");
      setCreateOpen(false);
      await loadWorkspace();
      await openProject(project);
    } catch (error) {
      setErr(error?.message || "Не удалось создать проект");
    } finally {
      setCreateSaving(false);
    }
  }

  async function createFolder() {
    const name = folderName.trim();
    const note = folderNote.trim();
    if (!name) return;

    try {
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY})`);

      setFolderSaving(true);
      setErr("");

      const res = await fetch(`${API_BASE}/api/project-folders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, note }),
      });

      if (res.status === 401) throw new Error("401: токен недействителен/просрочен.");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка создания папки (${res.status}): ${text || res.statusText}`);
      }

      const createdFolder = mapFolder(await res.json());
      setFolders((prev) => [createdFolder, ...prev.filter((item) => item.id !== createdFolder.id)]);
      setOpenedFolderId(createdFolder.id);
      setFolderOpen(false);
      setFolderName("");
      setFolderNote("");
    } catch (error) {
      setErr(error?.message || "Не удалось создать папку");
    } finally {
      setFolderSaving(false);
    }
  }

  const currentTabTotal = viewMode === "archived" ? archivedProjects.length : activeProjects.length;
  const _groupedProjects = useMemo(() => {
    const folderMap = new Map(folders.map((folder) => [String(folder.id), { folder, items: [] }]));
    const ungrouped = [];

    for (const project of filtered) {
      if (project.folderId && folderMap.has(String(project.folderId))) {
        folderMap.get(String(project.folderId)).items.push(project);
      } else {
        ungrouped.push(project);
      }
    }

    const groups = [];
    for (const { folder, items } of folderMap.values()) {
      if (items.length) groups.push({ key: `folder:${folder.id}`, title: folder.name, note: folder.note, items });
    }
    if (ungrouped.length) {
      groups.push({ key: "folder:none", title: "Без папки", note: "", items: ungrouped });
    }
    return groups;
  }, [filtered, folders]);
  const visibleFolderIds = useMemo(() => new Set(folders.map((folder) => String(folder.id))), [folders]);
  const rootFolders = useMemo(() => {
    const query = q.trim().toLowerCase();
    const projectCounts = new Map();
    for (const project of filtered) {
      if (!project.folderId || !visibleFolderIds.has(String(project.folderId))) continue;
      projectCounts.set(String(project.folderId), (projectCounts.get(String(project.folderId)) || 0) + 1);
    }

    return folders
      .filter((folder) => {
        const matchesQuery =
          !query ||
          String(folder.name || "").toLowerCase().includes(query) ||
          String(folder.note || "").toLowerCase().includes(query);
        return matchesQuery && projectCounts.has(String(folder.id));
      })
      .map((folder) => ({
        ...folder,
        visibleProjectsCount: projectCounts.get(String(folder.id)) || 0,
      }))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  }, [filtered, folders, q, visibleFolderIds]);
  const looseProjects = useMemo(
    () => filtered.filter((project) => !project.folderId || !visibleFolderIds.has(String(project.folderId))),
    [filtered, visibleFolderIds]
  );
  const visibleProjects = useMemo(() => {
    if (!openedFolder) return looseProjects;
    return filtered.filter((project) => String(project.folderId || "") === String(openedFolder.id));
  }, [filtered, looseProjects, openedFolder]);
  const pageTitle = openedFolder ? openedFolder.name : "Мои папки";
  const pageSubtitle = openedFolder ? openedFolder.note || "Выбери проект внутри папки." : "Папки и отдельные проекты MindMap";
  const emptyTitle = viewMode === "archived" ? "В архиве пока пусто" : "Ничего не найдено";
  const emptySubtitle =
    viewMode === "archived"
      ? "Перемести проект в архив из меню карточки, и он появится здесь."
      : "Попробуй другой запрос или обнови список.";

  return (
    <div className={`flex min-h-dvh flex-col ${isLight ? "bg-slate-100 text-zinc-900" : "bg-zinc-950 text-zinc-100"}`}>
      {openedProject ? (
        <ProjectBoard project={openedProject} onBack={() => setOpenedProject(null)} entryIntent={entryIntent} />
      ) : null}

      <div className="pointer-events-none fixed inset-0">
        <div className={isLight ? "absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_55%)]" : "absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%)]"} />
        <div className={isLight ? "absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.08),transparent_55%)]" : "absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.12),transparent_55%)]"} />
        <div className={isLight ? "absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.65),transparent_40%)]" : "absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_40%)]"} />
      </div>

      {opening ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/80 px-5 py-4 text-white/85 backdrop-blur">
            Открываю проект...
          </div>
        </div>
      ) : null}

      {openErr ? (
        <div className="fixed bottom-4 left-1/2 z-[95] w-[min(720px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-100">
          {openErr}
        </div>
      ) : null}

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый проект"
        subtitle="Проект создаётся сразу в mindmap backend."
        titleValue={newTitle}
        noteValue={newNote}
        folderValue={newFolderId}
        folders={folders}
        onTitleChange={setNewTitle}
        onNoteChange={setNewNote}
        onFolderChange={setNewFolderId}
        onSubmit={createProject}
        submitLabel={createSaving ? "Создаю..." : "Создать"}
        submitDisabled={createSaving}
        titlePlaceholder={`Например: ${nextAutoTitle()}`}
        notePlaceholder="Коротко: о чём проект"
      />

      <ProjectFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Изменить проект"
        subtitle="Пока локально, без сохранения в БД."
        titleValue={editTitle}
        noteValue={editNote}
        showFolderSelect={false}
        onTitleChange={setEditTitle}
        onNoteChange={setEditNote}
        onSubmit={saveEdit}
        submitLabel="Сохранить"
        titlePlaceholder="Например: Моя карта знаний"
        notePlaceholder="Любые заметки к проекту"
        titleHint="Если оставить пустым, будет автозаголовок."
      />

      <Modal
        theme={theme}
        open={moveFolderOpen}
        onClose={() => {
          setMoveFolderOpen(false);
          setMoveFolderProject(null);
          setMoveFolderId("");
        }}
        title="Переместить в папку"
        subtitle={moveFolderProject ? `Проект: ${moveFolderProject.title}` : "Выбери папку для проекта."}
      >
        <div className="space-y-3">
          <label className="block">
            <div className={`mb-1 text-xs ${theme === "light" ? "text-zinc-500" : "text-white/60"}`}>Папка</div>
            <select
              value={moveFolderId}
              onChange={(event) => setMoveFolderId(event.target.value)}
              style={{ colorScheme: theme === "light" ? "light" : "dark" }}
              className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 ${
                theme === "light"
                  ? "border-zinc-300 bg-white text-zinc-900 focus:ring-zinc-200"
                  : "border-white/10 bg-white/5 text-white focus:ring-white/10 [&>option]:bg-white [&>option]:text-zinc-950"
              }`}
            >
              <option value="">Без папки</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button
              theme={theme}
              variant="secondary"
              onClick={() => {
                setMoveFolderOpen(false);
                setMoveFolderProject(null);
                setMoveFolderId("");
              }}
            >
              Назад
            </Button>
            <Button theme={theme} variant="primary" onClick={submitMoveToFolder} disabled={moveFolderSaving}>
              {moveFolderSaving ? "Перемещаю..." : "Принять"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal theme={theme} open={folderOpen} onClose={() => setFolderOpen(false)} title="Новая папка" subtitle="Сгруппируй несколько проектов в один раздел.">
        <div className="space-y-3">
          <label className="block">
            <div className={`mb-1 text-xs ${theme === "light" ? "text-zinc-500" : "text-white/60"}`}>Название</div>
            <input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Например: Telegram задачи"
              style={{ colorScheme: theme === "light" ? "light" : "dark" }}
              className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 ${
                theme === "light"
                  ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-200"
                  : "border-white/10 bg-white/5 text-white placeholder:text-white/35 focus:ring-white/10"
              }`}
            />
          </label>
          <label className="block">
            <div className={`mb-1 text-xs ${theme === "light" ? "text-zinc-500" : "text-white/60"}`}>Заметка</div>
            <textarea
              value={folderNote}
              onChange={(event) => setFolderNote(event.target.value)}
              placeholder="Коротко: что хранится в этой папке"
              rows={4}
              style={{ colorScheme: theme === "light" ? "light" : "dark" }}
              className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 ${
                theme === "light"
                  ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-200"
                  : "border-white/10 bg-white/5 text-white placeholder:text-white/35 focus:ring-white/10"
              }`}
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button theme={theme} variant="secondary" onClick={() => setFolderOpen(false)}>
              Отмена
            </Button>
            <Button theme={theme} variant="primary" onClick={createFolder} disabled={folderSaving || !folderName.trim()}>
              {folderSaving ? "Создаю..." : "Создать папку"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmTopSheet
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        title="Удалить проект?"
        subtitle={deleteTarget ? `Проект "${deleteTarget.title}" будет удалён.` : ""}
        confirmText="Удалить"
        onConfirm={confirmDelete}
      />

      <TasksOverviewModal
        open={tasksModalOpen}
        onClose={() => setTasksModalOpen(false)}
        loading={taskStatsLoading}
        error={taskStatsError}
        filter={tasksModalFilter}
        onFilterChange={setTasksModalFilter}
        projectId={tasksModalProjectId}
        onProjectChange={setTasksModalProjectId}
        projects={projects.filter((project) => Number.isFinite(Number(project.id)))}
        items={taskStats.items}
      />

      <ProjectAccessModal
        open={shareOpen}
        onClose={closeShareModal}
        project={shareProject}
        shares={shareItems}
        loading={shareLoading}
        saving={shareSaving}
        removingUserId={shareRemovingUserId}
        error={shareError}
        inviteEmail={shareEmail}
        onInviteEmailChange={setShareEmail}
        onSubmit={submitProjectShare}
        onRevoke={revokeProjectShare}
      />

      <header className={`relative z-10 h-16 shrink-0 border-b backdrop-blur ${isLight ? "border-zinc-300/80 bg-white/75" : "border-white/10 bg-zinc-950/40"}`}>
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <IconBtn title="Назад" onClick={() => (openedFolder ? setOpenedFolderId("") : onBack?.())}>
              <ArrowLeft className="h-4 w-4" />
            </IconBtn>

            <div className="flex min-w-0 items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${isLight ? "bg-zinc-100 ring-zinc-300" : "bg-white/5 ring-white/10"}`}>
                <FolderKanban className={`h-5 w-5 ${isLight ? "text-zinc-700" : "text-white"}`} />
              </div>
              <div className="min-w-0 leading-tight">
                <div className={`truncate text-sm font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>MindMap</div>
                <div className={`truncate text-xs ${isLight ? "text-zinc-500" : "text-white/55"}`}>
                  {openedFolder ? "Папка → проекты → карты знаний" : "Папки и проекты → карты знаний"}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <Button theme={theme} variant="secondary" onClick={() => loadWorkspace()} disabled={loading}>
              Обновить
            </Button>

            <Button theme={theme} variant="secondary" onClick={() => setFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              Новая папка
            </Button>

            <Button theme={theme} variant="secondary" onClick={() => openCreateProjectModal(openedFolder?.id || "")}>
              <Plus className="h-4 w-4" />
              Новый проект
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className={`text-2xl font-semibold tracking-tight md:text-3xl ${isLight ? "text-zinc-900" : "text-white"}`}>{pageTitle}</h1>
                <div className={`mt-1 text-sm ${isLight ? "text-zinc-500" : "text-white/55"}`}>{pageSubtitle}</div>
              </div>

              <div className="relative w-full md:w-[420px]">
                <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isLight ? "text-zinc-400" : "text-white/40"}`} />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Поиск по проектам..."
                  className={`h-11 w-full rounded-xl border pl-9 pr-3 text-sm outline-none ${isLight ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-200" : "border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:ring-2 focus:ring-white/10"}`}
                />
              </div>
            </div>

            {err ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-100">
                <div className="font-semibold">Ошибка</div>
                <div className="mt-1 text-sm opacity-90">{err}</div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard theme={theme}
                title="Активные"
                value={activeProjects.length}
                subtitle="Рабочие проекты"
                icon={<FolderKanban className={`h-5 w-5 ${isLight ? "text-zinc-700" : "text-white"}`} />}
                active={viewMode === "active"}
                onClick={() => setViewMode("active")}
              />
              <KpiCard theme={theme}
                title="Архив"
                value={archivedProjects.length}
                subtitle="Скрыты с основного списка"
                icon={<Archive className="h-5 w-5 text-white" />}
                active={viewMode === "archived"}
                onClick={() => setViewMode("archived")}
              />
              <KpiCard theme={theme}
                title="Выполнено"
                value={taskStatsLoading ? "..." : taskStats.completed}
                subtitle="Задач во всех проектах"
                icon={<CheckCircle2 className="h-5 w-5 text-white" />}
                active={tasksModalOpen && tasksModalFilter === "completed"}
                onClick={() => openTasksModal("completed")}
              />
              <KpiCard theme={theme}
                title="В ожидании"
                value={taskStatsLoading ? "..." : taskStats.pending}
                subtitle={`Сегодня завершено: ${taskStats.today}`}
                icon={<Clock3 className="h-5 w-5 text-white" />}
                active={tasksModalOpen && tasksModalFilter === "pending"}
                onClick={() => openTasksModal("pending")}
              />
            </div>

            {taskStatsError ? <div className="text-sm text-amber-200/80">{taskStatsError}</div> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button theme={theme} variant={viewMode === "active" ? "primary" : "secondary"} onClick={() => setViewMode("active")}>
                Активные
              </Button>
              <Button theme={theme} variant={viewMode === "archived" ? "primary" : "secondary"} onClick={() => setViewMode("archived")}>
                Архивированные
              </Button>
              <Pill theme={theme}>Всего: {projects.length}</Pill>
              <Pill theme={theme}>Во вкладке: {currentTabTotal}</Pill>
              <Pill theme={theme}>Показано: {filtered.length}</Pill>
              {loading ? <Pill theme={theme}>Загрузка...</Pill> : null}
            </div>

            {loading ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
                Загружаю проекты...
              </div>
            ) : (!openedFolder && rootFolders.length === 0 && looseProjects.length === 0) || (openedFolder && visibleProjects.length === 0) ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="font-medium text-white/85">{emptyTitle}</div>
                <div className="mt-1 text-sm text-white/60">{emptySubtitle}</div>
                <div className="mt-4 flex gap-2">
                  <Button variant="primary" onClick={() => loadWorkspace()}>
                    Обновить
                  </Button>
                  {viewMode === "active" ? (
                    <Button theme={theme} variant="secondary" onClick={() => openCreateProjectModal(openedFolder?.id || "")}>
                      <Plus className="h-4 w-4" />
                      Создать (локально)
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {!openedFolder ? (
                  <>
                    {rootFolders.length ? (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-white">Папки</div>
                        <div className="grid auto-rows-fr items-stretch gap-4 md:grid-cols-2">
                          {rootFolders.map((folder) => (
                            <button
                              key={folder.id}
                              type="button"
                              onClick={() => openFolder(folder)}
                              className="group flex h-full w-full flex-col rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                                    <Folder className="h-5 w-5 text-white" />
                                  </div>
                                  <div>
                                    <div className="text-base font-semibold text-white">{folder.name}</div>
                                    <div className="mt-1 line-clamp-2 text-sm text-white/65">
                                      {folder.note || "Открой папку, чтобы увидеть проекты внутри."}
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 text-white/45 transition group-hover:text-white/80" />
                              </div>
                              <div className="mt-auto pt-4">
                                <div className="flex flex-wrap gap-2">
                                  <Pill theme={theme}>Проектов: {folder.visibleProjectsCount}</Pill>
                                  <Pill theme={theme}>Активных: {folder.activeProjectsCount}</Pill>
                                  <Pill theme={theme}>В архиве: {folder.archivedProjectsCount}</Pill>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {looseProjects.length ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-white">Проекты без папки</div>
                          <Pill theme={theme}>{looseProjects.length}</Pill>
                        </div>
                        <div className="grid auto-rows-fr items-stretch gap-4 md:grid-cols-2">
                          {looseProjects.map((project) => (
                            <div key={project.id} className="h-full">
                              <ProjectCard
                                project={project}
                                onOpen={openProject}
                                onEdit={openEdit}
                                onTogglePin={togglePin}
                                onToggleArchive={toggleArchive}
                                onDelete={askDelete}
                                onMoveToFolder={openMoveToFolder}
                                onManageAccess={openShareModal}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-white">Проекты в папке</div>
                      <Pill theme={theme}>{visibleProjects.length}</Pill>
                    </div>
                    <div className="grid auto-rows-fr items-stretch gap-4 md:grid-cols-2">
                      {visibleProjects.map((project) => (
                        <div key={project.id} className="h-full">
                          <ProjectCard
                            project={project}
                            onOpen={openProject}
                            onEdit={openEdit}
                            onTogglePin={togglePin}
                            onToggleArchive={toggleArchive}
                            onDelete={askDelete}
                            onMoveToFolder={openMoveToFolder}
                            onManageAccess={openShareModal}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className={`mt-10 text-center text-xs ${isLight ? "text-zinc-400" : "text-white/40"}`}>Guido 2.0 • MindMap • projects/me</footer>
        </div>
      </main>
    </div>
  );
}

