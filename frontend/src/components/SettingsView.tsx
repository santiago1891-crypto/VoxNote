import { useEffect, useState } from "react";
import type { ApiStatus, OutputFormat, Settings } from "../types";
import { Icon } from "./ui/Icon";
import { FieldRow, Segmented, Select, Toggle } from "./ui/Controls";

interface SettingsViewProps {
  settings: Settings;
  status: ApiStatus | null;
  onSave: (settings: Settings) => void;
  onSaveKey: (key: string) => Promise<{ ok: boolean; hint?: string; error?: string }>;
  onTestKey: (
    key: string,
    model?: string,
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  onPickFolder: () => Promise<string | null>;
  onOpenPath: (path: string) => void;
}

const MODELS = [
  { value: "tiny", label: "tiny · más rápido" },
  { value: "base", label: "base · ligero" },
  { value: "small", label: "small · equilibrado (recomendado)" },
  { value: "medium", label: "medium · mayor precisión" },
  { value: "large-v3", label: "large-v3 · máxima calidad" },
  { value: "large-v3-turbo", label: "large-v3-turbo · calidad y velocidad" },
] as const;

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "pt", label: "Portugués" },
  { value: "fr", label: "Francés" },
  { value: "", label: "Detección automática" },
] as const;

const GEMINI_MODELS = [
  { value: "gemini-3.5-flash", label: "gemini-3.5-flash · recomendado" },
  { value: "gemini-3.1-flash-lite", label: "gemini-3.1-flash-lite · respaldo" },
] as const;

const FORMATS: ReadonlyArray<{ value: OutputFormat; label: string }> = [
  { value: "txt", label: "TXT" },
  { value: "srt", label: "SRT" },
  { value: "both", label: "Ambos" },
];

export function SettingsView({
  settings,
  status,
  onSave,
  onSaveKey,
  onTestKey,
  onPickFolder,
  onOpenPath,
}: SettingsViewProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState<"save" | "test" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const chooseFolder = async () => {
    const folder = await onPickFolder();
    if (folder) update("outputDir", folder);
  };

  const handleSaveKey = async () => {
    setKeyBusy("save");
    setFeedback(null);
    const result = await onSaveKey(apiKey);
    setKeyBusy(null);
    if (result.ok) {
      setApiKey("");
      setFeedback({ kind: "ok", text: "Clave guardada en el almacén de credenciales de Windows." });
    } else {
      setFeedback({ kind: "error", text: result.error ?? "No se pudo guardar la clave." });
    }
  };

  const handleTestKey = async () => {
    setKeyBusy("test");
    setFeedback(null);
    // Se prueba con el modelo del borrador para no guardar antes de validar.
    const result = await onTestKey(apiKey, draft.geminiModel);
    setKeyBusy(null);
    setFeedback({
      kind: result.ok ? "ok" : "error",
      text: result.ok
        ? result.message ?? "Conexión correcta con Gemini."
        : result.error ?? "No se pudo conectar con Gemini.",
    });
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <section className="card p-5">
            <SectionHeader
              icon="cpu"
              title="Transcripción local"
              subtitle="Modelo, idioma y formato de salida de Whisper."
              badge="faster-whisper"
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FieldRow
                label="Modelo"
                hint="Los modelos grandes son más precisos pero tardan más en CPU."
              >
                <Select
                  value={draft.model}
                  onChange={(value) => update("model", value)}
                  options={MODELS}
                />
              </FieldRow>
              <FieldRow label="Idioma" hint="Fijar el idioma mejora la estabilidad del texto.">
                <Select
                  value={draft.language}
                  onChange={(value) => update("language", value)}
                  options={LANGUAGES}
                />
              </FieldRow>
            </div>

            <div className="mt-4">
              <FieldRow
                label="Contexto de vocabulario"
                hint="Nombres propios o términos técnicos que quieras conservar. Opcional."
              >
                <textarea
                  className="field min-h-[76px] resize-y"
                  value={draft.initialPrompt}
                  onChange={(event) => update("initialPrompt", event.target.value)}
                  placeholder="Ej.: FNC, FND, tabla de verdad, De Morgan…"
                />
              </FieldRow>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                <div>
                  <p className="text-[12.5px] font-medium text-slate-200">
                    Filtrar silencios (VAD)
                  </p>
                  <p className="text-[10.5px] text-slate-500">
                    Omite tramos sin voz para acelerar la transcripción.
                  </p>
                </div>
                <Toggle checked={draft.vad} onChange={(value) => update("vad", value)} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                <div>
                  <p className="text-[12.5px] font-medium text-slate-200">Formato de salida</p>
                  <p className="text-[10.5px] text-slate-500">
                    TXT con marcas de tiempo y subtítulos SRT.
                  </p>
                </div>
                <Segmented
                  value={draft.formats}
                  onChange={(value) => update("formats", value)}
                  options={FORMATS}
                />
              </div>

              <div>
                <span className="label">Carpeta de salida</span>
                <div className="flex gap-2">
                  <input
                    className="field field-mono flex-1"
                    value={draft.outputDir}
                    onChange={(event) => update("outputDir", event.target.value)}
                    placeholder="C:\\Users\\…\\VoxNote"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={chooseFolder}
                    title="Elegir carpeta"
                  >
                    <Icon name="folder" size={14} />
                  </button>
                  {draft.outputDir ? (
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0"
                      onClick={() => onOpenPath(draft.outputDir)}
                      title="Abrir carpeta"
                    >
                      <Icon name="external" size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.07] to-transparent p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">
                <Icon name="shield" size={14} />
              </span>
              <h3 className="text-[13px] font-semibold text-white">Privacidad por diseño</h3>
            </div>
            <ul className="mt-3 space-y-1.5">
              {[
                "El video y el audio se procesan siempre en tu equipo.",
                "No hay base de datos ni servidor propio.",
                "La API key vive en el Administrador de credenciales de Windows.",
                "Solo la transcripción se envía a Gemini, y solo cuando lo pides.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
                  <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-400/90" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5">
            <SectionHeader
              icon="sparkles"
              title="Resumen con Gemini"
              subtitle="Convierte la transcripción en un informe PDF."
              badge={status?.hasKey ? "conectado" : "sin clave"}
              tone={status?.hasKey ? "ok" : "warn"}
            />

            <div
              className={`mt-4 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                status?.hasKey
                  ? "border-emerald-400/20 bg-emerald-400/[0.055]"
                  : "border-amber-400/20 bg-amber-400/[0.055]"
              }`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-lg ${
                  status?.hasKey
                    ? "bg-emerald-400/12 text-emerald-300"
                    : "bg-amber-400/12 text-amber-300"
                }`}
              >
                <Icon name={status?.hasKey ? "check" : "alert"} size={14} />
              </span>
              <div className="min-w-0">
                <p
                  className={`text-[11.5px] font-semibold ${
                    status?.hasKey ? "text-emerald-200" : "text-amber-200"
                  }`}
                >
                  {status?.hasKey ? "Clave configurada" : "Falta la API key"}
                </p>
                <p className="truncate text-[10.5px] text-slate-500">
                  {status?.hasKey
                    ? `Guardada de forma segura · ${status.hint}`
                    : "Configúrala para habilitar el resumen en PDF."}
                </p>
              </div>
            </div>

            {status?.keyError ? (
              <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-300">
                <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                {status.keyError}
              </p>
            ) : null}

            <div className="mt-4">
              <span className="label">API key de Gemini</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Icon
                    name="key"
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    className="field field-mono pl-9 pr-10"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={status?.hasKey ? "••••••••••••• (guardada)" : "Pega tu clave de Gemini"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                    aria-label={showKey ? "Ocultar clave" : "Mostrar clave"}
                  >
                    <Icon name={showKey ? "eyeOff" : "eye"} size={14} />
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
                Se guarda en el Administrador de credenciales de Windows. Nunca se escribe en el
                repositorio. También puedes usar la variable{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-slate-300">
                  GEMINI_API_KEY
                </code>
                .
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || keyBusy !== null}
              >
                <Icon name={keyBusy === "save" ? "loader" : "lock"} size={13} className={keyBusy === "save" ? "spin" : ""} />
                Guardar clave
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleTestKey}
                disabled={keyBusy !== null}
              >
                <Icon name={keyBusy === "test" ? "loader" : "zap"} size={13} className={keyBusy === "test" ? "spin" : ""} />
                Probar conexión
              </button>
            </div>

            {feedback ? (
              <p
                className={`mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed ${
                  feedback.kind === "ok" ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                <Icon
                  name={feedback.kind === "ok" ? "checkCircle" : "alert"}
                  size={12}
                  className="mt-0.5 shrink-0"
                />
                {feedback.text}
              </p>
            ) : null}

            <div className="mt-4 border-t border-white/[0.055] pt-4">
              <FieldRow
                label="Modelo de Gemini"
                hint="Si el modelo principal está saturado, VoxNote prueba automáticamente el de respaldo."
              >
                <Select
                  value={draft.geminiModel}
                  onChange={(value) => update("geminiModel", value)}
                  options={GEMINI_MODELS}
                />
              </FieldRow>
            </div>
          </section>

          <section className="card p-5">
            <SectionHeader
              icon="info"
              title="Acerca de VoxNote"
              subtitle="Transcripción local y resúmenes opcionales con IA."
              badge={`v${status?.version ?? "0.1.2"}`}
            />

            <dl className="mt-4 space-y-2 text-[11px]">
              <AboutRow label="Motor" value="faster-whisper · CTranslate2 (CPU int8)" />
              <AboutRow
                label="Modelos"
                value={status?.modelsDir ?? "%LOCALAPPDATA%\\VoxNote\\models"}
                mono
              />
              <AboutRow
                label="Ajustes"
                value={status?.settingsPath ?? "%LOCALAPPDATA%\\VoxNote\\settings.json"}
                mono
              />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onOpenPath(status?.modelsDir ?? "")}
            >
                <Icon name="folder" size={13} />
                Carpeta de modelos
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onOpenPath(status?.settingsPath ?? "")}
              >
                <Icon name="settings" size={13} />
                Ver ajustes
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 text-[11px] text-slate-500">
          <Icon name="info" size={13} className="text-violet-300/80" />
          {dirty
            ? "Tienes cambios sin guardar en la configuración de transcripción."
            : "La configuración se guarda en tu equipo, nunca en la nube."}
        </p>
        <div className="flex items-center gap-2">
          {dirty ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setDraft(settings)}
            >
              Descartar
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onSave(draft)}
            disabled={!dirty}
          >
            <Icon name="check" size={13} />
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  badge,
  tone,
}: {
  icon: "cpu" | "sparkles" | "info";
  title: string;
  subtitle: string;
  badge?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold text-white">{title}</h2>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      {badge ? (
        <span
          className={`chip shrink-0 ${
            tone === "ok"
              ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
              : tone === "warn"
                ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-300"
                : ""
          }`}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function AboutRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.05] bg-white/[0.018] px-3 py-2">
      <dt className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-all text-right text-slate-300 ${
          mono ? "font-mono text-[10px]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
