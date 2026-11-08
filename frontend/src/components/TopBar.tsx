import type { ApiStatus } from "../types";
import { Icon } from "./ui/Icon";

interface TopBarProps {
  title: string;
  subtitle: string;
  status: ApiStatus | null;
  desktop: boolean;
  onOpenSettings: () => void;
}

export function TopBar({ title, subtitle, status, desktop, onOpenSettings }: TopBarProps) {
  const hasKey = Boolean(status?.hasKey);

  return (
    <header className="flex h-[78px] shrink-0 items-center justify-between gap-6 border-b border-white/[0.055] bg-[#070a14]/40 px-8 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-semibold tracking-tight text-white">{title}</h1>
        <p className="truncate text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-[11px] font-semibold text-emerald-300/90 lg:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Procesamiento local
        </span>

        <button
          type="button"
          onClick={onOpenSettings}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
            hasKey
              ? "border-violet-400/20 bg-violet-500/[0.09] text-violet-200 hover:bg-violet-500/[0.16]"
              : "border-amber-400/25 bg-amber-400/[0.08] text-amber-200 hover:bg-amber-400/[0.14]"
          }`}
          title={hasKey ? "Gemini configurado" : "Configura tu API key de Gemini"}
        >
          <Icon name={hasKey ? "sparkles" : "key"} size={13} />
          {hasKey ? "Gemini listo" : "Configurar Gemini"}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-slate-200"
          aria-label="Abrir ajustes"
        >
          <Icon name="settings" size={16} />
        </button>
      </div>

      <span className="sr-only">{desktop ? "Modo escritorio" : "Modo navegador"}</span>
    </header>
  );
}
