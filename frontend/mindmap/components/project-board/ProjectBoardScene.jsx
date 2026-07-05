import BoardCanvas from "./BoardCanvas";
import ProjectBoardHeader from "./ProjectBoardHeader";
import ProjectBoardSidebar from "./ProjectBoardSidebar";
import BoardZoomControls from "./BoardZoomControls";

export default function ProjectBoardScene({
  title,
  onBack,
  theme,
  onToggleTheme,
  viewMode,
  onChangeView,
  activeCount,
  archivedCount,
  sidebarOpen,
  sidebarW,
  treeTitle,
  cards,
  links,
  activeId,
  onHoverCard,
  onLeaveCard,
  onFocusCard,
  onOpenCard,
  onResizeHandleDown,
  viewportRef,
  dotBgStyle,
  onViewportPointerDown,
  onViewportPointerMove,
  onViewportPointerUp,
  onWheel,
  cam,
  sizes,
  viewportRect,
  dragActive,
  setSizes,
  onResizeStart,
  onCardPointerDown,
  onOpenAdd,
  onOpenAddRoot,
  zoomPct,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onToggleSidebar,
  canvasEmptyTitle,
  canvasEmptyHint,
}) {
  return (
    <>
      <ProjectBoardHeader
        title={title}
        onBack={onBack}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onOpenAddRoot={onOpenAddRoot}
        viewMode={viewMode}
        onChangeView={onChangeView}
        activeCount={activeCount}
        archivedCount={archivedCount}
      />

      <div className="relative flex h-[calc(100%-56px)]">
        <ProjectBoardSidebar
          theme={theme}
          sidebarOpen={sidebarOpen}
          sidebarW={sidebarW}
          treeTitle={treeTitle}
          cards={cards}
          links={links}
          activeId={activeId}
          onHover={onHoverCard}
          onHoverOut={onLeaveCard}
          onCardClick={onFocusCard}
          onCardDoubleClick={onOpenCard}
          onResizeHandleDown={onResizeHandleDown}
        />

        <main className="relative flex-1 p-6">
          <BoardCanvas
            theme={theme}
            viewportRef={viewportRef}
            dotBgStyle={dotBgStyle}
            onViewportPointerDown={onViewportPointerDown}
            onViewportPointerMove={onViewportPointerMove}
            onViewportPointerUp={onViewportPointerUp}
            onWheel={onWheel}
            cam={cam}
            cards={cards}
            links={links}
            sizes={sizes}
            viewportRect={viewportRect}
            activeId={activeId}
            dragActive={dragActive}
            setSizes={setSizes}
            onOpenCard={onOpenCard}
            onResizeStart={onResizeStart}
            onCardPointerDown={onCardPointerDown}
            onOpenAdd={onOpenAdd}
            onEmptyAction={onOpenAddRoot}
            emptyActionLabel={viewMode === "archived" ? "" : "Создать карточку"}
            emptyTitle={canvasEmptyTitle}
            emptyHint={canvasEmptyHint}
          />

          <BoardZoomControls
            theme={theme}
            zoomPct={zoomPct}
            sidebarOpen={sidebarOpen}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
            onZoomIn={onZoomIn}
            onToggleSidebar={onToggleSidebar}
          />
        </main>
      </div>
    </>
  );
}
