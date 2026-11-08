import { useEffect } from "react";
import type { ToastMessage } from "../types";
import { Icon, type IconName } from "./ui/Icon";

interface ToastProps {
  toast: ToastMessage;
  onClose: () => void;
}

const tones: Record<
  ToastMessage["kind"],
  { icon: IconName; ring: string; iconBg: string; bar: string }
> = {
  success: {
    icon: "checkCircle",
    ring: "border-emerald-400/25",
    iconBg: "bg-emerald-400/12 text-emerald-300",
    bar: "bg-emerald-400",
  },
  error: {
    icon: "alert",
    ring: "border-rose-400/25",
    iconBg: "bg-rose-400/12 text-rose-300",
    bar: "bg-rose-400",
  },
  info: {
    icon: "info",
    ring: "border-violet-400/25",
    iconBg: "bg-violet-400/12 text-violet-300",
    bar: "bg-violet-400",
  },
};

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, toast.kind === "error" ? 7_000 : 4_500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  const tone = tones[toast.kind];

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] animate-rise">
      <div
        className={`relative flex items-start gap-3 overflow-hidden rounded-2xl border ${tone.ring} bg-[#0d1220]/95 p-4 pr-10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur`}
        role="status"
      >
        <span className={`absolute inset-y-0 left-0 w-0.5 ${tone.bar}`} />
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tone.iconBg}`}>
          <Icon name={tone.icon} size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-100">{toast.title}</p>
          {toast.detail ? (
            <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-slate-400">
              {toast.detail}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
          aria-label="Cerrar aviso"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
