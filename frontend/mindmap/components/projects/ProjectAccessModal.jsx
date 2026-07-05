import { Mail, Share2, Shield, UserPlus, UserX } from "lucide-react";

import { formatDateTime, sharePermissionLabel } from "../../utils/mindmapPageUtils";
import { Button, Modal, Pill } from "../common/MindmapUi";

export default function ProjectAccessModal({
  open,
  onClose,
  project,
  shares,
  loading,
  saving,
  removingUserId,
  error,
  inviteEmail,
  onInviteEmailChange,
  onSubmit,
  onRevoke,
  theme = "dark",
}) {
  const isLight = theme === "light";
  const controlStyle = { colorScheme: isLight ? "light" : "dark" };
  const fieldClass = isLight
    ? "h-11 w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-200"
    : "h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-white/10";

  return (
    <Modal
      theme={theme}
      open={open}
      onClose={onClose}
      title={project ? `Доступ к проекту: ${project.title || "Без названия"}` : "Доступ к проекту"}
      subtitle="Владелец может выдать доступ по email и в любой момент его отозвать."
    >
      <div className="space-y-4">
        {error ? <div className={`rounded-2xl border px-4 py-3 text-sm ${isLight ? "border-rose-300 bg-rose-50 text-rose-700" : "border-rose-500/20 bg-rose-500/10 text-rose-100"}`}>{error}</div> : null}

        <div className={`rounded-2xl border p-4 ${isLight ? "border-zinc-300 bg-zinc-50" : "border-white/10 bg-white/[0.04]"}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ${isLight ? "bg-white ring-zinc-300" : "bg-white/10 ring-white/10"}`}>
              <Shield className={`h-4 w-4 ${isLight ? "text-zinc-700" : "text-white"}`} />
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>Владелец</div>
              <div className={`mt-1 text-sm ${isLight ? "text-zinc-600" : "text-white/70"}`}>{project?.ownerName || project?.ownerEmail || "Текущий владелец проекта"}</div>
              {project?.ownerEmail && project?.ownerName && project.ownerEmail !== project.ownerName ? <div className={`mt-1 text-xs ${isLight ? "text-zinc-500" : "text-white/45"}`}>{project.ownerEmail}</div> : null}
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${isLight ? "border-zinc-300 bg-zinc-50" : "border-white/10 bg-white/[0.04]"}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="block flex-1">
              <div className={`mb-1 text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}>Email пользователя</div>
              <div className="relative">
                <Mail className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isLight ? "text-zinc-400" : "text-white/35"}`} />
                <input value={inviteEmail} onChange={(event) => onInviteEmailChange?.(event.target.value)} placeholder="name@example.com" style={controlStyle} className={fieldClass} />
              </div>
            </label>

            <Button theme={theme} variant="primary" onClick={onSubmit} disabled={saving || !inviteEmail.trim()} className="h-11 shrink-0">
              <UserPlus className="h-4 w-4" />
              {saving ? "Открываю доступ..." : "Открыть доступ"}
            </Button>
          </div>

          <div className={`mt-2 text-xs ${isLight ? "text-zinc-500" : "text-white/45"}`}>
            Пользователь должен хотя бы один раз открыть новый mindmap, чтобы его email появился в локальной базе.
          </div>
        </div>

        <div className={`rounded-2xl border ${isLight ? "border-zinc-300 bg-zinc-50" : "border-white/10 bg-white/[0.04]"}`}>
          <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isLight ? "border-zinc-300" : "border-white/10"}`}>
            <div className={`text-sm font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>Кому уже открыт доступ</div>
            <Pill theme={theme}>{shares.length}</Pill>
          </div>

          <div className="p-3">
            {loading ? (
              <div className={`rounded-2xl border px-4 py-8 text-center text-sm ${isLight ? "border-zinc-300 bg-white text-zinc-500" : "border-white/10 bg-white/5 text-white/55"}`}>
                Загружаю список доступов...
              </div>
            ) : shares.length === 0 ? (
              <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLight ? "border-zinc-300 bg-white text-zinc-500" : "border-white/10 bg-white/[0.02] text-white/45"}`}>
                Доступ пока никому не выдан.
              </div>
            ) : (
              <div className="space-y-3">
                {shares.map((share) => (
                  <div key={share.userId} className={`rounded-2xl border px-4 py-4 ${isLight ? "border-zinc-300 bg-white" : "border-white/10 bg-zinc-900/70"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${isLight ? "text-zinc-900" : "text-white"}`}>{share.username || share.email || `User #${share.userId}`}</div>
                        <div className={`mt-1 text-sm ${isLight ? "text-zinc-600" : "text-white/65"}`}>{share.email || "Email не указан"}</div>
                        <div className={`mt-2 flex flex-wrap gap-2 text-xs ${isLight ? "text-zinc-600" : "text-white/60"}`}>
                          <Pill theme={theme}>
                            <Share2 className="h-3.5 w-3.5" />
                            {sharePermissionLabel(share.permission)}
                          </Pill>
                          {share.lastActive ? <Pill theme={theme}>Активность: {formatDateTime(share.lastActive)}</Pill> : null}
                        </div>
                      </div>

                      <Button
                        theme={theme}
                        variant="secondary"
                        onClick={() => onRevoke?.(share)}
                        disabled={saving || removingUserId === share.userId}
                        className={isLight ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-rose-500/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"}
                      >
                        <UserX className="h-4 w-4" />
                        {removingUserId === share.userId ? "Убираю..." : "Убрать доступ"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
