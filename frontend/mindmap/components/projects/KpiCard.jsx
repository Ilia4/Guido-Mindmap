function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function KpiCard({ title, value, subtitle, icon, active = false, onClick, theme = "dark" }) {
  const Comp = onClick ? "button" : "div";
  const isLight = theme === "light";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left backdrop-blur transition",
        isLight ? "bg-white/90" : "bg-white/5",
        onClick ? (isLight ? "hover:bg-zinc-50" : "hover:bg-white/10") : "",
        active ? (isLight ? "border-zinc-900/30 bg-zinc-100" : "border-white/25 bg-white/10") : isLight ? "border-zinc-300" : "border-white/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("text-xs uppercase tracking-[0.14em]", isLight ? "text-zinc-500" : "text-white/40")}>{title}</div>
          <div className={cn("mt-2 text-2xl font-semibold", isLight ? "text-zinc-900" : "text-white")}>{value}</div>
          {subtitle ? <div className={cn("mt-1 text-sm", isLight ? "text-zinc-600" : "text-white/55")}>{subtitle}</div> : null}
        </div>

        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1", isLight ? "bg-zinc-100 ring-zinc-300 text-zinc-700" : "bg-white/10 ring-white/10")}>
          {icon}
        </div>
      </div>
    </Comp>
  );
}
