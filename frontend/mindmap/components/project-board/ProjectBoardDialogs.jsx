import AddCardModal from "../AddCardModal";
import CardDetailsModal from "../CardDetailsModal";

export default function ProjectBoardDialogs({
  theme = "dark",
  addOpen,
  addRootMode = false,
  addSide,
  parentTitle,
  addTitle,
  setAddTitle,
  onCloseAdd,
  onCreateChild,
  addPending,
  addError,
  openCard,
  onCloseCard,
  onSaveCard,
  onDeleteCard,
  onToggleArchive,
  onUploadDocument,
  onDeleteDocument,
  apiBase,
  cardSavePending,
  cardSaveErr,
}) {
  return (
    <>
      <AddCardModal
        open={addOpen}
        theme={theme}
        rootMode={addRootMode}
        side={addSide}
        parentTitle={parentTitle}
        value={addTitle}
        setValue={setAddTitle}
        onClose={onCloseAdd}
        onCreate={onCreateChild}
        pending={addPending}
        error={addError}
      />

      {!openCard && cardSaveErr ? (
        <div className="fixed bottom-4 left-1/2 z-[140] w-[min(640px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {cardSaveErr}
        </div>
      ) : null}

      <CardDetailsModal
        open={!!openCard}
        theme={theme}
        card={openCard}
        onClose={onCloseCard}
        onSave={onSaveCard}
        onDelete={onDeleteCard}
        onToggleArchive={onToggleArchive}
        onUploadDocument={onUploadDocument}
        onDeleteDocument={onDeleteDocument}
        apiBase={apiBase}
        saving={cardSavePending}
        errorMessage={cardSaveErr}
      />
    </>
  );
}
