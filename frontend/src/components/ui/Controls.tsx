import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { percent } from "../../lib/format";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<Option<T>>;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className = "",
}: SelectProps<T>) {
  return (
    <div className={`relative ${className}`}>
      <select
        className="field appearance-none pr-9"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<Option<T>>;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-gradient-to-b from-violet-500 to-violet-700 text-white shadow-[0_6px_18px_-8px_rgba(139,92,246,0.9)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
        checked
          ? "border-violet-400/50 bg-gradient-to-r from-violet-500 to-violet-600"
          : "border-white/10 bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

interface ProgressBarProps {
  value: number;
  tone?: "violet" | "cyan";
  className?: string;
}

export function ProgressBar({ value, tone = "violet", className = "" }: ProgressBarProps) {
  const width = percent(value);
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${
          tone === "cyan"
            ? "bg-gradient-to-r from-cyan-400 to-cyan-300"
            : "bg-gradient-to-r from-violet-500 via-violet-400 to-fuchsia-400"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}
