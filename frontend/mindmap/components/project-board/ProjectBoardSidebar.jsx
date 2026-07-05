import { motion } from "framer-motion";

import BoardTreePanel from "../BoardTreePanel";

export default function ProjectBoardSidebar({
  theme = "dark",
  sidebarOpen,
  sidebarW,
  treeTitle,
  cards,
  links,
  activeId,
  onHover,
  onHoverOut,
  onCardClick,
  onCardDoubleClick,
  onResizeHandleDown,
}) {
  const isLight = theme === "light";

  return (
    <motion.aside
      className={`relative overflow-hidden border-r ${isLight ? "border-zinc-300/70 bg-white/80" : "border-white/10 bg-zinc-950/30"}`}
      animate={{ width: sidebarOpen ? sidebarW : 0 }}
      transition={{ type: "tween", duration: 0.18 }}
    >
      <div className="h-full p-3">
        <BoardTreePanel
          theme={theme}
          title={treeTitle}
          cards={cards}
          links={links}
          activeId={activeId}
          onHover={onHover}
          onHoverOut={onHoverOut}
          onClick={onCardClick}
          onDoubleClick={onCardDoubleClick}
        />
      </div>

      {sidebarOpen ? (
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onResizeHandleDown}
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent"
          title="Потяни, чтобы изменить ширину"
        >
          <div className={`absolute right-0 top-0 h-full w-[1px] ${isLight ? "bg-zinc-300/80" : "bg-white/10"}`} />
        </div>
      ) : null}
    </motion.aside>
  );
}
