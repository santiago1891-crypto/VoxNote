export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const tail = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}

export function formatHours(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  // Redondear primero a minutos evita resultados como «1 h 60 min».
  const totalMinutes = Math.round(total / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (totalMinutes > 0) return `${totalMinutes} min`;
  return `${total} s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function stemName(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index > 0 ? path.slice(0, index) : path;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function relativeDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) {
    return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return formatDate(iso);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString("es")} ${count === 1 ? singular : pluralForm}`;
}

export function percent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function joinPath(dir: string, name: string): string {
  const separator = dir.includes("\\") || !dir.includes("/") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${separator}${name}`;
}
