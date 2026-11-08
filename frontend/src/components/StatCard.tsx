import { Icon, type IconName } from "./ui/Icon";

type Tone = "violet" | "cyan" | "emerald" | "amber";

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
  tone: Tone;
}

const tones: Record<Tone, { icon: string; glow: string; bar: string }> = {
  violet: {
    icon: "bg-violet-500/12 text-violet-300 border-violet-400/20",
    glow: "from-violet-500/25",
    bar: "bg-violet-400",
  },
  cyan: {
    icon: "bg-cyan-400/10 text-cyan-300 border-cyan-400/20",
    glow: "from-cyan-400/20",
    bar: "bg-cyan-400",
  },
  emerald: {
    icon: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    glow: "from-emerald-400/18",
    bar: "bg-emerald-400",
  },
  amber: {
    icon: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    glow: "from-amber-400/18",
    bar: "bg-amber-400",
  },
};

export function StatCard({ label, value, hint, icon, tone }: StatCardProps) {
  const palette = tones[tone];
  return (
    <div className="card card-hover relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-slate-500">
          {label}
        </p>
        <span
          className={`grid h-8 w-8 place-items-center rounded-xl border ${palette.icon}`}
        >
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-3 truncate text-[22px] font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</p>
      <span
        className={`pointer-events-none absolute -bottom-8 -right-6 h-20 w-20 rounded-full bg-gradient-to-br ${palette.glow} to-transparent blur-2xl`}
      />
    </div>
  );
}
