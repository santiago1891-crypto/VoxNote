import type { RecentItem, View } from "../types";
import { relativeDay, stemName } from "../lib/format";
import { BrandMark, Icon, type IconName } from "./ui/Icon";

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  recent: RecentItem[];
  onOpenRecent: (item: RecentItem) => void;
  hasResult: boolean;
  hasSummary: boolean;
  version: string;
}

const navigation: Array<{ view: View; label: string; icon: IconName }> = [
  { view: "dashboard", label: "Panel", icon: "dashboard" },
  { view: "transcript", label: "Transcripción", icon: "fileText" },
  { view: "summary", label: "Resumen IA", icon: "sparkles" },
  { view: "settings", label: "Ajustes", icon: "settings" },
];

export function Sidebar({
  view,
  onNavigate,
  recent,
  onOpenRecent,
  hasResult,
  hasSummary,
  version,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-white/[0.055] bg-[#080b16]/85">
      <button
        type="button"
        onClick={() => onNavigate("dashboard")}
        className="flex items-center gap-3 px-5 pb-6 pt-6 text-left"
      >
        <BrandMark size={38} />
        <span>
          <span className="block text-[17px] font-semibold tracking-tight text-white">
            VoxNote
          </span>
          <span className="block text-[11px] font-medium tracking-wide text-slate-500">
            Transcripción local
          </span>
        </span>
      </button>

      <nav className="px-3">
        <p className="section-title px-3 pb-2">Espacio de trabajo</p>
        <div className="space-y-1">
          {navigation.map((item) => {
            const badge =
              item.view === "transcript" && hasResult
                ? "●"
                : item.view === "summary" && hasSummary
                  ? "●"
                  : null;
            return (
              <button
                key={item.view}
                type="button"
                className="nav-item"
                data-active={view === item.view}
                onClick={() => onNavigate(item.view)}
              >
                <Icon
                  name={item.icon}
                  size={17}
                  className={view === item.view ? "text-violet-300" : "text-slate-500"}
                />
                <span className="flex-1">{item.label}</span>
                {badge ? (
                  <span className="text-[8px] text-violet-400" aria-label="con contenido">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mx-5 my-5 h-px bg-white/[0.055]" />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="section-title">Recientes</p>
          {recent.length > 0 ? (
            <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {recent.length}
            </span>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-slate-600">
            Tus transcripciones aparecerán aquí para volver a abrirlas cuando quieras.
          </p>
        ) : (
          <div className="space-y-0.5">
            {recent.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenRecent(item)}
                className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.04]"
                title={item.path}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-500 group-hover:text-violet-300">
                  <Icon name="fileText" size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-slate-300 group-hover:text-slate-100">
                    {stemName(item.name)}
                  </span>
                  <span className="block text-[10.5px] text-slate-600">
                    {relativeDay(item.date)} · {item.segments} segmentos
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-violet-500/[0.06] to-cyan-400/[0.04] p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/20 text-violet-300">
              <Icon name="shield" size={14} />
            </span>
            <p className="text-xs font-semibold text-violet-100">100% en tu equipo</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            El audio se procesa localmente. Solo el texto se envía a Gemini y únicamente
            cuando tú lo pides.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pb-5 pt-1 text-[10.5px] font-medium text-slate-600">
        <span>VoxNote v{version}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
          local-first
        </span>
      </div>
    </aside>
  );
}
