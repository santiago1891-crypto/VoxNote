export type View = "dashboard" | "transcript" | "summary" | "settings";

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  file: string;
  outputs: string[];
  segments: Segment[];
  segments_count: number;
  words: number;
  language: string;
  language_probability: number;
  duration: number;
  elapsed: number;
}

export interface SummarySection {
  heading: string;
  summary: string;
  bullets: string[];
}

export interface Concept {
  term: string;
  definition: string;
}

export interface Summary {
  title: string;
  subtitle: string;
  overview: string;
  sections: SummarySection[];
  key_ideas: string[];
  concepts: Concept[];
  conclusions: string[];
  keywords: string[];
}

export interface SummaryArtifacts {
  summary: Summary;
  pdf: string;
  json: string;
  model: string;
}

export type JobStatus = "idle" | "running" | "done" | "error" | "cancelled";

export interface JobState {
  status: JobStatus;
  stage: string;
  message: string;
  percent: number;
  current?: number;
  total?: number;
  logs: string[];
  startedAt?: number;
}

export type OutputFormat = "txt" | "srt" | "both";

export interface Settings {
  model: string;
  language: string;
  vad: boolean;
  formats: OutputFormat;
  outputDir: string;
  geminiModel: string;
  initialPrompt: string;
}

export interface ApiStatus {
  hasKey: boolean;
  hint: string;
  geminiModel: string;
  transcriptionModel: string;
  version: string;
  settingsPath: string;
  modelsDir: string;
  keyError?: string;
}

export interface PickedFile {
  path: string;
  name: string;
  size?: number;
}

export interface RecentItem {
  id: string;
  name: string;
  path: string;
  date: string;
  duration: number;
  words: number;
  segments: number;
  language: string;
  result: TranscriptionResult;
}

export interface ToastMessage {
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
}

export interface VoxEvent {
  event: string;
  [key: string]: unknown;
}
