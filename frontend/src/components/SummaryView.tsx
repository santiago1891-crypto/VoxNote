import type { SummaryArtifacts, TranscriptionResult } from "../types";
import { baseName } from "../lib/format";
import { Icon } from "./ui/Icon";

interface SummaryViewProps {
  summary: SummaryArtifacts | null;
  result: TranscriptionResult | null;
  busy: boolean;
  stage: string;
  hasKey: boolean;
  onGenerate: () => void;
  onOpenSettings: () => void;
  onOpenPdf: (path: string) => void;
  onOpenFolder: () => void;
}

export function SummaryView({
  summary,
  result,
  busy,
  stage,
  hasKey,
  onGenerate,
  onOpenSettings,
  onOpenPdf,
  onOpenFolder,
}: SummaryViewProps) {
  if (busy) return <SummarySkeleton stage={stage} />;

  if (!summary) {
    const ready = Boolean(result) && hasKey;
    return (
      <div className="space-y-5 pb-10">
        <section className="card relative overflow-hidden px-6 py-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative mx-auto max-w-lg text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/25 to-violet-700/10 text-violet-200">
              <Icon name="sparkles" size={24} />
            </span>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Gemini · opcional
            </span>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
              Un informe a partir de tu transcripción
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
              Gemini organiza el contenido en títulos, ideas principales, conceptos y
              conclusiones. VoxNote lo maqueta en un PDF con acentos de color.
            </p>

            <div className="mt-6 grid gap-2.5 text-left sm:grid-cols-2">
              <Requirement
                done={Boolean(result)}
                title="Transcripción lista"
                detail={result ? baseName(result.file) : "Importa y transcribe un archivo"}
              />
              <Requirement
                done={hasKey}
                title="API key de Gemini"
                detail={hasKey ? "Clave guardada de forma segura" : "Configúrala en Ajustes"}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onGenerate}
                disabled={!ready}
              >
                <Icon name="wand" size={14} />
                Generar resumen
              </button>
              {!hasKey ? (
                <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
                  <Icon name="key" size={14} />
                  Configurar clave
                </button>
              ) : null}
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[10.5px] text-slate-600">
              <Icon name="shield" size={11} />
              Solo se envía el texto. El video y el audio permanecen en tu equipo.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const data = summary.summary;

  return (
    <div className="space-y-5 pb-10">
      <section className="card overflow-hidden animate-rise">
        <div className="relative border-b border-white/[0.055] px-6 py-6">
          <div className="pointer-events-none absolute inset-0 hash-pattern opacity-25" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />

          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
                Resumen · VoxNote
              </p>
              <h2 className="mt-2 text-[23px] font-semibold leading-tight tracking-tight text-white sm:text-[26px]">
                {data.title}
              </h2>
              {data.subtitle ? (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
                  {data.subtitle}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="chip">
                  <Icon name="sparkles" size={11} className="text-violet-300" />
                  {summary.model}
                </span>
                <span className="chip">
                  <Icon name="fileText" size={11} />
                  {data.sections.length} secciones
                </span>
                <span className="chip">
                  <Icon name="download" size={11} />
                  {baseName(summary.pdf)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onOpenPdf(summary.pdf)}
              >
                <Icon name="external" size={13} />
                Abrir PDF
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenFolder}>
                <Icon name="folder" size={13} />
                Carpeta
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onGenerate}>
                <Icon name="refresh" size={13} />
                Regenerar
              </button>
            </div>
          </div>

          {data.overview ? (
            <div className="relative mt-5 rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <p className="text-[12.5px] leading-relaxed text-slate-300">{data.overview}</p>
            </div>
          ) : null}
        </div>

        {data.keywords.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 px-6 py-3">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
              Palabras clave
            </span>
            {data.keywords.map((word) => (
              <span key={word} className="chip border-violet-400/15 bg-violet-500/[0.07] text-violet-200/80">
                {word}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {data.sections.map((section, index) => (
            <article key={`${section.heading}-${index}`} className="card p-5">
              <div className="flex gap-3.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10 font-mono text-[10.5px] font-bold text-violet-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold tracking-tight text-violet-100">
                    {section.heading}
                  </h3>
                  {section.summary ? (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
                      {section.summary}
                    </p>
                  ) : null}
                  {section.bullets.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5">
                      {section.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-300"
                        >
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </article>
          ))}

          {data.conclusions.length > 0 ? (
            <article className="card p-5">
              <div className="flex items-center gap-2">
                <Icon name="checkCircle" size={15} className="text-cyan-300" />
                <h3 className="text-[14px] font-semibold text-white">Conclusiones</h3>
              </div>
              <ol className="mt-3 space-y-2.5">
                {data.conclusions.map((conclusion, index) => (
                  <li key={conclusion} className="flex gap-3 text-[12.5px] leading-relaxed text-slate-300">
                    <span className="font-mono text-[11px] font-semibold text-violet-400/90">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {conclusion}
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
        </div>

        <div className="space-y-3">
          {data.key_ideas.length > 0 ? (
            <aside className="relative overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.16] via-violet-500/[0.06] to-cyan-400/[0.03] p-5">
              <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-violet-500/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Icon name="sparkles" size={14} className="text-violet-300" />
                  <h3 className="text-[13px] font-semibold text-violet-50">Ideas principales</h3>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {data.key_ideas.map((idea, index) => (
                    <li key={idea} className="flex gap-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.07] font-mono text-[9.5px] font-bold text-violet-200">
                        {index + 1}
                      </span>
                      <span className="text-[11.5px] leading-relaxed text-slate-300">{idea}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          ) : null}

          {data.concepts.length > 0 ? (
            <aside className="card p-5">
              <div className="flex items-center gap-2">
                <Icon name="key" size={13} className="text-cyan-300" />
                <h3 className="text-[13px] font-semibold text-white">Conceptos clave</h3>
              </div>
              <dl className="mt-3 divide-y divide-white/[0.05]">
                {data.concepts.map((concept) => (
                  <div key={concept.term} className="py-2 first:pt-0 last:pb-0">
                    <dt className="text-[11.5px] font-semibold text-violet-200">{concept.term}</dt>
                    {concept.definition ? (
                      <dd className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        {concept.definition}
                      </dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </aside>
          ) : null}

          <aside className="card p-4">
            <p className="text-[10.5px] leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-400">Archivos generados</span>
              <br />
              <span className="break-all font-mono text-[10px] text-slate-600">{summary.pdf}</span>
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3 w-full"
              onClick={() => onOpenPdf(summary.pdf)}
            >
              <Icon name="external" size={12} />
              Abrir PDF
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Requirement({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
        done
          ? "border-emerald-400/20 bg-emerald-400/[0.055]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-slate-500"
        }`}
      >
        <Icon name={done ? "check" : "minus"} size={11} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-semibold text-slate-200">{title}</span>
        <span className="block truncate text-[10.5px] text-slate-500">{detail}</span>
      </span>
    </div>
  );
}

function SummarySkeleton({ stage }: { stage: string }) {
  return (
    <div className="space-y-5 pb-10">
      <section className="card overflow-hidden p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-300">
            <Icon name="loader" size={18} className="spin" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-white">
              {stage || "Generando resumen con Gemini"}
            </p>
            <p className="text-[11px] text-slate-500">
              Esto puede tardar entre 20 y 60 segundos.
            </p>
          </div>
          <span className="ml-auto hidden items-end gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 sm:flex">
            {[6, 11, 16, 9, 14, 7].map((height, index) => (
              <span
                key={index}
                className="equalizer-bar w-1 rounded-full bg-gradient-to-t from-violet-500 to-cyan-300"
                style={{ height, animationDelay: `${index * 0.1}s` }}
              />
            ))}
          </span>
        </div>

        <div className="mt-7 space-y-2.5">
          <div className="shimmer h-5 w-3/5 rounded-md" />
          <div className="shimmer h-3 w-full rounded-md" />
          <div className="shimmer h-3 w-11/12 rounded-md" />
          <div className="shimmer h-3 w-4/5 rounded-md" />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="card p-5">
            <div className="shimmer h-4 w-2/5 rounded-md" />
            <div className="mt-3 space-y-2">
              <div className="shimmer h-3 w-full rounded-md" />
              <div className="shimmer h-3 w-5/6 rounded-md" />
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="shimmer h-2.5 w-3/4 rounded-md" />
              <div className="shimmer h-2.5 w-2/3 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-600">
        <Icon name="shield" size={11} />
        Solo se está enviando el texto de la transcripción.
      </p>
    </div>
  );
}
