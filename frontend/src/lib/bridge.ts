import type {
  ApiStatus,
  PickedFile,
  Segment,
  Settings,
  SummaryArtifacts,
  TranscriptionResult,
  VoxEvent,
} from "../types";
import { baseName, joinPath, stemName } from "./format";

interface VoxApi {
  pick_file: () => Promise<PickedFile | null>;
  pick_folder: () => Promise<string | null>;
  transcribe: (path: string, options: Settings) => Promise<{ ok: boolean; error?: string }>;
  cancel: () => Promise<{ ok: boolean }>;
  export_transcript: (
    format: "txt" | "srt" | "both",
    source: string,
    segments: Segment[],
    outputDir: string,
  ) => Promise<{
    ok: boolean;
    paths?: string[];
    error?: string;
  }>;
  generate_summary: (
    model: string,
    source: string,
    segments: Segment[],
    outputDir: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  api_status: () => Promise<ApiStatus>;
  save_api_key: (key: string) => Promise<{ ok: boolean; hint?: string; error?: string }>;
  test_api_key: (
    key: string,
    model: string,
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  get_settings: () => Promise<Settings>;
  save_settings: (settings: Settings) => Promise<{ ok: boolean; error?: string }>;
  open_path: (path: string) => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    pywebview?: { api?: VoxApi };
    voxnoteEmit?: (payload: VoxEvent) => void;
  }
}

/* ------------------------------------------------------------------ eventos */

type Listener = (event: VoxEvent) => void;
const listeners = new Set<Listener>();

function dispatch(event: VoxEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error("voxnote event handler", error);
    }
  });
}

window.voxnoteEmit = (payload: VoxEvent) => {
  if (payload && typeof payload === "object") dispatch(payload);
};

export function onEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* -------------------------------------------------------------------- mock */

const MOCK_SETTINGS: Settings = {
  model: "small",
  language: "es",
  vad: true,
  formats: "both",
  outputDir: "C:\\Users\\santi\\Videos\\VoxNote",
  geminiModel: "gemini-3.5-flash",
  initialPrompt: "",
};

const MOCK_FILE: PickedFile = {
  path: "C:\\Users\\santi\\Videos\\Grabaciones de pantalla\\Clase de lógica - formas normales.mp4",
  name: "Clase de lógica - formas normales.mp4",
  size: 1_932_735_283,
};

const MOCK_LINES: Array<[number, string]> = [
  [0, "Bueno, hoy vamos a ver lo que son las formas normales dentro del cálculo proposicional."],
  [9, "La idea central es poder transformar cualquier fórmula en una forma equivalente que sea más fácil de analizar."],
  [21, "Recordemos primero qué es un literal: un literal es un átomo o la negación de un átomo."],
  [34, "A partir de los literales vamos a construir lo que llamamos cláusulas."],
  [46, "Una cláusula es una disyunción de literales, por ejemplo p o q o no r."],
  [58, "Y un término es una conjunción de literales, por ejemplo p y q y no r."],
  [71, "Con estas dos definiciones ya podemos hablar de la forma normal conjuntiva."],
  [83, "Decimos que una fórmula está en FNC si es una conjunción de cláusulas."],
  [96, "Es decir, cada paréntesis grande contiene disyunciones y afuera hay conjunciones."],
  [110, "La forma normal disyuntiva es la dual: una disyunción de términos."],
  [123, "Un resultado importante es que toda fórmula tiene una FNC y una FND equivalentes."],
  [137, "El procedimiento más directo usa las leyes de equivalencia que ya conocemos."],
  [151, "Primero eliminamos los condicionales y los bicondicionales."],
  [163, "Después llevamos las negaciones hacia adentro aplicando De Morgan."],
  [176, "Y por último distribuimos para obtener la forma normal que buscamos."],
  [190, "Hay un segundo método que trabaja directamente con la tabla de verdad."],
  [204, "Nos fijamos en las filas donde la fórmula es verdadera para construir la FND."],
  [218, "Si queremos la FNC, miramos las filas donde la fórmula es falsa."],
  [232, "Este método es muy mecánico, pero la fórmula puede crecer muchísimo."],
  [247, "Por eso, en la práctica, conviene simplificar con equivalencias después de convertir."],
  [261, "¿Alguna duda hasta acá? Sí, adelante."],
  [274, "Claro, la doble negación también se puede eliminar en cualquier momento."],
  [288, "Lo importante es no perder la equivalencia lógica en cada paso."],
  [302, "La próxima clase vamos a usar todo esto para el problema de satisfacibilidad."],
  [317, "Recuerden que SAT fue el primer problema que se demostró NP-completo."],
  [331, "Y las formas normales son justamente el formato estándar de entrada de los solvers."],
  [346, "Bueno, nos vemos la próxima y practiquen con los ejercicios de la guía."],
];

const MOCK_SEGMENTS = MOCK_LINES.map(([start, text]) => ({
  start,
  end: start + 10,
  text,
}));

function buildMockResult(): TranscriptionResult {
  return {
    file: MOCK_FILE.path,
    outputs: [joinPath(MOCK_SETTINGS.outputDir, "Clase de lógica - formas normales.txt")],
    segments: MOCK_SEGMENTS,
    segments_count: MOCK_SEGMENTS.length,
    words: MOCK_SEGMENTS.reduce((total, segment) => total + segment.text.split(/\s+/).length, 0),
    language: "es",
    language_probability: 0.99,
    duration: 1_284,
    elapsed: 436,
  };
}

const MOCK_SUMMARY: SummaryArtifacts = {
  summary: {
    title: "Formas normales en el cálculo proposicional",
    subtitle: "De la definición de literal a la conversión de fórmulas en FNC y FND",
    overview:
      "La clase introduce las formas normales conjuntiva (FNC) y disyuntiva (FND) como representaciones equivalentes de cualquier fórmula proposicional. Se definen literales, cláusulas y términos, y se presentan dos procedimientos de conversión: la aplicación de leyes de equivalencia y la lectura directa de la tabla de verdad. El cierre conecta estas formas con el problema SAT y su uso como entrada estándar de los solvers.",
    sections: [
      {
        heading: "Literales, cláusulas y términos",
        summary:
          "Se construye el vocabulario mínimo de las formas normales. Un literal es un átomo o su negación; una cláusula es una disyunción de literales y un término es una conjunción de literales.",
        bullets: [
          "Literal: átomo o negación de un átomo.",
          "Cláusula: disyunción finita de literales.",
          "Término: conjunción finita de literales.",
        ],
      },
      {
        heading: "Forma normal conjuntiva",
        summary:
          "Una fórmula está en FNC cuando es una conjunción de cláusulas. Es la forma que exige cada paréntesis interior como disyunción y la estructura exterior como conjunción.",
        bullets: [
          "Cada cláusula se escribe entre paréntesis.",
          "La conjunción exterior puede tener cualquier cantidad de cláusulas.",
          "Toda fórmula proposicional admite una FNC equivalente.",
        ],
      },
      {
        heading: "Forma normal disyuntiva",
        summary:
          "La FND es la construcción dual: una disyunción de términos. Mientras la FNC agrupa disyunciones, la FND agrupa conjunciones.",
        bullets: [
          "Cada término es una conjunción de literales.",
          "Los términos se unen mediante disyunciones.",
          "La FND se obtiene naturalmente de las filas verdaderas de la tabla.",
        ],
      },
      {
        heading: "Conversión por equivalencias",
        summary:
          "El primer método reescribe la fórmula preservando su valor de verdad. Se eliminan condicionales y bicondicionales, se aplican las leyes de De Morgan y finalmente se distribuye.",
        bullets: [
          "Eliminar implicaciones y equivalencias.",
          "Llevar las negaciones hacia los átomos.",
          "Distribuir para alcanzar la forma normal elegida.",
        ],
      },
      {
        heading: "Conversión desde la tabla de verdad",
        summary:
          "El segundo método es mecánico: se leen las filas verdaderas para construir la FND y las filas falsas para construir la FNC. El costo puede crecer exponencialmente.",
        bullets: [
          "Filas verdaderas: una conjunción por fila, unidas por disyunción.",
          "Filas falsas: una disyunción por fila, unidas por conjunción.",
          "Conviene simplificar después de convertir.",
        ],
      },
      {
        heading: "Conexión con el problema SAT",
        summary:
          "Las formas normales son el formato de entrada estándar de los solvers de satisfacibilidad. La clase anticipa que SAT fue el primer problema demostrado NP-completo.",
        bullets: [
          "La FNC es el formato habitual de los solvers.",
          "SAT pregunta si existe una asignación que haga verdadera la fórmula.",
          "La próxima clase desarrolla el tema en profundidad.",
        ],
      },
    ],
    key_ideas: [
      "Toda fórmula proposicional puede transformarse a FNC o FND sin cambiar su significado.",
      "La FNC es una conjunción de disyunciones de literales.",
      "La FND es una disyunción de conjunciones de literales.",
      "Las leyes de equivalencia permiten convertir paso a paso y verificar cada transformación.",
      "La tabla de verdad ofrece un método directo pero potencialmente exponencial.",
      "Las formas normales conectan la lógica proposicional con los solvers y el problema SAT.",
    ],
    concepts: [
      { term: "Literal", definition: "Un átomo proposicional o su negación." },
      { term: "Cláusula", definition: "Disyunción finita de literales." },
      { term: "Término", definition: "Conjunción finita de literales." },
      { term: "FNC", definition: "Conjunción de cláusulas, cada una disyunción de literales." },
      { term: "FND", definition: "Disyunción de términos, cada uno conjunción de literales." },
      { term: "SAT", definition: "Problema de decidir si una fórmula proposicional es satisfacible." },
    ],
    conclusions: [
      "Las formas normales permiten comparar y manipular fórmulas con una estructura uniforme.",
      "El método por equivalencias es más compacto; el de tabla de verdad es más mecánico.",
      "La conversión puede aumentar el tamaño de la fórmula, por lo que simplificar es parte del proceso.",
      "La FNC es la puerta de entrada al estudio de SAT y de los solvers modernos.",
    ],
    keywords: ["lógica proposicional", "FNC", "FND", "literal", "cláusula", "SAT", "equivalencia lógica"],
  },
  pdf: joinPath(MOCK_SETTINGS.outputDir, "Clase de lógica - formas normales_resumen.pdf"),
  json: joinPath(MOCK_SETTINGS.outputDir, "Clase de lógica - formas normales_resumen.json"),
  model: "gemini-3.5-flash",
};

function storedSettings(): Settings {
  try {
    const raw = localStorage.getItem("voxnote.settings");
    if (raw) return { ...MOCK_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...MOCK_SETTINGS };
}

let mockHasKey = false;

const mockApi: VoxApi = {
  async pick_file() {
    return { ...MOCK_FILE };
  },
  async pick_folder() {
    return "C:\\Users\\santi\\Videos\\VoxNote";
  },
  async transcribe(path, options) {
    const result = buildMockResult();
    result.file = path;
    result.outputs = [
      joinPath(options.outputDir, `${baseName(path).replace(/\.[^.]+$/, "")}.txt`),
      joinPath(options.outputDir, `${baseName(path).replace(/\.[^.]+$/, "")}.srt`),
    ];

    const emit = (event: VoxEvent) => dispatch(event);
    emit({ event: "stage", stage: "prepare", message: "1/4 Preparando archivo" });
    window.setTimeout(() => {
      emit({ event: "info", message: `Archivo: ${baseName(path)}` });
      emit({ event: "info", message: "Formato: mp4 · Audio presente, 48 kHz" });
    }, 400);
    window.setTimeout(() => {
      emit({ event: "stage", stage: "audio", message: "2/4 Preparando audio" });
      emit({ event: "info", message: "Decodificando audio a 16 kHz mono..." });
    }, 900);
    window.setTimeout(() => {
      emit({ event: "stage", stage: "transcription", message: "3/4 Cargando modelo y transcribiendo" });
      emit({ event: "info", message: `Modelo: ${options.model} (CPU, int8)` });
    }, 1_600);

    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      const value = Math.min(99, step * 4);
      emit({ event: "progress", stage: "transcription", current: (value / 100) * 1_284, total: 1_284, percent: value });
      if (step === 12) {
        emit({ event: "info", message: "Voz detectada · escribiendo segmentos" });
      }
    }, 260);

    window.setTimeout(() => {
      window.clearInterval(timer);
      emit({ event: "stage", stage: "export", message: "4/4 Guardando resultado" });
      window.setTimeout(() => {
        emit({ event: "completed", ...result });
      }, 500);
    }, 26 * 260 + 1_800);

    return { ok: true };
  },
  async cancel() {
    return { ok: true };
  },
  async export_transcript(format, source, _segments, outputDir) {
    const folder = outputDir || MOCK_SETTINGS.outputDir;
    const base = joinPath(folder, stemName(source || "transcripcion"));
    const paths = format === "both" ? [`${base}.txt`, `${base}.srt`] : [`${base}.${format}`];
    return { ok: true, paths };
  },
  async generate_summary(_model, _source, _segments, _outputDir) {
    const emit = (event: VoxEvent) => dispatch(event);
    emit({ event: "stage", stage: "summary", message: "Generando resumen con Gemini" });
    window.setTimeout(() => {
      emit({ event: "summary", ...MOCK_SUMMARY });
    }, 1_600);
    return { ok: true };
  },
  async api_status() {
    return {
      hasKey: mockHasKey,
      hint: mockHasKey ? "••••T0gA" : "",
      geminiModel: storedSettings().geminiModel,
      transcriptionModel: storedSettings().model,
      version: "0.1.2",
      settingsPath: "%LOCALAPPDATA%\\VoxNote\\settings.json",
      modelsDir: "%LOCALAPPDATA%\\VoxNote\\models",
    };
  },
  async save_api_key(key) {
    const value = key.trim();
    if (!value) return { ok: false, error: "La API key está vacía." };
    mockHasKey = true;
    return { ok: true, hint: `••••${value.slice(-4)}` };
  },
  async test_api_key(key, _model) {
    const value = key.trim();
    if (value.length < 12) {
      return { ok: false, error: "La API key no parece válida." };
    }
    return { ok: true, message: "Conexión correcta con Gemini (modo demostración)." };
  },
  async get_settings() {
    return storedSettings();
  },
  async save_settings(settings) {
    try {
      localStorage.setItem("voxnote.settings", JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    return { ok: true };
  },
  async open_path() {
    return { ok: true };
  },
};

/* -------------------------------------------------------------------- real */

let cachedApi: VoxApi | null = null;
let pendingApi: Promise<VoxApi> | null = null;

function liveApi(): VoxApi | null {
  const api = window.pywebview?.api;
  if (api && typeof (api as VoxApi).get_settings === "function") return api as VoxApi;
  return null;
}

async function resolveApi(): Promise<VoxApi> {
  const live = liveApi();
  if (live) {
    cachedApi = live;
    return live;
  }
  if (cachedApi) return cachedApi;

  // En un navegador normal no existe pywebview: usamos el mock de inmediato.
  if (!window.pywebview) {
    cachedApi = mockApi;
    return mockApi;
  }

  // pywebview crea window.pywebview.api vacío antes de inyectar los métodos.
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("pywebviewready", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 5_000);
    const poll = window.setInterval(() => {
      if (liveApi()) finish();
    }, 80);
    window.addEventListener("pywebviewready", finish, { once: true });
    if (liveApi()) finish();
  });

  cachedApi = liveApi() ?? mockApi;
  return cachedApi;
}

async function getApi(): Promise<VoxApi> {
  if (!pendingApi) {
    pendingApi = resolveApi().finally(() => {
      pendingApi = null;
    });
  }
  return pendingApi;
}

export const isDesktop = (): boolean => Boolean(liveApi());

export async function pickFile(): Promise<PickedFile | null> {
  const api = await getApi();
  const picked = await api.pick_file();
  const failure = (picked as { error?: unknown } | null)?.error;
  if (typeof failure === "string" && failure) {
    throw new Error(failure);
  }
  return picked?.path ? picked : null;
}

export async function pickFolder(): Promise<string | null> {
  const api = await getApi();
  return (await api.pick_folder()) || null;
}

export async function transcribe(path: string, settings: Settings) {
  const api = await getApi();
  return api.transcribe(path, settings);
}

export async function cancelJob() {
  const api = await getApi();
  return api.cancel();
}

export async function exportTranscript(
  format: "txt" | "srt" | "both",
  source: string,
  segments: Segment[],
  outputDir = "",
) {
  const api = await getApi();
  return api.export_transcript(format, source, segments, outputDir);
}

export async function generateSummary(
  model: string,
  source: string,
  segments: Segment[],
  outputDir = "",
) {
  const api = await getApi();
  return api.generate_summary(model, source, segments, outputDir);
}

export async function getApiStatus(): Promise<ApiStatus> {
  const api = await getApi();
  return api.api_status();
}

export async function saveApiKey(key: string) {
  const api = await getApi();
  return api.save_api_key(key);
}

export async function testApiKey(key: string, model = "") {
  const api = await getApi();
  return api.test_api_key(key, model);
}

export async function getSettings(): Promise<Settings> {
  const api = await getApi();
  const settings = await api.get_settings();
  return { ...MOCK_SETTINGS, ...settings };
}

export async function saveSettings(settings: Settings) {
  const api = await getApi();
  return api.save_settings(settings);
}

export async function openPath(path: string) {
  const api = await getApi();
  return api.open_path(path);
}
