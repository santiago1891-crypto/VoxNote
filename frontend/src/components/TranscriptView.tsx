import { useMemo, useState, type ReactNode } from "react";
import type { JobState, TranscriptionResult } from "../types";
import {
  baseName,
  formatClock,
  formatHours,
  plural,
  stemName,
} from "../lib/format";
import { Icon } from "./ui/Icon";

interface TranscriptViewProps {
  result: TranscriptionResult | null;
  job: JobState;
  onImport: () => void;
  onExport: (format: "txt" | "srt") => void;
  onOpenFolder: () => void;
  onGenerateSummary: () => void;
  onGoDashboard: () => void;
}

export function TranscriptView({
  result,
  job,
  onImport,
  onExport,
  onOpenFolder,
  onGenerateSummary,
  onGoDashboard,
}: TranscriptViewProps) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const segments = useMemo(() => {
    if (!result) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return result.segments;
    return result.segments.filter((segment) => segment.text.toLowerCase().includes(needle));
  }, [result, query]);

  if (!result) {
    return (
      <div className="space-y-5 pb-10">
        {job.status === "running" ? (
          <RunningBanner job={job} onGoDashboard={onGoDashboard} />
        ) : null}
        <section className="card relative overflow-hidden px-6 py-14">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 text-violet-300">
              <Icon name="fileText" size={24} />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-white">
              Todavía no hay una transcripción
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
              Importa un video o audio desde el panel y el texto aparecerá aquí, con marcas de
              tiempo y listo para exportar.
            </p>
            <button type="button" className="btn btn-primary mt-5" onClick={onImport}>
              <Icon name="upload" size={14} />
              Importar archivo
            </button>
            <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-slate-600">
              <Icon name="shield" size={11} />
              El audio se procesa en tu equipo.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const copyAll = async () => {
    const text = result.segments.map((segment) => segment.text).join("\n");
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  };

  return (
    <div className="space-y-5 pb-10">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
            <Icon name="fileText" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="section-title">Transcripción</p>
            <h2 className="mt-0.5 truncate text-[17px] font-semibold tracking-tight text-white">
              {stemName(result.file)}
            </h2>
            <p className="mt-0.5 truncate font-mono text-[10.5px] text-slate-500" title={result.file}>
              {baseName(result.file)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyAll}>
              <Icon name={copied ? "check" : "copy"} size={13} />
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExport("txt")}>
              <Icon name="download" size={13} />
              TXT
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExport("srt")}>
              <Icon name="download" size={13} />
              SRT
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onOpenFolder}
              title="Abrir carpeta de salida"
            >
              <Icon name="folder" size={13} />
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={onGenerateSummary}>
              <Icon name="sparkles" size={13} />
              Resumen PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.055] bg-black/20 px-5 py-2.5">
          <span className="chip">
            <Icon name="globe" size={11} />
            {result.language} · {Math.round(result.language_probability * 100)}%
          </span>
          <span className="chip">
            <Icon name="clock" size={11} />
            {formatHours(result.duration)}
          </span>
          <span className="chip">
            <Icon name="list" size={11} />
            {plural(result.segments_count, "segmento", "segmentos")}
          </span>
          <span className="chip">
            <Icon name="fileText" size={11} />
            {plural(result.words, "palabra", "palabras")}
          </span>
          <span className="chip">
            <Icon name="zap" size={11} />
            {formatClock(result.elapsed)} de proceso
          </span>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.055] bg-[#090d19]/92 px-5 py-3 backdrop-blur">
          <div className="relative w-full max-w-sm">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en la transcripción…"
              className="field py-2 pl-9"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {query.trim()
              ? `${plural(segments.length, "coincidencia", "coincidencias")} de ${result.segments_count}`
              : `${plural(result.segments_count, "segmento", "segmentos")} · con marcas de tiempo`}
          </p>
        </div>

        <div className="divide-y divide-white/[0.035]">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Icon name="search" size={22} className="text-slate-600" />
              <p className="text-[12.5px] text-slate-400">
                No hay coincidencias para “{query.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-[11px] font-semibold text-violet-300 hover:text-violet-200"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            segments.map((segment, index) => (
              <div
                key={`${segment.start}-${index}`}
                className="group grid grid-cols-[62px_1fr] items-start gap-3 px-5 py-2.5 transition hover:bg-white/[0.022]"
              >
                <span className="pt-0.5 font-mono text-[10.5px] font-medium tabular-nums text-violet-400/80">
                  {formatClock(segment.start)}
                </span>
                <p className="text-[12.5px] leading-relaxed text-slate-300 group-hover:text-slate-200">
                  {highlight(segment.text, query)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function RunningBanner({ job, onGoDashboard }: { job: JobState; onGoDashboard: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/[0.08] px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon name="loader" size={16} className="spin text-violet-300" />
        <div>
          <p className="text-[12.5px] font-semibold text-violet-100">
            {job.message || "Transcripción en curso"}
          </p>
          <p className="text-[10.5px] text-violet-200/60">
            {Math.round(job.percent)}% completado. El texto aparecerá al terminar.
          </p>
        </div>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onGoDashboard}>
        Ver progreso
      </button>
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "ig"));
  return parts.map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark
        key={index}
        className="rounded bg-violet-500/25 px-0.5 text-violet-100"
      >
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fallback para file:// */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
