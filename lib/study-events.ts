export type StudyEventStatus = "present" | "absent" | "rescheduled";

export type StudyEventInput = {
  eventDate?: string;
  eventTime?: string;
  status?: StudyEventStatus;
  subject?: string;
  progress?: number;
  notes?: string;
  rescheduledTo?: string | null;
  rescheduledTime?: string;
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2200 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validTime(value: string) {
  return !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseStudyEventInput(input: StudyEventInput, current?: StudyEventInput) {
  const eventDate = String(input.eventDate ?? current?.eventDate ?? "");
  const eventTime = String(input.eventTime ?? current?.eventTime ?? "").trim();
  const status = String(input.status ?? current?.status ?? "present") as StudyEventStatus;
  const subject = String(input.subject ?? current?.subject ?? "").trim().slice(0, 180);
  const progress = Math.round(Number(input.progress ?? current?.progress ?? 0));
  const notes = String(input.notes ?? current?.notes ?? "").trim().slice(0, 800);
  const requestedReschedule = input.rescheduledTo === undefined ? current?.rescheduledTo ?? null : input.rescheduledTo;
  const rescheduledTo = requestedReschedule ? String(requestedReschedule) : null;
  const rescheduledTime = String(input.rescheduledTime ?? current?.rescheduledTime ?? "").trim();

  if (!validDate(eventDate)) throw new Error("Informe a data do encontro.");
  if (!validTime(eventTime)) throw new Error("Informe um horário válido para o encontro.");
  if (!["present", "absent", "rescheduled"].includes(status)) throw new Error("Selecione uma situação válida.");
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new Error("Informe um progresso entre 0 e 100%.");
  if (status === "present" && subject.length < 2) throw new Error("Informe o assunto estudado.");
  if (status === "rescheduled" && (!rescheduledTo || !validDate(rescheduledTo))) throw new Error("Informe a nova data do encontro.");
  if (status === "rescheduled" && rescheduledTo && rescheduledTo <= eventDate) throw new Error("A nova data precisa ser posterior ao encontro original.");
  if (!validTime(rescheduledTime)) throw new Error("Informe um horário válido para o reagendamento.");

  return {
    eventDate,
    eventTime,
    status,
    subject: status === "present" ? subject : "",
    progress,
    notes,
    rescheduledTo: status === "rescheduled" ? rescheduledTo : null,
    rescheduledTime: status === "rescheduled" ? rescheduledTime : "",
    updatedAt: new Date(),
  };
}

export function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

type StudySchedule = {
  nextMeetingOn?: string | null;
  recurrence: "none" | "weekly";
};

type ScheduleEvent = {
  eventDate: string;
  status: StudyEventStatus;
  rescheduledTo?: string | null;
};

/**
 * Mantém a agenda futura estável ao cadastrar ou editar itens antigos.
 * Um reagendamento explícito sempre tem prioridade; na recorrência semanal,
 * o próximo encontro só avança quando o evento alcança a data que estava
 * agendada ou quando a edição altera justamente o evento que originou a agenda.
 */
export function nextMeetingAfterEvent(study: StudySchedule, event: ScheduleEvent, previous?: ScheduleEvent) {
  if (event.status === "rescheduled" && event.rescheduledTo) return event.rescheduledTo;

  const currentNext = study.nextMeetingOn ?? null;
  const previousGenerated = previous && study.recurrence === "weekly" ? addDays(previous.eventDate, 7) : null;
  const editingScheduledEvent = Boolean(previous && (
    currentNext === previous.eventDate
    || currentNext === previous.rescheduledTo
    || currentNext === previousGenerated
  ));

  if (study.recurrence === "none") {
    return currentNext === event.eventDate || editingScheduledEvent ? null : currentNext;
  }

  const candidate = addDays(event.eventDate, 7);
  if (!currentNext || currentNext <= event.eventDate || editingScheduledEvent) return candidate;
  return currentNext;
}
