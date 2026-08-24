export type StudyInput = {
  name?: string;
  active?: boolean;
  startedOn?: string;
  endedOn?: string | null;
  preferredDays?: string[];
  preferredTime?: string;
  address?: string;
  remindersEnabled?: boolean;
  nextMeetingOn?: string | null;
  recurrence?: "none" | "weekly";
  staleAfterDays?: number;
  currentSubject?: string;
  notes?: string;
};

export const STUDY_DAY_OPTIONS = [
  { id: "monday", short: "Seg", label: "Segunda-feira" },
  { id: "tuesday", short: "Ter", label: "Terça-feira" },
  { id: "wednesday", short: "Qua", label: "Quarta-feira" },
  { id: "thursday", short: "Qui", label: "Quinta-feira" },
  { id: "friday", short: "Sex", label: "Sexta-feira" },
  { id: "saturday", short: "Sáb", label: "Sábado" },
  { id: "sunday", short: "Dom", label: "Domingo" },
] as const;

export function studyScheduleLabel(study: { preferredDays?: string[]; preferredTime?: string }) {
  const days = STUDY_DAY_OPTIONS.filter((day) => study.preferredDays?.includes(day.id)).map((day) => day.short).join(", ");
  const time = study.preferredTime?.trim();
  return [days, time ? `às ${time}` : ""].filter(Boolean).join(" · ");
}

export function daysSinceDate(value: string, reference = new Date()) {
  const start = new Date(`${value}T12:00:00`);
  const current = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
  return Math.max(0, Math.floor((current.getTime() - start.getTime()) / 86_400_000));
}

export function studyNeedsAttention(study: { active: boolean; startedOn: string; lastContactOn?: string | null; staleAfterDays?: number }, reference = new Date()) {
  if (!study.active) return false;
  return daysSinceDate(study.lastContactOn || study.startedOn, reference) >= (study.staleAfterDays ?? 14);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2200 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function parseStudyInput(input: StudyInput, current?: StudyInput) {
  const name = String(input.name ?? current?.name ?? "").trim().slice(0, 80);
  const startedOn = String(input.startedOn ?? current?.startedOn ?? "");
  const active = input.active ?? current?.active ?? true;
  const requestedEnd = input.endedOn === undefined ? current?.endedOn ?? null : input.endedOn;
  const endedOn = active ? null : String(requestedEnd ?? new Date().toISOString().slice(0, 10));
  const requestedDays = input.preferredDays ?? current?.preferredDays ?? [];
  if (!Array.isArray(requestedDays)) throw new Error("Selecione dias válidos para o estudo.");
  const validDays = new Set<string>(STUDY_DAY_OPTIONS.map((day) => day.id));
  const preferredDays = [...new Set(requestedDays.map(String))].filter((day) => validDays.has(day));
  if (preferredDays.length !== new Set(requestedDays.map(String)).size) throw new Error("Selecione dias válidos para o estudo.");
  const preferredTime = String(input.preferredTime ?? current?.preferredTime ?? "").trim();
  const address = String(input.address ?? current?.address ?? "").trim().slice(0, 240);
  const remindersEnabled = input.remindersEnabled ?? current?.remindersEnabled ?? false;
  const requestedNextMeeting = input.nextMeetingOn === undefined ? current?.nextMeetingOn ?? null : input.nextMeetingOn;
  const nextMeetingOn = requestedNextMeeting ? String(requestedNextMeeting) : null;
  const recurrence = input.recurrence ?? current?.recurrence ?? "weekly";
  const staleAfterDays = Math.round(Number(input.staleAfterDays ?? current?.staleAfterDays ?? 14));
  const currentSubject = String(input.currentSubject ?? current?.currentSubject ?? "").trim().slice(0, 140);
  const notes = String(input.notes ?? current?.notes ?? "").trim().slice(0, 500);
  if (name.length < 2) throw new Error("Informe um nome, apelido ou identificação para o estudo.");
  if (!validDate(startedOn)) throw new Error("Informe uma data de início válida.");
  if (endedOn && !validDate(endedOn)) throw new Error("Informe uma data de encerramento válida.");
  if (endedOn && endedOn < startedOn) throw new Error("O encerramento não pode ser anterior ao início.");
  if (preferredTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) throw new Error("Informe um horário preferido válido.");
  if (nextMeetingOn && !validDate(nextMeetingOn)) throw new Error("Informe uma data válida para o próximo encontro.");
  if (!["none", "weekly"].includes(recurrence)) throw new Error("Selecione uma recorrência válida.");
  if (!Number.isInteger(staleAfterDays) || staleAfterDays < 1 || staleAfterDays > 365) throw new Error("Informe o alerta de inatividade entre 1 e 365 dias.");
  if (remindersEnabled && !preferredTime) throw new Error("Informe o horário preferido antes de ativar o lembrete individual.");
  if (remindersEnabled && !nextMeetingOn && preferredDays.length === 0) throw new Error("Informe o próximo encontro ou pelo menos um dia preferido para ativar o lembrete.");
  return { name, active, startedOn, endedOn, preferredDays, preferredTime, address, remindersEnabled, nextMeetingOn, recurrence, staleAfterDays, currentSubject, notes, updatedAt: new Date() };
}
