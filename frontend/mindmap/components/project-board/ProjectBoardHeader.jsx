import { ArrowLeft, Moon, Plus, Sun } from "lucide-react";

import { IconBtn } from "../common/MindmapUi";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function ProjectBoardHeader({
  title,
  onBack,
  theme = "dark",
  onToggleTheme,
  onOpenAddRoot,
  viewMode = "active",
  onChangeView,
  activeCount = 0,
  archivedCount = 0,
}) {
  const isLight = theme === "light";
  const titleClass = isLight ? "text-zinc-900" : "text-white";
  const frameClass = isLight ? "border-zinc-300/70 bg-white/80" : "border-white/10";
  const activeTabClass = isLight ? "border-zinc-900 bg-zinc-900 text-white" : "border-white/20 bg-white/12 text-white";
  const idleTabClass = isLight
    ? "border-zinc-300/80 bg-white text-zinc-700 hover:bg-zinc-100"
    : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10";
  const utilityClass = isLight
    ? "border-zinc-300/80 bg-white text-zinc-700 hover:bg-zinc-100"
    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10";

  return (
    <div className={cn("flex h-14 items-center gap-3 border-b px-4 backdrop-blur", frameClass)}>
      <IconBtn onClick={onBack} title="Назад" className={utilityClass}>
        <ArrowLeft className="h-4 w-4" />
      </IconBtn>

      <div className={cn("min-w-0 flex-1 truncate font-semibold", titleClass)}>{title || "Проект"}</div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeView?.("active")}
          className={cn("rounded-2xl border px-3 py-1.5 text-sm transition", viewMode === "active" ? activeTabClass : idleTabClass)}
        >
          Поле ({activeCount})
        </button>

        <button
          type="button"
          onClick={() => onChangeView?.("archived")}
          className={cn("rounded-2xl border px-3 py-1.5 text-sm transition", viewMode === "archived" ? activeTabClass : idleTabClass)}
        >
          Архив ({archivedCount})
        </button>

        <IconBtn onClick={onOpenAddRoot} title="Создать независимое дерево" className={utilityClass}>
          <Plus className="h-4 w-4" />
        </IconBtn>

        <IconBtn onClick={onToggleTheme} title={isLight ? "Темная тема" : "Светлая тема"} className={utilityClass}>
          {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </IconBtn>
      </div>
    </div>
  );
}
