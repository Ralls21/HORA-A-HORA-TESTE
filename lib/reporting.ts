export type RoundingMode = "none" | "nearest" | "up" | "down";

export function roundReportMinutes(minutes: number, mode: RoundingMode) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (mode === "none") return safeMinutes;
  const hours = safeMinutes / 60;
  if (mode === "up") return Math.ceil(hours) * 60;
  if (mode === "down") return Math.floor(hours) * 60;
  return Math.round(hours) * 60;
}

export function recordTotalMinutes(record: { minutes: number; ldcMinutes?: number }) {
  return Math.max(0, record.minutes) + Math.max(0, record.ldcMinutes ?? 0);
}

export function studyIsActiveInMonth(
  study: { startedOn: string; endedOn: string | null },
  year: number,
  month: number,
) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return study.startedOn <= last && (!study.endedOn || study.endedOn >= first);
}

export function annualProjection(totalMinutes: number, completedMonths: number) {
  if (completedMonths <= 0) return 0;
  return Math.round((totalMinutes / completedMonths) * 12);
}
