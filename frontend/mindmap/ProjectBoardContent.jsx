import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import ProjectBoardDialogs from "./components/project-board/ProjectBoardDialogs";
import ProjectBoardScene from "./components/project-board/ProjectBoardScene";
import { buildCardProgressMap } from "./utils/boardMetrics";
import {
  clamp,
  easeInOutCubic,
  normalizeCardHeight,
  normalizeCardWidth,
  oppositeSide,
  uid,
} from "./utils/projectBoardUtils";

function isCardArchived(card) {
  return Boolean(card?.archived ?? false);
}

export default function ProjectBoardContent({ project, onBack, entryIntent }) {
  const API_BASE = String(import.meta.env.VITE_API_MINDMAP_BASE || "").replace(/\/+$/, "");
  const TOKEN_KEY = String(import.meta.env.VITE_CORE_TOKEN_KEY || "guido_access_token");

  const initialCards = useMemo(() => project?.board?.cards ?? [], [project?.id]);
  const initialLinks = useMemo(() => project?.board?.links ?? [], [project?.id]);

  const [cards, setCards] = useState(() => initialCards);
  const [links, setLinks] = useState(() => initialLinks);
  const cardsRef = useRef(initialCards);

  const viewportRef = useRef(null);
  const [viewportRect, setViewportRect] = useState({ width: 0, height: 0 });
  const [cam, setCam] = useState({ x: 0, y: 0, zoom: 1 });

  const [sizes, setSizes] = useState({});
  const [activeId, setActiveId] = useState(null);

  const [openCardId, setOpenCardId] = useState(null);
  const [cardSavePending, setCardSavePending] = useState(false);
  const [cardSaveErr, setCardSaveErr] = useState("");
  const [cardViewMode, setCardViewMode] = useState("active");
  const THEME_STORAGE_KEY = "guido_mindmap_board_theme_v1";
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  const SIDEBAR_MIN = 320;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarW, setSidebarW] = useState(360);

  const resizeRef = useRef({
    active: false,
    startX: 0,
    startW: SIDEBAR_MIN,
  });

  const dragRef = useRef({
    active: false,
    cardId: null,
    startCardX: 0,
    startCardY: 0,
    startWorldX: 0,
    startWorldY: 0,
    startClientX: 0,
    startClientY: 0,
    pointerId: null,
  });

  const cardResizeRef = useRef({
    active: false,
    moved: false,
    cardId: null,
    startClientX: 0,
    startClientY: 0,
    startWidth: 420,
    startHeight: 260,
    latestWidth: 420,
    latestHeight: 260,
    zoom: 1,
  });

  const dragRafRef = useRef(0);
  const dragPendingRef = useRef(null);
  const focusAnimRef = useRef({ raf: 0, token: 0 });

  const panRef = useRef({
    active: false,
    startClientX: 0,
    startClientY: 0,
    startCamX: 0,
    startCamY: 0,
    pointerId: null,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addParentId, setAddParentId] = useState(null);
  const [addSide, setAddSide] = useState("top");
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState("");

  const parentTitle = useMemo(() => cards.find((card) => card.id === addParentId)?.title || "", [cards, addParentId]);
  const addRootMode = !addParentId;
  const activeCards = useMemo(() => cards.filter((card) => !isCardArchived(card)), [cards]);
  const archivedCards = useMemo(() => cards.filter((card) => isCardArchived(card)), [cards]);
  const visibleCards = useMemo(
    () => (cardViewMode === "archived" ? archivedCards : activeCards),
    [cardViewMode, archivedCards, activeCards]
  );
  const visibleCardIds = useMemo(() => new Set(visibleCards.map((card) => String(card.id))), [visibleCards]);
  const visibleLinks = useMemo(
    () =>
      links.filter(
        (link) => visibleCardIds.has(String(link.from ?? "")) && visibleCardIds.has(String(link.to ?? ""))
      ),
    [links, visibleCardIds]
  );
  const visibleProgressById = useMemo(
    () => buildCardProgressMap(visibleCards, visibleLinks),
    [visibleCards, visibleLinks]
  );
  const visibleCardsWithProgress = useMemo(
    () =>
      visibleCards.map((card) => ({
        ...card,
        progressMetrics: visibleProgressById.get(String(card.id)) || null,
      })),
    [visibleCards, visibleProgressById]
  );
  const openCard = useMemo(
    () => visibleCardsWithProgress.find((card) => card.id === openCardId) || null,
    [visibleCardsWithProgress, openCardId]
  );

  function getSidebarMax() {
    return Math.max(SIDEBAR_MIN, Math.floor(window.innerWidth * 0.5));
  }

  useEffect(() => {
    const onResize = () => {
      setSidebarW((width) => clamp(width, SIDEBAR_MIN, getSidebarMax()));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setCards(project?.board?.cards ?? []);
    setLinks(project?.board?.links ?? []);

    setActiveId(null);
    setOpenCardId(null);
    setCardSavePending(false);
    setCardSaveErr("");
    setCardViewMode("active");
    setAddOpen(false);
    setAddPending(false);
    setAddError("");
    setAddTitle("");
    setAddParentId(null);

    stopDrag();
    cancelFocusAnim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    setCardSaveErr("");
  }, [openCardId]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    if (!entryIntent?.nonce || String(entryIntent.projectId || "") !== String(project?.id || "")) return;

    const targetCardId = String(entryIntent.cardId || "");
    const targetCard = cards.find((card) => String(card.id) === targetCardId);
    if (!targetCardId || !targetCard) return;

    setCardViewMode(isCardArchived(targetCard) ? "archived" : "active");
    focusCard(targetCardId);
    setOpenCardId(targetCardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIntent?.nonce, entryIntent?.projectId, entryIntent?.cardId, project?.id, cards]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    if (activeId && !visibleCardIds.has(String(activeId))) {
      setActiveId(null);
    }
  }, [activeId, visibleCardIds]);

  useEffect(() => {
    if (!addOpen || !addParentId || visibleCardIds.has(String(addParentId))) return;
    setAddOpen(false);
    setAddPending(false);
    setAddError("");
    setAddTitle("");
    setAddParentId(null);
  }, [addOpen, addParentId, visibleCardIds]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewportRect({ width: rect.width, height: rect.height });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  function onResizeHandleDown(event) {
    event.preventDefault();
    event.stopPropagation();

    resizeRef.current.active = true;
    resizeRef.current.startX = event.clientX;
    resizeRef.current.startW = sidebarW;

    window.addEventListener("pointermove", onResizeHandleMove);
    window.addEventListener("pointerup", onResizeHandleUp, { once: true });

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onResizeHandleMove(event) {
    if (!resizeRef.current.active) return;
    const dx = event.clientX - resizeRef.current.startX;
    const next = resizeRef.current.startW + dx;
    setSidebarW(clamp(next, SIDEBAR_MIN, getSidebarMax()));
  }

  function onResizeHandleUp() {
    resizeRef.current.active = false;
    window.removeEventListener("pointermove", onResizeHandleMove);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function getViewportRect() {
    const el = viewportRef.current;
    return el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  }

  function clientToWorld(clientX, clientY, zoomOverride) {
    const rect = getViewportRect();
    const zoom = zoomOverride ?? cam.zoom;
    return {
      x: (clientX - rect.left) / zoom - cam.x,
      y: (clientY - rect.top) / zoom - cam.y,
    };
  }

  function cancelFocusAnim() {
    focusAnimRef.current.token += 1;
    if (focusAnimRef.current.raf) {
      cancelAnimationFrame(focusAnimRef.current.raf);
      focusAnimRef.current.raf = 0;
    }
  }

  function onViewportPointerDown(event) {
    cancelFocusAnim();
    if (event.button !== 0) return;
    if (dragRef.current.active) return;

    event.preventDefault();
    panRef.current.active = true;
    panRef.current.startClientX = event.clientX;
    panRef.current.startClientY = event.clientY;
    panRef.current.startCamX = cam.x;
    panRef.current.startCamY = cam.y;
    panRef.current.pointerId = event.pointerId;

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onViewportPointerMove(event) {
    if (!panRef.current.active) return;

    const dx = event.clientX - panRef.current.startClientX;
    const dy = event.clientY - panRef.current.startClientY;

    setCam((prev) => ({
      ...prev,
      x: panRef.current.startCamX + dx / prev.zoom,
      y: panRef.current.startCamY + dy / prev.zoom,
    }));
  }

  function onViewportPointerUp() {
    panRef.current.active = false;
    panRef.current.pointerId = null;
  }

  function onWheel(event) {
    event.preventDefault();

    const rect = getViewportRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;

    const wx = sx / cam.zoom - cam.x;
    const wy = sy / cam.zoom - cam.y;

    const zoomStep = 0.0018;
    const nextZoom = clamp(cam.zoom * Math.exp(-event.deltaY * zoomStep), 0.35, 2.2);

    setCam({
      x: sx / nextZoom - wx,
      y: sy / nextZoom - wy,
      zoom: nextZoom,
    });
  }

  function zoomAtScreenPoint(nextZoom, sx, sy) {
    const zoom = clamp(nextZoom, 0.35, 2.2);
    const wx = sx / cam.zoom - cam.x;
    const wy = sy / cam.zoom - cam.y;

    setCam({
      x: sx / zoom - wx,
      y: sy / zoom - wy,
      zoom,
    });
  }

  function zoomIn() {
    const rect = getViewportRect();
    zoomAtScreenPoint(cam.zoom * 1.12, rect.width / 2, rect.height / 2);
  }

  function zoomOut() {
    const rect = getViewportRect();
    zoomAtScreenPoint(cam.zoom / 1.12, rect.width / 2, rect.height / 2);
  }

  function zoomReset() {
    const rect = getViewportRect();
    zoomAtScreenPoint(1, rect.width / 2, rect.height / 2);
  }

  const zoomPct = Math.round(cam.zoom * 100);

  function focusCard(cardId) {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;

    const size = sizes[cardId] || {
      w: normalizeCardWidth(card.width),
      h: normalizeCardHeight(card.height),
    };

    const rect = getViewportRect();
    const targetWorldX = card.x + size.w / 2;
    const targetWorldY = card.y + size.h / 2;
    const targetCamX = rect.width / 2 / cam.zoom - targetWorldX;
    const targetCamY = rect.height / 2 / cam.zoom - targetWorldY;

    cancelFocusAnim();
    const myToken = focusAnimRef.current.token;
    const startCam = { x: cam.x, y: cam.y };
    const dx = targetCamX - startCam.x;
    const dy = targetCamY - startCam.y;
    const dist = Math.hypot(dx, dy);
    const duration = clamp(260 + dist * 0.25, 260, 900);
    const t0 = performance.now();

    const tick = (now) => {
      if (focusAnimRef.current.token !== myToken) return;

      const t = clamp((now - t0) / duration, 0, 1);
      const k = easeInOutCubic(t);

      setCam((prev) => ({
        ...prev,
        x: startCam.x + dx * k,
        y: startCam.y + dy * k,
      }));

      if (t < 1) {
        focusAnimRef.current.raf = requestAnimationFrame(tick);
      } else {
        focusAnimRef.current.raf = 0;
      }
    };

    focusAnimRef.current.raf = requestAnimationFrame(tick);
  }

  function openCardModal(cardOrId) {
    const id = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
    if (!id || !cards.some((item) => item.id === id)) return;
    setOpenCardId(id);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл."));
      reader.readAsDataURL(file);
    });
  }

  function applyServerCard(payload, serverCard) {
    const nextCard = serverCard
      ? {
          ...serverCard,
          width: normalizeCardWidth(serverCard.width),
          height: normalizeCardHeight(serverCard.height),
          x: Number.isFinite(Number(serverCard.x)) ? Number(serverCard.x) : payload?.x,
          y: Number.isFinite(Number(serverCard.y)) ? Number(serverCard.y) : payload?.y,
        }
      : payload;

    if (!nextCard?.id) return null;

    setCards((prev) => {
      const next = prev.map((card) =>
        card.id === nextCard.id
          ? {
              ...card,
              ...(payload || {}),
              ...nextCard,
            }
          : card
      );
      cardsRef.current = next;
      return next;
    });

    return nextCard;
  }

  async function saveCardModal(cardPatch, { showPending = true } = {}) {
    if (!cardPatch?.id) return false;

    try {
      if (showPending) setCardSavePending(true);
      setCardSaveErr("");

      if (!project?.id) throw new Error("Не найден проект для сохранения карточки.");
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}).`);

      const payload = {
        ...cardPatch,
        width: normalizeCardWidth(cardPatch.width),
        height: normalizeCardHeight(cardPatch.height),
      };

      const res = await fetch(`${API_BASE}/api/projects/${project.id}/cards/${encodeURIComponent(payload.id)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text().catch(() => "");
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (res.status === 401) throw new Error("401: токен недействителен или просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к карточке.");
      if (res.status === 404) throw new Error("404: карточка или проект не найдены.");
      if (!res.ok) {
        const detail = data?.detail || rawText || res.statusText;
        throw new Error(`Ошибка сохранения карточки (${res.status}): ${detail}`);
      }

      applyServerCard(payload, data?.card);
      return true;
    } catch (error) {
      setCardSaveErr(error?.message || "Не удалось сохранить карточку.");
      return false;
    } finally {
      if (showPending) setCardSavePending(false);
    }
  }

  async function uploadCardDocument(cardId, file) {
    if (!cardId) throw new Error("Не найдена карточка для загрузки файла.");
    if (!project?.id) throw new Error("Не найден проект.");
    if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}).`);

    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch(`${API_BASE}/api/projects/${project.id}/cards/${encodeURIComponent(cardId)}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        data: dataUrl,
      }),
    });

    const rawText = await res.text().catch(() => "");
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (res.status === 401) throw new Error("401: токен недействителен или просрочен.");
    if (res.status === 403) throw new Error("403: нет доступа к карточке.");
    if (res.status === 404) throw new Error("404: карточка или проект не найдены.");
    if (!res.ok) throw new Error(data?.detail || rawText || `Ошибка загрузки файла (${res.status}).`);

    applyServerCard(cardsRef.current.find((item) => item.id === cardId), data?.card);
    return data;
  }

  async function toggleCardArchive(cardOrId) {
    const id = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
    const card = cardsRef.current.find((item) => item.id === id);
    if (!card) return false;

    const ok = await saveCardModal(
      {
        ...card,
        archived: !isCardArchived(card),
      },
      { showPending: true }
    );

    if (!ok) return false;

    if (openCardId === id) setOpenCardId(null);
    if (activeId === id) setActiveId(null);

    if (addParentId === id) {
      setAddOpen(false);
      setAddPending(false);
      setAddError("");
      setAddTitle("");
      setAddParentId(null);
    }

    return true;
  }

  async function deleteCardDocument(cardId, documentItem) {
    const documentId = Number(documentItem?.dbId ?? documentItem?.id);
    if (!Number.isFinite(documentId)) throw new Error("Не найден идентификатор вложения.");
    if (!cardId) throw new Error("Не найдена карточка.");
    if (!project?.id) throw new Error("Не найден проект.");
    if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}).`);

    const res = await fetch(
      `${API_BASE}/api/projects/${project.id}/cards/${encodeURIComponent(cardId)}/documents/${documentId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const rawText = await res.text().catch(() => "");
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (res.status === 401) throw new Error("401: токен недействителен или просрочен.");
    if (res.status === 403) throw new Error("403: нет доступа к карточке.");
    if (res.status === 404) throw new Error("404: вложение не найдено.");
    if (!res.ok) throw new Error(data?.detail || rawText || `Ошибка удаления файла (${res.status}).`);

    applyServerCard(cardsRef.current.find((item) => item.id === cardId), data?.card);
    return data;
  }

  async function deleteCard(cardOrId) {
    const cardId = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
    if (!cardId) throw new Error("Не найдена карточка.");
    if (!project?.id) throw new Error("Не найден проект.");
    if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}).`);

    const res = await fetch(`${API_BASE}/api/projects/${project.id}/cards/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawText = await res.text().catch(() => "");
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (res.status === 401) throw new Error("401: токен недействителен или просрочен.");
    if (res.status === 403) throw new Error("403: нет доступа к карточке.");
    if (res.status === 404) throw new Error("404: карточка не найдена.");
    if (!res.ok) throw new Error(data?.detail || rawText || `Ошибка удаления карточки (${res.status}).`);

    setCards((prev) => {
      const next = prev.filter((item) => item.id !== cardId);
      cardsRef.current = next;
      return next;
    });
    setLinks((prev) => prev.filter((link) => String(link.from) !== String(cardId) && String(link.to) !== String(cardId)));

    if (openCardId === cardId) setOpenCardId(null);
    if (activeId === cardId) setActiveId(null);
    if (addParentId === cardId) {
      setAddOpen(false);
      setAddPending(false);
      setAddError("");
      setAddTitle("");
      setAddParentId(null);
    }

    return data;
  }

  function onCardResizePointerDown(event, cardOrId) {
    if (event.button !== 0) return;

    const id = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
    const card = cardsRef.current.find((item) => item.id === id);
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();

    cardResizeRef.current.active = true;
    cardResizeRef.current.moved = false;
    cardResizeRef.current.cardId = id;
    cardResizeRef.current.startClientX = event.clientX;
    cardResizeRef.current.startClientY = event.clientY;
    cardResizeRef.current.startWidth = normalizeCardWidth(card.width ?? sizes[id]?.w);
    cardResizeRef.current.startHeight = normalizeCardHeight(card.height ?? sizes[id]?.h);
    cardResizeRef.current.latestWidth = cardResizeRef.current.startWidth;
    cardResizeRef.current.latestHeight = cardResizeRef.current.startHeight;
    cardResizeRef.current.zoom = cam.zoom;

    window.addEventListener("pointermove", onCardResizePointerMove);
    window.addEventListener("pointerup", onCardResizePointerUp, { once: true });

    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  }

  function onCardResizePointerMove(event) {
    if (!cardResizeRef.current.active || !cardResizeRef.current.cardId) return;

    const zoom = cardResizeRef.current.zoom || 1;
    const dx = (event.clientX - cardResizeRef.current.startClientX) / zoom;
    const dy = (event.clientY - cardResizeRef.current.startClientY) / zoom;

    const nextWidth = normalizeCardWidth(cardResizeRef.current.startWidth + dx);
    const nextHeight = normalizeCardHeight(cardResizeRef.current.startHeight + dy);
    cardResizeRef.current.latestWidth = nextWidth;
    cardResizeRef.current.latestHeight = nextHeight;

    if (
      Math.abs(nextWidth - cardResizeRef.current.startWidth) > 2 ||
      Math.abs(nextHeight - cardResizeRef.current.startHeight) > 2
    ) {
      cardResizeRef.current.moved = true;
    }

    setCards((prev) =>
      prev.map((card) =>
        card.id === cardResizeRef.current.cardId ? { ...card, width: nextWidth, height: nextHeight } : card
      )
    );
  }

  async function onCardResizePointerUp() {
    const { active, moved, cardId } = cardResizeRef.current;

    cardResizeRef.current.active = false;
    cardResizeRef.current.cardId = null;
    window.removeEventListener("pointermove", onCardResizePointerMove);

    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (!active || !moved || !cardId) return;

    const card = cardsRef.current.find((item) => item.id === cardId);
    if (!card) return;

    await saveCardModal(
      {
        ...card,
        width: cardResizeRef.current.latestWidth,
        height: cardResizeRef.current.latestHeight,
      },
      { showPending: false }
    );
  }

  function onCardPointerDown(event, cardId) {
    if (event.button !== 0) return;

    event.stopPropagation();
    event.preventDefault();

    const card = cards.find((item) => item.id === cardId);
    if (!card) return;

    const world = clientToWorld(event.clientX, event.clientY);

    dragRef.current.active = false;
    dragRef.current.cardId = cardId;
    dragRef.current.startCardX = card.x;
    dragRef.current.startCardY = card.y;
    dragRef.current.startWorldX = world.x;
    dragRef.current.startWorldY = world.y;
    dragRef.current.startClientX = event.clientX;
    dragRef.current.startClientY = event.clientY;
    dragRef.current.pointerId = event.pointerId;

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const id = dragRef.current.cardId;
    if (!id) return;

    if (!dragRef.current.active) {
      const moved = Math.hypot(
        event.clientX - dragRef.current.startClientX,
        event.clientY - dragRef.current.startClientY
      );

      if (moved < 6) return;
      dragRef.current.active = true;
    }

    const world = clientToWorld(event.clientX, event.clientY);
    const dx = world.x - dragRef.current.startWorldX;
    const dy = world.y - dragRef.current.startWorldY;

    dragPendingRef.current = {
      id,
      x: dragRef.current.startCardX + dx,
      y: dragRef.current.startCardY + dy,
    };

    if (dragRafRef.current) return;

    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = 0;
      const pending = dragPendingRef.current;
      if (!pending) return;

      setCards((prev) => prev.map((card) => (card.id === pending.id ? { ...card, x: pending.x, y: pending.y } : card)));
    });
  }

  function stopDrag() {
    const wasDragging = dragRef.current.active;
    const cardId = dragRef.current.cardId;
    const pending = dragPendingRef.current;

    if (pending?.id) {
      setCards((prev) => prev.map((card) => (card.id === pending.id ? { ...card, x: pending.x, y: pending.y } : card)));
      cardsRef.current = cardsRef.current.map((card) =>
        card.id === pending.id ? { ...card, x: pending.x, y: pending.y } : card
      );
    }

    dragRef.current.active = false;
    dragRef.current.cardId = null;
    dragRef.current.pointerId = null;
    dragRef.current.startClientX = 0;
    dragRef.current.startClientY = 0;

    dragPendingRef.current = null;
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
    }

    if (wasDragging && cardId) {
      const latestCard = cardsRef.current.find((item) => item.id === cardId);
      if (latestCard) {
        void saveCardModal(latestCard, { showPending: false });
      }
      return;
    }

    if (cardId) {
      openCardModal(cardId);
    }
  }

  const dotBgStyle = useMemo(() => {
    const step = 26;
    const dot = 1.6;
    const bgX = cam.x * cam.zoom;
    const bgY = cam.y * cam.zoom;
    const dotColor = theme === "light" ? "rgba(24,24,27,0.16)" : "rgba(255,255,255,0.14)";
    const bgColor = theme === "light" ? "rgba(248,250,252,1)" : "rgba(9,9,11,1)";

    return {
      backgroundImage: `radial-gradient(circle, ${dotColor} ${dot}px, transparent ${dot}px)`,
      backgroundSize: `${step * cam.zoom}px ${step * cam.zoom}px`,
      backgroundPosition: `${bgX}px ${bgY}px`,
      backgroundColor: bgColor,
    };
  }, [cam.x, cam.y, cam.zoom, theme]);

  function openAdd(parentId, side) {
    setAddParentId(parentId);
    setAddSide(side);
    setAddTitle("");
    setAddError("");
    setAddPending(false);
    setAddOpen(true);
  }

  function openAddRoot() {
    setAddParentId(null);
    setAddSide("bottom");
    setAddTitle("");
    setAddError("");
    setAddPending(false);
    setAddOpen(true);
  }

  async function createChild() {
    const parent = cardsRef.current.find((card) => card.id === addParentId);

    const title = (addTitle || "").trim() || "Новая карточка";
    const id = uid();
    const isRootCard = !parent;

    let x = 0;
    let y = 0;

    if (parent) {
      const size = sizes[parent.id] || { w: 340, h: 220 };
      const gap = 140;

      x = parent.x;
      y = parent.y;

      if (addSide === "top") y = parent.y - (size.h + gap);
      if (addSide === "bottom") y = parent.y + (size.h + gap);
      if (addSide === "left") x = parent.x - (size.w + gap);
      if (addSide === "right") x = parent.x + (size.w + gap);
    } else {
      x = Number.isFinite(Number(cam?.x)) ? Math.round((-cam.x + 120) * 100) / 100 : 0;
      y = Number.isFinite(Number(cam?.y)) ? Math.round((-cam.y + 40) * 100) / 100 : 0;
    }

    try {
      if (!project?.id) throw new Error("Не найден проект.");
      if (!API_BASE) throw new Error("VITE_API_MINDMAP_BASE не задан.");

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error(`Нет токена в localStorage (${TOKEN_KEY}).`);

      setAddPending(true);
      setAddError("");

      const payload = {
        id,
        parentId: parent?.id ?? null,
        side: isRootCard ? null : addSide,
        title,
        content: title,
        x,
        y,
        width: 420,
        height: 260,
        importance: null,
        urgency: null,
        color: parent?.color || "#71717a",
      };

      const res = await fetch(`${API_BASE}/api/projects/${project.id}/cards`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text().catch(() => "");
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (res.status === 401) throw new Error("401: токен недействителен или просрочен.");
      if (res.status === 403) throw new Error("403: нет доступа к проекту.");
      if (res.status === 404) throw new Error("404: проект или родительская карточка не найдены.");
      if (!res.ok) {
        const detail = data?.detail || rawText || res.statusText;
        throw new Error(`Ошибка создания карточки (${res.status}): ${detail}`);
      }

      const createdCard = {
        ...payload,
        ...(data?.card || {}),
        width: normalizeCardWidth(data?.card?.width ?? payload.width),
        height: normalizeCardHeight(data?.card?.height ?? payload.height),
        x: Number.isFinite(Number(data?.card?.x)) ? Number(data.card.x) : x,
        y: Number.isFinite(Number(data?.card?.y)) ? Number(data.card.y) : y,
      };

      if (!createdCard?.id) {
        throw new Error("Сервер не вернул созданную карточку.");
      }

      setCards((prev) => {
        const exists = prev.some((card) => card.id === createdCard.id);
        const next = exists
          ? prev.map((card) => (card.id === createdCard.id ? { ...card, ...createdCard } : card))
          : [...prev, createdCard];
        cardsRef.current = next;
        return next;
      });

      if (data?.link) {
        setLinks((prev) => {
          const nextLink = {
            id: String(data.link.id ?? uid()),
            from: String(data.link.from ?? parent?.id ?? ""),
            to: String(data.link.to ?? createdCard.id),
            fromSide: data.link.fromSide ?? addSide,
            toSide: data.link.toSide ?? oppositeSide(addSide),
          };
          if (prev.some((link) => link.id === nextLink.id)) return prev;
          return [...prev, nextLink];
        });
      }

      setAddOpen(false);
      setAddParentId(null);
      setAddTitle("");
      setAddError("");
      setActiveId(createdCard.id);

      requestAnimationFrame(() => {
        focusCard(createdCard.id);
      });
    } catch (error) {
      setAddError(error?.message || "Не удалось создать карточку.");
    } finally {
      setAddPending(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-[100] ${theme === "light" ? "bg-slate-100 text-zinc-900" : "bg-zinc-950 text-zinc-100"}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.25 }}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <ProjectBoardScene
          title={project?.title}
          onBack={onBack}
          theme={theme}
          onToggleTheme={() => setTheme((value) => (value === "light" ? "dark" : "light"))}
          viewMode={cardViewMode}
          onChangeView={setCardViewMode}
          activeCount={activeCards.length}
          archivedCount={archivedCards.length}
          sidebarOpen={sidebarOpen}
          sidebarW={sidebarW}
          treeTitle={cardViewMode === "archived" ? "Архив карточек" : "Карточки проекта"}
          cards={visibleCardsWithProgress}
          links={visibleLinks}
          activeId={activeId}
          onHoverCard={setActiveId}
          onLeaveCard={() => setActiveId(null)}
          onFocusCard={focusCard}
          onOpenCard={openCardModal}
          onResizeHandleDown={onResizeHandleDown}
          viewportRef={viewportRef}
          dotBgStyle={dotBgStyle}
          onViewportPointerDown={onViewportPointerDown}
          onViewportPointerMove={onViewportPointerMove}
          onViewportPointerUp={onViewportPointerUp}
          onWheel={onWheel}
          cam={cam}
          sizes={sizes}
          viewportRect={viewportRect}
          dragActive={dragRef.current.active}
          setSizes={setSizes}
          onResizeStart={onCardResizePointerDown}
          onCardPointerDown={onCardPointerDown}
          onOpenAdd={openAdd}
          onOpenAddRoot={openAddRoot}
          zoomPct={zoomPct}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
          onZoomIn={zoomIn}
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          canvasEmptyTitle={cardViewMode === "archived" ? "Архив карточек пуст" : "На поле пока нет карточек"}
          canvasEmptyHint={
            cardViewMode === "archived"
              ? "Перемести карточку в архив из её окна, и она появится здесь."
              : "Создай первую карточку или верни её из архива."
          }
        />

        <ProjectBoardDialogs
          theme={theme}
          addOpen={addOpen}
          addRootMode={addRootMode}
          addSide={addSide}
          parentTitle={parentTitle}
          addTitle={addTitle}
          setAddTitle={setAddTitle}
          onCloseAdd={() => setAddOpen(false)}
          onCreateChild={createChild}
          addPending={addPending}
          addError={addError}
          openCard={openCard}
          onCloseCard={() => setOpenCardId(null)}
          onSaveCard={saveCardModal}
          onDeleteCard={deleteCard}
          onToggleArchive={toggleCardArchive}
          onUploadDocument={uploadCardDocument}
          onDeleteDocument={deleteCardDocument}
          apiBase={API_BASE}
          cardSavePending={cardSavePending}
          cardSaveErr={cardSaveErr}
        />
      </motion.div>
    </AnimatePresence>
  );
}
