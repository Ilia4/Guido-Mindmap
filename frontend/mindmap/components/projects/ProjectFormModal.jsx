import { Button, Modal } from "../common/MindmapUi";

export default function ProjectFormModal({
  open,
  onClose,
  title,
  subtitle,
  titleValue,
  noteValue,
  onTitleChange,
  onNoteChange,
  onSubmit,
  submitLabel,
  submitDisabled = false,
  titlePlaceholder,
  notePlaceholder,
  titleHint = "",
  showFolderSelect = true,
  folderValue = "",
  folders = [],
  onFolderChange,
  theme = "dark",
}) {
  const isLight = theme === "light";
  const controlStyle = { colorScheme: isLight ? "light" : "dark" };
  const fieldClass = isLight
    ? "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-200"
    : "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-white/10";

  return (
    <Modal theme={theme} open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="space-y-3">
        <label className="block">
          <div className={`mb-1 text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}>Название</div>
          <input value={titleValue} onChange={(event) => onTitleChange?.(event.target.value)} placeholder={titlePlaceholder} style={controlStyle} className={`h-11 ${fieldClass}`} />
          {titleHint ? <div className={`mt-1 text-xs ${isLight ? "text-zinc-400" : "text-white/45"}`}>{titleHint}</div> : null}
        </label>

        <label className="block">
          <div className={`mb-1 text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}>Заметка</div>
          <textarea value={noteValue} onChange={(event) => onNoteChange?.(event.target.value)} placeholder={notePlaceholder} rows={5} style={controlStyle} className={`resize-none ${fieldClass}`} />
        </label>

        {showFolderSelect ? (
          <label className="block">
            <div className={`mb-1 text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}>Папка</div>
            <select value={folderValue ?? ""} onChange={(event) => onFolderChange?.(event.target.value)} style={controlStyle} className={`h-11 ${fieldClass}`}>
              <option value="">Без папки</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button theme={theme} variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button theme={theme} variant="primary" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
