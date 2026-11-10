import { useEffect, useState } from "react";
import type {
  ApiStatus,
  JobState,
  PickedFile,
  RecentItem,
  Settings,
  SummaryArtifacts,
  TranscriptionResult,
} from "../types";
import {
  baseName,
  formatBytes,
  formatClock,
  formatHours,
  relativeDay,
  stemName,
} from "../lib/format";
import { Icon } from "./ui/Icon";
import { ProgressBar } from "./ui/Controls";
import { StatCard } from "./StatCard";

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  fr: "Francés",
};

interface DashboardProps {
  file: PickedFile | null;
  job: JobState;
  result: TranscriptionResult | null;
  summary: SummaryArtifacts | null;
  settings: Settings;
  status: ApiStatus | null;
  recent: RecentItem[];
  onPickFile: () => void;
  onClearFile: () => void;
  onTranscribe: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
  onOpenTranscript: () => void;
  onOpenSummary: () => void;
  onGenerateSummary: () => void;
  onExport: (format: "txt" | "srt") => void;
  onOpenRecent: (item: RecentItem) => void;
  onOpenFolder: () => void;
}

export function Dashboard({
  file,
  job,
  result,
  summary,
  settings,
  status,
  recent,
  onPickFile,
  onClearFile,
  onTranscribe,
  onCancel,
  onOpenSettings,
  onOpenTranscript,
  onOpenSummary,
  onGenerateSummary,
  onExport,
  onOpenRecent,
  onOpenFolder,
}: DashboardProps) {
  const running = job.status === "running";
  const elapsed = useElapsed(job.startedAt, running);

  return (
    <div className="space-y-5 pb-10">
      <Hero status={status} />

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <section className="card relative overflow-hidden p-5 xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-title">Importar</p>
              <h2 className="mt-1 text-[16px] font-semibold tracking-tight text-white">
                Nueva transcripción
              </h2>
            </div>
            <span className="chip">
              <Icon name="waveform" size={12} className="text-violet-300" />
              MP4 · MKV · MP3 · WAV
            </span>
          </div>

          {running ? (
            <div className="mt-5 animate-fade">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/90">
                    {job.message || "Procesando"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {file ? baseName(file.path) : "Archivo"} · {formatClock(elapsed)} transcurridos
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[26px] font-semibold leading-none tracking-tight text-white">
                    {Math.round(job.percent)}
                    <span className="ml-0.5 text-sm text-slate-500">%</span>
                  </p>
                  <p className="mt-1 text-[10.5px] text-slate-500">
                    {job.current != null && job.total
                      ? `${formatClock(job.current)} / ${formatClock(job.total)}`
                      : "preparando"}
                  </p>
                </div>
              </div>

              <ProgressBar value={job.percent} className="mt-3" />

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STEPS.map((step, index) => {
                  const currentIndex = STEPS.findIndex((item) => item.key === job.stage);
                  const done = currentIndex > index;
                  const active = currentIndex === index;
                  return (
                    <div
                      key={step.key}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${
                        active
                          ? "border-violet-400/40 bg-violet-500/10 text-violet-200"
                          : done
                            ? "border-emerald-400/20 bg-emerald-400/[0.055] text-emerald-300/90"
                            : "border-white/[0.06] bg-white/[0.015] text-slate-500"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {done ? (
                          <Icon name="check" size={11} />
                        ) : active ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-300 pulse-dot" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        )}
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/[0.055] pt-4">
                <div className="min-w-0 space-y-1">
                  {job.logs.slice(-2).map((line, index) => (
                    <p
                      key={`${index}-${line}`}
                      className="truncate font-mono text-[10.5px] text-slate-500"
                    >
                      <span className="mr-1.5 text-violet-500/80">›</span>
                      {line}
                    </p>
                  ))}
                  {job.logs.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Cargando el modelo y decodificando el audio…
                    </p>
                  ) : null}
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={onCancel}>
                  <Icon name="stop" size={12} />
                  Cancelar
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.015] px-3 py-2 text-[10.5px] text-slate-500">
                <Icon name="info" size={12} className="shrink-0 text-violet-300/80" />
                Puedes cambiar de vista mientras se procesa: la transcripción continúa en
                segundo plano.
              </div>
            </div>
          ) : file ? (
            <div className="mt-5 animate-fade">
              <div className="flex items-center gap-3 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/[0.09] to-transparent p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-700/10 text-violet-200 ring-1 ring-inset ring-violet-400/20">
                  <Icon name="fileText" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-100">
                    {file.name}
                  </p>
                  <p className="truncate font-mono text-[10.5px] text-slate-500" title={file.path}>
                    {file.path}
                  </p>
                </div>
                {file.size ? <span className="chip shrink-0">{formatBytes(file.size)}</span> : null}
                <button
                  type="button"
                  onClick={onClearFile}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
                  aria-label="Quitar archivo"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <MiniOption
                  label="Modelo"
                  value={settings.model}
                  icon="cpu"
                  onClick={onOpenSettings}
                />
                <MiniOption
                  label="Idioma"
                  value={
                    settings.language
                      ? (LANGUAGE_LABELS[settings.language] ?? settings.language)
                      : "Auto"
                  }
                  icon="globe"
                  onClick={onOpenSettings}
                />
                <MiniOption
                  label="Salida"
                  value={
                    settings.formats === "both"
                      ? "TXT + SRT"
                      : settings.formats.toUpperCase()
                  }
                  icon="fileText"
                  onClick={onOpenSettings}
                />
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.045] px-3 py-2.5">
                <Icon name="info" size={13} className="mt-0.5 shrink-0 text-cyan-300/90" />
                <p className="text-[10.5px] leading-relaxed text-slate-400">
                  <span className="font-semibold text-slate-300">Sugerencia:</span> si la
                  grabación tiene nombres propios o términos técnicos, añádelos al contexto de
                  vocabulario en Ajustes para que Whisper los conserve.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.055] pt-4">
                <p className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Icon name="shield" size={13} className="text-emerald-400/80" />
                  El audio nunca sale de tu equipo.
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost" onClick={onPickFile}>
                    <Icon name="refresh" size={14} />
                    Cambiar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={onTranscribe}>
                    <Icon name="play" size={14} />
                    Transcribir ahora
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 animate-fade">
              <button
                type="button"
                onClick={onPickFile}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onPickFile();
                }}
                className="group flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.13] bg-white/[0.015] px-6 py-8 transition hover:border-violet-400/55 hover:bg-violet-500/[0.045]"
              >
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-[0_14px_36px_-14px_rgba(139,92,246,0.95)] transition group-hover:scale-[1.04]">
                  <Icon name="upload" size={20} />
                  <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
                </span>
                <span className="mt-3 text-[13.5px] font-semibold text-slate-200">
                  Haz clic para elegir un archivo
                </span>
                <span className="mt-0.5 text-xs text-slate-500">
                  o arrástralo aquí · video o audio de cualquier duración
                </span>
                <span className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {["MP4", "MKV", "MOV", "MP3", "WAV", "M4A"].map((format) => (
                    <span
                      key={format}
                      className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider text-slate-500"
                    >
                      {format}
                    </span>
                  ))}
                </span>
              </button>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Feature icon="shield" title="Privado" detail="nada sale del equipo" tone="emerald" />
                <Feature icon="clock" title="Sin límite" detail="grabaciones largas" tone="violet" />
                <Feature icon="fileText" title="TXT + SRT" detail="listos para editar" tone="cyan" />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-2">
                  <Icon name="shield" size={13} className="text-emerald-400/80" />
                  Procesado íntegramente en tu equipo
                </span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="font-semibold text-violet-300 transition hover:text-violet-200"
                >
                  Revisar ajustes →
                </button>
              </div>
            </div>
          )}
        </section>

        <EngineCard settings={settings} onOpenSettings={onOpenSettings} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Duración"
          value={result ? formatClock(result.duration) : "—"}
          hint={result ? "de audio transcrito" : "sin datos aún"}
          icon="clock"
          tone="violet"
        />
        <StatCard
          label="Segmentos"
          value={result ? result.segments_count.toLocaleString("es") : "—"}
          hint={result ? "con marcas de tiempo" : "esperando archivo"}
          icon="list"
          tone="cyan"
        />
        <StatCard
          label="Palabras"
          value={result ? result.words.toLocaleString("es") : "—"}
          hint={result ? "en la transcripción" : "esperando archivo"}
          icon="fileText"
          tone="emerald"
        />
        <StatCard
          label="Tiempo de proceso"
          value={result ? formatClock(result.elapsed) : "—"}
          hint={result ? `modelo ${settings.model} · CPU` : "sin datos aún"}
          icon="zap"
          tone="amber"
        />
      </div>

      {result ? (
        <section className="card animate-rise overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.09] text-emerald-300">
              <Icon name="check" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-white">Transcripción lista</p>
              <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
                {baseName(result.file)} · {result.segments_count} segmentos ·{" "}
                {result.words.toLocaleString("es")} palabras · {formatClock(result.elapsed)} de
                proceso
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={onOpenTranscript}>
                <Icon name="fileText" size={13} />
                Ver transcripción
              </button>
              <button type="button" className="btn btn-soft btn-sm" onClick={onGenerateSummary}>
                <Icon name="sparkles" size={13} />
                Resumen PDF
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
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.055] bg-black/20 px-5 py-2.5 text-[10.5px] text-slate-500">
            <span>
              <span className="text-slate-400">Idioma detectado:</span> {result.language} (
              {Math.round(result.language_probability * 100)}%)
            </span>
            <span>
              <span className="text-slate-400">Duración:</span> {formatHours(result.duration)}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="text-slate-400">Salida:</span>
              <span className="truncate font-mono" title={result.outputs[0]}>
                {result.outputs[0] ?? "—"}
              </span>
            </span>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-title">Historial</p>
              <h2 className="mt-1 text-[15px] font-semibold text-white">
                Transcripciones recientes
              </h2>
            </div>
            <span className="chip">
              <Icon name="clock" size={11} />
              local
            </span>
          </div>

          {recent.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.012] px-6 py-8 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-500">
                <Icon name="mic" size={18} />
              </span>
              <p className="mt-2 text-[12.5px] font-medium text-slate-400">
                Aún no hay transcripciones guardadas
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Importa una grabación para empezar.
              </p>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-white/[0.045]">
              {recent.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenRecent(item)}
                  className="group flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-500 transition group-hover:border-violet-400/30 group-hover:text-violet-300">
                    <Icon name="fileText" size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-slate-300 group-hover:text-white">
                      {stemName(item.name)}
                    </span>
                    <span className="block text-[10.5px] text-slate-600">
                      {relativeDay(item.date)} · {item.segments} segmentos ·{" "}
                      {item.words.toLocaleString("es")} palabras
                    </span>
                  </span>
                  <span className="chip hidden sm:inline-flex">{formatClock(item.duration)}</span>
                  <Icon
                    name="chevronRight"
                    size={14}
                    className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-200">
              <Icon name="sparkles" size={11} />
              Gemini · opcional
            </span>
            <h2 className="mt-3 text-[15px] font-semibold leading-snug text-white">
              Convierte el texto en un informe listo para leer
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              Títulos, ideas clave, conceptos y conclusiones en un PDF con diseño. Solo se envía
              el texto de la transcripción.
            </p>

            <ul className="mt-3 space-y-1.5">
              {["Resumen estructurado por temas", "PDF con acentos de color", "Tú decides cuándo enviarlo"].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2 text-[11px] text-slate-400">
                    <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-400/90" />
                    {item}
                  </li>
                ),
              )}
            </ul>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={onGenerateSummary}
                disabled={!result || running}
              >
                <Icon name="wand" size={14} />
                Generar resumen
              </button>
              {summary ? (
                <button type="button" className="btn btn-ghost w-full" onClick={onOpenSummary}>
                  <Icon name="fileText" size={14} />
                  Ver último resumen
                </button>
              ) : null}
              {!status?.hasKey ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex w-full items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-left text-[10.5px] leading-relaxed text-amber-200/90 transition hover:bg-amber-400/[0.12]"
                >
                  <Icon name="key" size={13} className="shrink-0" />
                  Configura tu API key de Gemini para habilitarlo.
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ partes */

const STEPS = [
  { key: "prepare", label: "Preparar" },
  { key: "audio", label: "Audio" },
  { key: "transcription", label: "Transcribir" },
  { key: "export", label: "Guardar" },
];

function Hero({ status }: { status: ApiStatus | null }) {
  return (
    <section className="card relative overflow-hidden px-6 py-6 sm:px-7">
      <div className="pointer-events-none absolute inset-0 hash-pattern opacity-40" />
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative flex items-center justify-between gap-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-violet-200">
            <Icon name="zap" size={11} />
            Flujo local + IA opcional
          </span>
          <h2 className="mt-3 text-[25px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[28px]">
            De una grabación a <span className="text-gradient">notas claras</span>.
          </h2>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-slate-400">
            Transcribe clases, reuniones y entrevistas sin subir el audio a ningún servidor.
            Cuando quieras, Gemini convierte el texto en un informe en PDF.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="chip">
              <Icon name="cpu" size={11} className="text-cyan-300" />
              Whisper local
            </span>
            <span className="chip">
              <Icon name="shield" size={11} className="text-emerald-300" />
              Sin base de datos
            </span>
            <span className="chip">
              <Icon name="key" size={11} className={status?.hasKey ? "text-violet-300" : "text-amber-300"} />
              {status?.hasKey ? "Gemini conectado" : "Gemini sin configurar"}
            </span>
          </div>
        </div>

        <div className="relative hidden w-[292px] shrink-0 lg:block">
          <div className="rounded-2xl border border-white/[0.09] bg-black/25 p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur">
            <FlowRow
              icon="mic"
              tone="violet"
              title="Grabación"
              detail="video o audio · cualquier duración"
            />
            <FlowLine />
            <FlowRow
              icon="fileText"
              tone="cyan"
              title="Transcripción"
              detail="TXT + SRT con marcas de tiempo"
            />
            <FlowLine />
            <FlowRow
              icon="sparkles"
              tone="fuchsia"
              title="Resumen PDF"
              detail="títulos, ideas y conceptos"
            />
          </div>
          <div className="pointer-events-none absolute -right-3 -top-3 flex h-10 items-end gap-1 rounded-xl border border-white/10 bg-[#0b1020]/90 px-2.5 py-2 backdrop-blur">
            {[7, 12, 17, 10, 20, 14, 8].map((height, index) => (
              <span
                key={index}
                className="equalizer-bar w-1 rounded-full bg-gradient-to-t from-violet-500 to-cyan-300"
                style={{
                  height,
                  animationDelay: `${index * 0.09}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowRow({
  icon,
  tone,
  title,
  detail,
}: {
  icon: "mic" | "fileText" | "sparkles";
  tone: "violet" | "cyan" | "fuchsia";
  title: string;
  detail: string;
}) {
  const tones = {
    violet: "bg-violet-500/15 text-violet-300 ring-violet-400/25",
    cyan: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/25",
    fuchsia: "bg-fuchsia-500/12 text-fuchsia-300 ring-fuchsia-400/25",
  } as const;

  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset ${tones[tone]}`}>
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-slate-200">{title}</p>
        <p className="truncate text-[10px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function FlowLine() {
  return (
    <div className="ml-4 flex h-4 items-center">
      <span className="h-full w-px bg-gradient-to-b from-violet-400/40 to-cyan-400/20" />
    </div>
  );
}

function MiniOption({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  icon: "cpu" | "globe" | "fileText";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left transition hover:border-violet-400/30 hover:bg-violet-500/[0.05]"
    >
      <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <Icon name={icon} size={10} />
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[12px] font-semibold text-slate-200">
        {value}
      </span>
    </button>
  );
}

function Feature({
  icon,
  title,
  detail,
  tone,
}: {
  icon: "shield" | "clock" | "fileText";
  title: string;
  detail: string;
  tone: "emerald" | "violet" | "cyan";
}) {
  const tones = {
    emerald: "bg-emerald-400/[0.07] text-emerald-300 border-emerald-400/15",
    violet: "bg-violet-500/[0.08] text-violet-300 border-violet-400/15",
    cyan: "bg-cyan-400/[0.07] text-cyan-300 border-cyan-400/15",
  } as const;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.055] bg-white/[0.018] px-3 py-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${tones[tone]}`}>
        <Icon name={icon} size={13} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-slate-200">{title}</span>
        <span className="block truncate text-[10px] text-slate-500">{detail}</span>
      </span>
    </div>
  );
}

function EngineCard({
  settings,
  onOpenSettings,
}: {
  settings: Settings;
  onOpenSettings: () => void;
}) {
  return (
    <section className="card flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Motor local</p>
          <h2 className="mt-1 text-[15px] font-semibold text-white">Listo para transcribir</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          activo
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        <InfoRow icon="cpu" label="Modelo" value={settings.model} />
        <InfoRow
          icon="globe"
          label="Idioma"
          value={settings.language === "es" ? "Español (fijo)" : settings.language || "Detección automática"}
        />
        <InfoRow
          icon="waveform"
          label="Filtro VAD"
          value={settings.vad ? "Activado" : "Desactivado"}
          tone={settings.vad ? "emerald" : "amber"}
        />
        <InfoRow
          icon="fileText"
          label="Salida"
          value={settings.formats === "both" ? "TXT + SRT" : settings.formats.toUpperCase()}
        />
        <InfoRow
          icon="folder"
          label="Carpeta"
          value={settings.outputDir || "junto al archivo"}
          mono
        />
      </div>

      <div className="mt-auto pt-4">
        <button type="button" className="btn btn-ghost w-full" onClick={onOpenSettings}>
          <Icon name="settings" size={14} />
          Ajustes de transcripción
        </button>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-slate-600">
          <Icon name="info" size={11} />
          La primera ejecución descarga el modelo.
        </p>
      </div>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
  tone,
}: {
  icon: "cpu" | "globe" | "waveform" | "fileText" | "folder";
  label: string;
  value: string;
  mono?: boolean;
  tone?: "emerald" | "amber";
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.055] bg-white/[0.018] px-3 py-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.035] text-slate-500">
        <Icon name={icon} size={12} />
      </span>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
      <span
        className={`ml-auto min-w-0 truncate text-right text-[11.5px] font-semibold ${
          tone === "emerald"
            ? "text-emerald-300"
            : tone === "amber"
              ? "text-amber-300"
              : "text-slate-200"
        } ${mono ? "font-mono text-[10px] font-medium" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function useElapsed(startedAt: number | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  if (!active || !startedAt) return 0;
  return Math.max(0, Math.round((now - startedAt) / 1_000));
}
