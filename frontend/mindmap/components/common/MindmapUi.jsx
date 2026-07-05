import { AnimatePresence, motion } from "framer-motion";
import { MoreVertical, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function IconBtn({ children, onClick, title, className = "", theme = "dark" }) {
  const isLight = theme === "light";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border px-3 py-2 transition",
        isLight ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Button({ children, onClick, variant = "secondary", className = "", disabled, type = "button", theme = "dark" }) {
  const isLight = theme === "light";
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
  const tone =
    variant === "primary"
      ? isLight
        ? "bg-zinc-900 text-white hover:bg-zinc-800"
        : "bg-white text-zinc-950 hover:bg-white/90"
      : isLight
        ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
        : "border border-white/10 bg-white/5 text-white/85 hover:bg-white/10";

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(base, tone, className)}>
      {children}
    </button>
  );
}

export function Pill({ children, className = "", theme = "dark" }) {
  const isLight = theme === "light";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
        isLight ? "border-zinc-300 bg-white text-zinc-700" : "border-white/10 bg-white/5 text-white/75",
        className
      )}
    >
      {children}
    </span>
  );
}

export function ConfirmTopSheet({ open, title, subtitle, confirmText = "Удалить", onConfirm, onClose, theme = "dark" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isLight = theme === "light";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-[80]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />

          <div className="absolute inset-x-0 top-4 px-4">
            <motion.div
              initial={{ y: -16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -16, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="mx-auto w-full max-w-[720px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={cn("rounded-2xl border p-4 shadow-2xl backdrop-blur", isLight ? "border-zinc-300 bg-white/95 shadow-zinc-400/20" : "border-white/10 bg-zinc-950/80 shadow-black/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn("text-base font-semibold", isLight ? "text-zinc-900" : "text-white")}>{title}</div>
                    {subtitle ? <div className={cn("mt-1 text-sm", isLight ? "text-zinc-500" : "text-white/65")}>{subtitle}</div> : null}
                  </div>

                  <IconBtn theme={theme} title="Закрыть" onClick={onClose} className="px-2 py-2">
                    <X className="h-4 w-4" />
                  </IconBtn>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button theme={theme} variant="secondary" onClick={onClose}>
                    Отмена
                  </Button>
                  <Button
                    theme={theme}
                    variant="secondary"
                    onClick={() => {
                      onConfirm?.();
                      onClose?.();
                    }}
                    className={isLight ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-rose-500/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"}
                  >
                    <Trash2 className="h-4 w-4" />
                    {confirmText}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, subtitle, children, maxWidthClass = "max-w-[560px]", theme = "dark" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isLight = theme === "light";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ y: 12, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={cn("w-full", maxWidthClass)}
            >
              <div className={cn("rounded-2xl border p-5 shadow-2xl backdrop-blur", isLight ? "border-zinc-300 bg-white/96 shadow-zinc-400/20" : "border-white/10 bg-zinc-950/70 shadow-black/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn("truncate text-base font-semibold", isLight ? "text-zinc-900" : "text-white")}>{title}</div>
                    {subtitle ? <div className={cn("mt-1 text-sm", isLight ? "text-zinc-500" : "text-white/65")}>{subtitle}</div> : null}
                  </div>

                  <IconBtn theme={theme} title="Закрыть" onClick={onClose} className="px-2 py-2">
                    <X className="h-4 w-4" />
                  </IconBtn>
                </div>

                <div className="mt-4">{children}</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function KebabMenu({ items, theme = "dark" }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, origin: "top" });
  const isLight = theme === "light";

  function calcPos() {
    const btn = btnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuWidth = 220;
    const gap = 8;
    const approxMenuHeight = 140;

    let top = rect.bottom + gap;
    let origin = "top";

    if (top + approxMenuHeight > window.innerHeight - 8) {
      top = rect.top - gap;
      origin = "bottom";
    }

    let left = rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

    setPos({ top, left, origin });
  }

  useEffect(() => {
    if (!open) return;
    calcPos();

    const onResize = () => calcPos();
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    const onDown = (event) => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      if (btn.contains(event.target) || menu.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Меню"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition",
          isLight ? "bg-white ring-1 ring-zinc-300 hover:bg-zinc-100" : "bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
        )}
      >
        <MoreVertical className={cn("h-4 w-4", isLight ? "text-zinc-700" : "text-white/80")} />
      </button>

      {open
        ? createPortal(
            <AnimatePresence>
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: pos.origin === "top" ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.origin === "top" ? 6 : -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "fixed",
                  top: pos.origin === "top" ? pos.top : undefined,
                  left: pos.left,
                  transform: pos.origin === "bottom" ? "translateY(-100%)" : undefined,
                }}
                className={cn(
                  "z-[9999] w-[220px] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur",
                  isLight ? "border-zinc-300 bg-white/98 shadow-zinc-400/20" : "border-white/10 bg-zinc-950/90 shadow-black/35"
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="p-1">
                  {items.map((item, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        item.onClick?.();
                      }}
                      className={cn(
                        "w-full rounded-xl px-3 py-2 text-left transition",
                        item.danger
                          ? isLight
                            ? "text-rose-700 hover:bg-rose-50"
                            : "text-rose-200 hover:bg-rose-500/10"
                          : isLight
                            ? "text-zinc-800 hover:bg-zinc-100"
                            : "text-white/85 hover:bg-white/5"
                      )}
                    >
                      <span className="inline-flex items-center gap-2 text-sm">
                        {item.icon}
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>,
            document.body
          )
        : null}
    </>
  );
}
