import {
  Archive,
  ArchiveRestore,
  FolderInput,
  FolderOpen,
  GitBranch,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Shield,
  Trash2,
  Users,
} from "lucide-react";

import { formatDate, sharePermissionLabel } from "../../utils/mindmapPageUtils";
import { KebabMenu, Pill } from "../common/MindmapUi";

export default function ProjectCard({
  project,
  onOpen,
  onEdit,
  onMoveToFolder,
  onTogglePin,
  onToggleArchive,
  onDelete,
  onManageAccess,
  theme = "dark",
}) {
  const isLight = theme === "light";

  const menuItems = [
    { label: "Изменить", icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit?.(project) },
    {
      label: project.pinned ? "Открепить" : "Закрепить",
      icon: project.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />,
      onClick: () => onTogglePin?.(project),
    },
  ];

  if (project.isOwner) {
    menuItems.push({
      label: "Переместить в папку",
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => onMoveToFolder?.(project),
    });
    menuItems.push({
      label: "Доступ",
      icon: <Users className="h-4 w-4" />,
      onClick: () => onManageAccess?.(project),
    });
    menuItems.push({
      label: project.archived ? "Вернуть из архива" : "Переместить в архив",
      icon: project.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />,
      onClick: () => onToggleArchive?.(project),
    });
    menuItems.push({
      label: "Удалить",
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: () => onDelete?.(project),
    });
  }

  return (
    <button
      type="button"
      className={`group relative flex h-full w-full flex-col overflow-visible rounded-2xl border p-5 text-left transition ${
        isLight ? "border-zinc-300 bg-white/92 hover:border-zinc-400 hover:bg-zinc-50" : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
      onClick={() => onOpen?.(project)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${isLight ? "bg-zinc-100 ring-zinc-300" : "bg-white/10 ring-white/15"}`}>
            <GitBranch className={`h-5 w-5 ${isLight ? "text-zinc-700" : "text-white"}`} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`truncate text-base font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{project.title}</div>
              {project.pinned ? (
                <span className={`inline-flex items-center gap-1 text-xs ${isLight ? "text-amber-700" : "text-amber-200/90"}`}>
                  <Pin className="h-3.5 w-3.5" />
                  Закреплён
                </span>
              ) : null}
              {!project.isOwner ? (
                <span className={`inline-flex items-center gap-1 text-xs ${isLight ? "text-emerald-700" : "text-emerald-200/90"}`}>
                  <Users className="h-3.5 w-3.5" />
                  Общий доступ
                </span>
              ) : null}
              {project.archived ? (
                <span className={`inline-flex items-center gap-1 text-xs ${isLight ? "text-sky-700" : "text-sky-200/90"}`}>
                  <Archive className="h-3.5 w-3.5" />
                  Архив
                </span>
              ) : null}
            </div>

            {project.note ? (
              <div className={`mt-1 line-clamp-2 text-sm ${isLight ? "text-zinc-600" : "text-white/70"}`}>{project.note}</div>
            ) : (
              <div className={`mt-1 text-sm ${isLight ? "text-zinc-400" : "text-white/45"}`}>Без заметок</div>
            )}

            {!project.isOwner ? (
              <div className={`mt-2 flex flex-wrap gap-2 text-xs ${isLight ? "text-zinc-500" : "text-white/55"}`}>
                {project.ownerName || project.ownerEmail ? (
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" />
                    Владелец: {project.ownerName || project.ownerEmail}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Share2 className="h-3.5 w-3.5" />
                  {sharePermissionLabel(project.sharePermission)}
                </span>
              </div>
            ) : null}

            {project.folderName ? (
              <div className={`mt-2 inline-flex items-center gap-1 text-xs ${isLight ? "text-sky-700" : "text-sky-200/85"}`}>
                <FolderOpen className="h-3.5 w-3.5" />
                {project.folderName}
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0">
          <KebabMenu theme={theme} items={menuItems} />
        </div>
      </div>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-2">
          <Pill theme={theme}>Узлов: {project.nodes}</Pill>
          <Pill theme={theme}>Связей: {project.edges}</Pill>
          <Pill theme={theme}>Обновлён: {formatDate(project.updatedAt)}</Pill>
        </div>

        <div className={`mt-4 text-xs ${isLight ? "text-zinc-400" : "text-white/40"}`}>Нажми по карточке, чтобы открыть проект</div>
      </div>
    </button>
  );
}
