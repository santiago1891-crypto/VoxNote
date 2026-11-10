import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiStatus,
  JobState,
  PickedFile,
  RecentItem,
  Segment,
  Settings,
  Summary,
  SummaryArtifacts,
  ToastMessage,
  TranscriptionResult,
  View,
  VoxEvent,
} from "./types";
import {
  cancelJob,
  exportTranscript,
  generateSummary,
  getApiStatus,
  getSettings,
  isDesktop,
  onEvent,
  openPath,
  pickFile,
  pickFolder,
  saveApiKey,
  saveSettings,
  testApiKey,
  transcribe,
} from "./lib/bridge";
import { baseName, parentDir } from "./lib/format";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/Dashboard";
import { TranscriptView } from "./components/TranscriptView";
import { SummaryView } from "./components/SummaryView";
import { SettingsView } from "./components/SettingsView";
import { Toast } from "./components/Toast";

const RECENT_KEY = "voxnote.recent.v1";

const FALLBACK_SETTINGS: Settings = {
  model: "small",
  language: "es",
  vad: true,
  formats: "both",
  outputDir: "",
  geminiModel: "gemini-3.5-flash",
  initialPrompt: "",
};

const VIEW_TITLES: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Panel",
    subtitle: "Importa, transcribe y resume tus grabaciones.",
  },
  transcript: {
    title: "Transcripción",
    subtitle: "Texto completo con marcas de tiempo, búsqueda y exportación.",
  },
  summary: {
    title: "Resumen IA",
    subtitle: "Informe estructurado de la transcripción, listo para PDF.",
  },
  settings: {
    title: "Ajustes",
    subtitle: "Motor local, credenciales y preferencias de salida.",
  },
};

function freshJob(): JobState {
  return {
    status: "idle",
    stage: "",
    message: "",
    percent: 0,
    logs: [],
  };
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentItem => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<RecentItem>;
        return (
          typeof candidate.id === "string" &&
          Boolean(candidate.result) &&
          Array.isArray(candidate.result?.segments)
        );
      })
      .map((item) => ({
        // Entradas antiguas o dañadas no deben romper el panel: se completan
        // los campos que la interfaz muestra.
        ...item,
        name: typeof item.name === "string" ? item.name : "",
        path:
          typeof item.path === "string" && item.path
            ? item.path
            : String(item.result.file ?? ""),
        date: typeof item.date === "string" ? item.date : "",
        duration: Number.isFinite(item.duration) ? item.duration : 0,
        words: Number.isFinite(item.words) ? item.words : 0,
        segments: Number.isFinite(item.segments)
          ? item.segments
          : item.result.segments.length,
        language: typeof item.language === "string" ? item.language : "",
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Ocurrió un error inesperado.";
}

function toResult(event: VoxEvent): TranscriptionResult {
  return {
    file: String(event.file ?? ""),
    outputs: Array.isArray(event.outputs) ? event.outputs.map(String) : [],
    segments: Array.isArray(event.segments) ? (event.segments as Segment[]) : [],
    segments_count: Number(event.segments_count ?? 0),
    words: Number(event.words ?? 0),
    language: String(event.language ?? ""),
    language_probability: Number(event.language_probability ?? 0),
    duration: Number(event.duration ?? 0),
    elapsed: Number(event.elapsed ?? 0),
  };
}

function outputDirOf(result: TranscriptionResult | null, fallback: string): string {
  const first = result?.outputs?.[0];
  return first ? parentDir(first) : fallback;
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [job, setJob] = useState<JobState>(freshJob);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [summary, setSummary] = useState<SummaryArtifacts | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryStage, setSummaryStage] = useState("");
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>(loadRecent);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [desktop, setDesktop] = useState(false);

  const modeRef = useRef<"transcribe" | "summary">("transcribe");
  const resultRef = useRef<TranscriptionResult | null>(null);
  resultRef.current = result;
  const busyRef = useRef(false);
  busyRef.current = job.status === "running" || summaryBusy;

  const notify = useCallback((message: ToastMessage) => setToast(message), []);
  const closeToast = useCallback(() => setToast(null), []);

  // Evita pisar el estado de la interfaz mientras hay una transcripción o un
  // resumen en curso: el backend rechazaría el nuevo trabajo.
  const guardBusy = useCallback((): boolean => {
    if (!busyRef.current) return false;
    notify({
      kind: "info",
      title: "Hay un proceso en curso",
      detail: "Espera a que termine o cancélalo antes de cambiar de transcripción.",
    });
    return true;
  }, [notify]);

  /* --------------------------------------------------------------- arranque */

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [loadedSettings, loadedStatus] = await Promise.all([
          getSettings(),
          getApiStatus(),
        ]);
        if (!active) return;
        setSettings(loadedSettings);
        setStatus(loadedStatus);
      } catch (error) {
        if (!active) return;
        notify({
          kind: "error",
          title: "No se pudo iniciar la aplicación",
          detail: messageOf(error),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    const check = () => setDesktop(isDesktop());
    check();
    window.addEventListener("pywebviewready", check);
    const timer = window.setTimeout(check, 1_600);
    return () => {
      window.removeEventListener("pywebviewready", check);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* almacenamiento lleno o restringido */
    }
  }, [recent]);

  /* ---------------------------------------------------------------- eventos */

  useEffect(() => {
    const off = onEvent((event) => {
      switch (event.event) {
        case "stage": {
          const stage = String(event.stage ?? "");
          const message = String(event.message ?? "");
          if (modeRef.current === "summary") {
            setSummaryBusy(true);
            setSummaryStage(message || "Generando resumen con Gemini");
            return;
          }
          setJob((current) => ({
            ...current,
            status: "running",
            stage,
            message,
            startedAt: current.startedAt ?? Date.now(),
          }));
          return;
        }

        case "info": {
          // Los mensajes del resumen (clave, modelo, rutas) no pertenecen al
          // registro de la transcripción.
          if (modeRef.current === "summary") return;
          const message = String(event.message ?? "").trim();
          if (!message) return;
          setJob((current) => ({
            ...current,
            logs: [...current.logs, message].slice(-14),
          }));
          return;
        }

        case "progress": {
          if (modeRef.current !== "transcribe") return;
          setJob((current) => ({
            ...current,
            status: "running",
            percent: Number(event.percent ?? 0),
            current: Number(event.current ?? 0),
            total: Number(event.total ?? 0),
            stage: String(event.stage ?? current.stage),
          }));
          return;
        }

        case "completed": {
          const next = toResult(event);
          setResult(next);
          setJob((current) => ({
            ...current,
            status: "done",
            stage: "export",
            percent: 100,
            message: "Transcripción completada",
          }));

          const item: RecentItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: baseName(next.file),
            path: next.file,
            date: new Date().toISOString(),
            duration: next.duration,
            words: next.words,
            segments: next.segments_count,
            language: next.language,
            result: next,
          };
          setRecent((current) => [
            item,
            ...current.filter((entry) => entry.path !== next.file),
          ].slice(0, 8));

          setView("transcript");
          notify({
            kind: "success",
            title: "Transcripción lista",
            detail: `${next.segments_count} segmentos · ${next.words.toLocaleString("es")} palabras`,
          });
          return;
        }

        case "summary": {
          const payload = event.summary as Summary | undefined;
          if (!payload) return;
          const artifacts: SummaryArtifacts = {
            summary: payload,
            pdf: String(event.pdf ?? ""),
            json: String(event.json ?? ""),
            model: String(event.model ?? ""),
          };
          setSummary(artifacts);
          setSummaryBusy(false);
          setSummaryStage("");
          setView("summary");
          notify({
            kind: "success",
            title: "Resumen generado",
            detail: artifacts.pdf ? baseName(artifacts.pdf) : "PDF listo para abrir.",
          });
          return;
        }

        case "error": {
          const code = String(event.code ?? "ERROR");
          const message = String(event.message ?? "Ocurrió un error.");
          const summaryMode = modeRef.current === "summary";

          if (summaryMode) {
            setSummaryBusy(false);
            setSummaryStage("");
          } else {
            setJob((current) => ({
              ...current,
              status: code === "CANCELLED" ? "cancelled" : "error",
              message,
            }));
          }

          notify({
            kind: code === "CANCELLED" ? "info" : "error",
            title:
              code === "CANCELLED"
                ? "Proceso cancelado"
                : summaryMode
                  ? "No se pudo generar el resumen"
                  : "No se pudo transcribir",
            detail: message,
          });
          if (!summaryMode && code !== "CANCELLED") setView("dashboard");
          return;
        }

        default:
          return;
      }
    });

    return off;
  }, [notify]);

  /* -------------------------------------------------------------- acciones */

  const handlePickFile = useCallback(async () => {
    if (guardBusy()) return;
    try {
      const picked = await pickFile();
      if (!picked) return;
      setFile(picked);
      setResult(null);
      setSummary(null);
      setJob(freshJob());
      setView("dashboard");
    } catch (error) {
      notify({
        kind: "error",
        title: "No se pudo abrir el archivo",
        detail: messageOf(error),
      });
    }
  }, [guardBusy, notify]);

  const handleClearFile = useCallback(() => {
    if (guardBusy()) return;
    setFile(null);
    setJob(freshJob());
  }, [guardBusy]);

  const handleTranscribe = useCallback(async () => {
    if (guardBusy()) return;
    if (!file) {
      notify({ kind: "info", title: "Elige un archivo primero" });
      return;
    }
    modeRef.current = "transcribe";
    setSummary(null);
    setSummaryBusy(false);
    setView("dashboard");
    setJob({
      status: "running",
      stage: "prepare",
      message: "Preparando archivo",
      percent: 0,
      logs: [],
      startedAt: Date.now(),
    });
    try {
      const response = await transcribe(file.path, settings);
      if (response && response.ok === false) {
        throw new Error(response.error ?? "No se pudo iniciar la transcripción.");
      }
    } catch (error) {
      setJob((current) => ({
        ...current,
        status: "error",
        message: messageOf(error),
      }));
      notify({
        kind: "error",
        title: "No se pudo transcribir",
        detail: messageOf(error),
      });
    }
  }, [file, guardBusy, notify, settings]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelJob();
    } catch (error) {
      notify({ kind: "error", title: "No se pudo cancelar", detail: messageOf(error) });
    }
  }, [notify]);

  const handleGenerateSummary = useCallback(async () => {
    if (guardBusy()) return;
    const current = resultRef.current;
    if (!current) {
      notify({
        kind: "info",
        title: "Primero necesitas una transcripción",
        detail: "Importa un archivo y transcríbelo para poder resumirlo.",
      });
      return;
    }
    if (!status?.hasKey) {
      setView("settings");
      notify({
        kind: "info",
        title: "Configura tu API key de Gemini",
        detail: "La clave se guarda en el Administrador de credenciales de Windows.",
      });
      return;
    }

    modeRef.current = "summary";
    setSummaryBusy(true);
    setSummaryStage("Generando resumen con Gemini");
    setView("summary");
    try {
      const response = await generateSummary(
        settings.geminiModel,
        current.file,
        current.segments,
        outputDirOf(current, settings.outputDir),
      );
      if (response && response.ok === false) {
        throw new Error(response.error ?? "No se pudo iniciar el resumen.");
      }
    } catch (error) {
      setSummaryBusy(false);
      notify({
        kind: "error",
        title: "No se pudo generar el resumen",
        detail: messageOf(error),
      });
    }
  }, [guardBusy, notify, settings.geminiModel, settings.outputDir, status?.hasKey]);

  const handleExport = useCallback(
    async (format: "txt" | "srt" | "both") => {
      const current = resultRef.current;
      if (!current) return;
      try {
        const response = await exportTranscript(
          format,
          current.file,
          current.segments,
          outputDirOf(current, settings.outputDir),
        );
        if (response.ok && response.paths?.length) {
          notify({
            kind: "success",
            title: "Archivo exportado",
            detail: response.paths.join(" · "),
          });
        } else {
          notify({
            kind: "error",
            title: "No se pudo exportar",
            detail: response.error ?? "Revisa la carpeta de salida.",
          });
        }
      } catch (error) {
        notify({ kind: "error", title: "No se pudo exportar", detail: messageOf(error) });
      }
    },
    [notify, settings.outputDir],
  );

  const handleOpenRecent = useCallback(
    (item: RecentItem) => {
      if (guardBusy()) return;
      const restored = item.result;
      setResult(restored);
      // El resumen anterior pertenece a otro archivo: no debe reutilizarse.
      setSummary(null);
      setSummaryBusy(false);
      setSummaryStage("");
      setFile({
        path: restored.file || item.path,
        name: item.name || baseName(item.path),
      });
      setJob({
        status: "done",
        stage: "export",
        message: "Transcripción completada",
        percent: 100,
        logs: [],
      });
      setView("transcript");
    },
    [guardBusy],
  );

  const handleOpenPath = useCallback(
    async (path: string) => {
      if (!path) return;
      try {
        const response = await openPath(path);
        if (response && response.ok === false) {
          notify({
            kind: "error",
            title: "No se pudo abrir",
            detail: response.error ?? path,
          });
        }
      } catch (error) {
        notify({ kind: "error", title: "No se pudo abrir", detail: messageOf(error) });
      }
    },
    [notify],
  );

  const handleOpenOutput = useCallback(() => {
    const target = resultRef.current?.outputs[0];
    if (target) {
      void handleOpenPath(parentDir(target));
    } else if (settings.outputDir) {
      void handleOpenPath(settings.outputDir);
    } else {
      notify({ kind: "info", title: "Aún no hay una carpeta de salida" });
    }
  }, [handleOpenPath, notify, settings.outputDir]);

  const handleSaveSettings = useCallback(
    async (next: Settings) => {
      try {
        const response = await saveSettings(next);
        if (response && response.ok === false) {
          throw new Error(response.error ?? "No se pudieron guardar los ajustes.");
        }
        setSettings(next);
        setStatus((current) =>
          current
            ? {
                ...current,
                geminiModel: next.geminiModel,
                transcriptionModel: next.model,
              }
            : current,
        );
        notify({ kind: "success", title: "Ajustes guardados" });
      } catch (error) {
        notify({
          kind: "error",
          title: "No se pudieron guardar los ajustes",
          detail: messageOf(error),
        });
      }
    },
    [notify],
  );

  const handleSaveKey = useCallback(
    async (key: string) => {
      try {
        const response = await saveApiKey(key);
        if (response.ok) {
          const refreshed = await getApiStatus().catch(() => null);
          if (refreshed) setStatus(refreshed);
        }
        return response;
      } catch (error) {
        return { ok: false, error: messageOf(error) };
      }
    },
    [],
  );

  const handleTestKey = useCallback(async (key: string, model?: string) => {
    try {
      return await testApiKey(key, model);
    } catch (error) {
      return { ok: false, error: messageOf(error) };
    }
  }, []);

  const handlePickFolder = useCallback(async () => {
    try {
      return await pickFolder();
    } catch (error) {
      notify({
        kind: "error",
        title: "No se pudo elegir la carpeta",
        detail: messageOf(error),
      });
      return null;
    }
  }, [notify]);

  /* ------------------------------------------------------------------ render */

  const meta = VIEW_TITLES[view];

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden text-slate-200">
      <Sidebar
        view={view}
        onNavigate={setView}
        recent={recent}
        onOpenRecent={handleOpenRecent}
        hasResult={Boolean(result)}
        hasSummary={Boolean(summary)}
        version={status?.version ?? "0.1.2"}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          status={status}
          desktop={desktop}
          onOpenSettings={() => setView("settings")}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div key={view} className="mx-auto w-full max-w-[1280px] animate-fade">
            {view === "dashboard" ? (
              <Dashboard
                file={file}
                job={job}
                result={result}
                summary={summary}
                settings={settings}
                status={status}
                recent={recent}
                onPickFile={handlePickFile}
                onClearFile={handleClearFile}
                onTranscribe={handleTranscribe}
                onCancel={handleCancel}
                onOpenSettings={() => setView("settings")}
                onOpenTranscript={() => setView("transcript")}
                onOpenSummary={() => setView("summary")}
                onGenerateSummary={handleGenerateSummary}
                onExport={handleExport}
                onOpenRecent={handleOpenRecent}
                onOpenFolder={handleOpenOutput}
              />
            ) : null}

            {view === "transcript" ? (
              <TranscriptView
                result={result}
                job={job}
                onImport={handlePickFile}
                onExport={handleExport}
                onOpenFolder={handleOpenOutput}
                onGenerateSummary={handleGenerateSummary}
                onGoDashboard={() => setView("dashboard")}
              />
            ) : null}

            {view === "summary" ? (
              <SummaryView
                summary={summary}
                result={result}
                busy={summaryBusy}
                stage={summaryStage}
                hasKey={Boolean(status?.hasKey)}
                onGenerate={handleGenerateSummary}
                onOpenSettings={() => setView("settings")}
                onOpenPdf={handleOpenPath}
                onOpenFolder={handleOpenOutput}
              />
            ) : null}

            {view === "settings" ? (
              <SettingsView
                settings={settings}
                status={status}
                onSave={handleSaveSettings}
                onSaveKey={handleSaveKey}
                onTestKey={handleTestKey}
                onPickFolder={handlePickFolder}
                onOpenPath={handleOpenPath}
              />
            ) : null}
          </div>
        </div>
      </main>

      {toast ? <Toast toast={toast} onClose={closeToast} /> : null}
    </div>
  );
}
