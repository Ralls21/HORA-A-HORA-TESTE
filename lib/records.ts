const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export type RecordInput = {
  date: string;
  hours?: number;
  minutes?: number;
  ldcHours?: number;
  ldcMinutes?: number;
  publications?: number;
  studies?: number;
  studyIds?: number[];
  notes?: string;
};

export const MAX_RECORD_HOURS = 200;
export const MIN_RECORD_YEAR = 2000;
export const MAX_RECORD_YEAR = 2200;

export type DurationFieldErrors = {
  hours?: string;
  minutes?: string;
};

export function validateDurationFields(hoursValue: string, minutesValue: string): DurationFieldErrors {
  const errors: DurationFieldErrors = {};
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (!hoursValue.trim() || !Number.isInteger(hours) || hours < 0 || hours > MAX_RECORD_HOURS) {
    errors.hours = `Digite uma quantidade de horas entre 0 e ${MAX_RECORD_HOURS}.`;
  }
  if (!minutesValue.trim() || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    errors.minutes = "Digite os minutos entre 0 e 59.";
  }
  if (!errors.hours && !errors.minutes && hours === MAX_RECORD_HOURS && minutes > 0) {
    errors.minutes = `Com ${MAX_RECORD_HOURS} horas, os minutos precisam ser zero.`;
  }
  return errors;
}

export function parseRecordDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new Error("Informe uma data válida.");
  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    year < MIN_RECORD_YEAR ||
    year > MAX_RECORD_YEAR ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) throw new Error("Informe uma data válida.");
  return { date: value, parsedDate, year, month, day, weekday: WEEKDAYS[parsedDate.getUTCDay()] };
}

export function parseRecordInput(input: RecordInput) {
  const { year, month, parsedDate } = parseRecordDate(input.date);

  const hasHours = input.hours !== undefined && input.hours !== null;
  const hasMinutes = input.minutes !== undefined && input.minutes !== null;
  let totalMinutes: number;

  if (hasHours && hasMinutes) {
    const hours = Number(input.hours);
    const minutes = Number(input.minutes);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      throw new Error("As horas e os minutos devem ser números inteiros.");
    }
    if (hours < 0 || hours > MAX_RECORD_HOURS || minutes < 0 || minutes > 59 || (hours === MAX_RECORD_HOURS && minutes > 0)) {
      throw new Error(`As horas devem estar entre 0 e ${MAX_RECORD_HOURS}, e os minutos entre 0 e 59.`);
    }
    totalMinutes = hours * 60 + minutes;
  } else if (hasMinutes) {
    // Mantém compatibilidade com versões anteriores que enviavam o total diretamente em minutos.
    totalMinutes = Math.round(Number(input.minutes));
  } else {
    // Mantém compatibilidade com rascunhos e clientes antigos que enviavam horas decimais.
    totalMinutes = Math.round(Number(input.hours ?? 0) * 60);
  }

  const ldcHours = Number(input.ldcHours ?? 0);
  const ldcMinutesPart = Number(input.ldcMinutes ?? 0);
  if (!Number.isInteger(ldcHours) || !Number.isInteger(ldcMinutesPart)) {
    throw new Error("As horas LDC e os minutos LDC devem ser números inteiros.");
  }
  if (ldcHours < 0 || ldcHours > MAX_RECORD_HOURS || ldcMinutesPart < 0 || ldcMinutesPart > 59 || (ldcHours === MAX_RECORD_HOURS && ldcMinutesPart > 0)) {
    throw new Error(`As horas LDC devem estar entre 0 e ${MAX_RECORD_HOURS}, e os minutos entre 0 e 59.`);
  }
  const totalLdcMinutes = ldcHours * 60 + ldcMinutesPart;

  const publications = Math.round(Number(input.publications ?? 0));
  const studies = Math.round(Number(input.studies ?? 0));
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0 || totalMinutes > MAX_RECORD_HOURS * 60) {
    throw new Error(`As horas devem estar entre 0 e ${MAX_RECORD_HOURS} por registro.`);
  }
  if (!Number.isFinite(publications) || !Number.isFinite(studies) || publications < 0 || publications > 9999 || studies < 0 || studies > 9999) {
    throw new Error("Publicações e estudos devem estar entre 0 e 9.999.");
  }

  const rawStudyIds = input.studyIds ?? [];
  if (!Array.isArray(rawStudyIds)) throw new Error("Selecione estudantes válidos para este registro.");
  const studyIds = [...new Set(rawStudyIds.map(Number))];
  if (studyIds.length > 100 || studyIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("Selecione até 100 estudantes válidos para este registro.");
  }

  return {
    date: input.date,
    weekday: WEEKDAYS[parsedDate.getUTCDay()],
    minutes: totalMinutes,
    ldcMinutes: totalLdcMinutes,
    publications,
    studies,
    studyIds,
    notes: String(input.notes ?? "").trim().slice(0, 1000),
    month,
    year,
    updatedAt: new Date(),
  };
}

export function formatRecord<T extends { createdAt: Date; updatedAt: Date }>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
