import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hashPassword, normalizeEmail, toSafeUser, verifyPassword, validPassword } from "../lib/auth";
import { databaseErrorMessage, isSameOriginRequest } from "../lib/http";
import { containsEmoji } from "../lib/pdf-emoji";
import { parseRecordInput, validateDurationFields } from "../lib/records";
import { annualProjection, recordTotalMinutes, roundReportMinutes, studyIsActiveInMonth } from "../lib/reporting";
import { addDays, nextMeetingAfterEvent, parseStudyEventInput } from "../lib/study-events";
import { daysSinceDate, parseStudyInput, studyNeedsAttention, studyScheduleLabel } from "../lib/studies";
import { parseStoredTimer, timerElapsed, timerMinutes } from "../lib/timer";
import { createTrialEmail, createTrialExpiration, createTrialPassword, isTrialExpired, TRIAL_DURATION_MS, userHasAccess } from "../lib/trial-accounts";

test("protege e verifica senhas sem armazenar o texto original", async () => {
  const result = await hashPassword("Tempo2026");
  assert.notEqual(result.hash, "Tempo2026");
  assert.equal(result.salt.length, 32);
  assert.equal(await verifyPassword("Tempo2026", result.hash, result.salt), true);
  assert.equal(await verifyPassword("senha-errada", result.hash, result.salt), false);
});

test("exige senha com oito caracteres, letras e números", () => {
  assert.equal(validPassword("curta1"), false);
  assert.equal(validPassword("apenasletras"), false);
  assert.equal(validPassword("Segura123"), true);
  assert.equal(validPassword(`A1${"x".repeat(255)}`), false);
});

test("converte horas em minutos e calcula o período", () => {
  const result = parseRecordInput({ date: "2026-08-07", hours: 2, minutes: 30, publications: 3, studies: 1 });
  assert.equal(result.minutes, 150);
  assert.equal(result.month, 8);
  assert.equal(result.year, 2026);
  assert.equal(result.weekday, "Sexta-feira");
});

test("aceita campos separados e mantém compatibilidade com horas decimais antigas", () => {
  assert.equal(parseRecordInput({ date: "2026-08-07", hours: 1, minutes: 45 }).minutes, 105);
  assert.equal(parseRecordInput({ date: "2026-08-07", hours: 1.5 }).minutes, 90);
  assert.equal(parseRecordInput({ date: "2026-08-07", minutes: 75 }).minutes, 75);
  assert.throws(() => parseRecordInput({ date: "2026-08-07", hours: 1, minutes: 60 }), /minutos entre 0 e 59/);
  assert.equal(parseRecordInput({ date: "2026-08-07", hours: 24, minutes: 1 }).minutes, 1441);
  assert.equal(parseRecordInput({ date: "2026-08-07", hours: 199, minutes: 59 }).minutes, 11999);
  assert.throws(() => parseRecordInput({ date: "2026-08-07", hours: 200, minutes: 1 }), /entre 0 e 200/);
});

test("login aceita e-mail sem diferenciar maiúsculas e não bloqueia senhas antigas na tela", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  const currentUserRoute = readFileSync(new URL("../app/api/auth/me/route.ts", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.equal(normalizeEmail("  Pessoa@Exemplo.COM "), "pessoa@exemplo.com");
  assert.match(route, /lower\(trim\(/);
  assert.doesNotMatch(route, /users\.role/);
  assert.match(route, /Cache-Control/);
  assert.match(currentUserRoute, /Cache-Control/);
  assert.match(component, /minLength=\{mode === "login" \? undefined : 8\}/);
  assert.match(component, /Mostrar senha/);
  assert.match(serviceWorker, /!url\.searchParams\.has\("reset"\)/);
});

test("aceita até 200 horas e bloqueia valores maiores", () => {
  assert.equal(parseRecordInput({ date: "2026-08-07", hours: 200 }).minutes, 12000);
  assert.throws(() => parseRecordInput({ date: "2026-08-07", hours: 201 }), /entre 0 e 200/);
  assert.throws(() => parseRecordInput({ date: "1999-12-31", hours: 1 }), /data válida/);
  assert.throws(() => parseRecordInput({ date: "2201-01-01", hours: 1 }), /data válida/);
});

test("não bloqueia silenciosamente o salvamento quando serviço e LDC são válidos", () => {
  assert.deepEqual(validateDurationFields("2", "30"), {});
  assert.deepEqual(validateDurationFields("0", "0"), {});
  assert.deepEqual(validateDurationFields("200", "1"), { minutes: "Com 200 horas, os minutos precisam ser zero." });
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  assert.match(component, /if \(ldcErrors\.hours\) errors\.ldcHours = ldcErrors\.hours/);
  assert.match(component, /if \(ldcErrors\.minutes\) errors\.ldcMinutes = ldcErrors\.minutes/);
  assert.match(component, /Object\.values\(errors\)\.some\(Boolean\)/);
  assert.doesNotMatch(component, /errors\.ldcHours = ldcErrors\.hours;\s*errors\.ldcMinutes = ldcErrors\.minutes/);
});

test("separa horas de serviço e LDC sem perder a compatibilidade", () => {
  const result = parseRecordInput({ date: "2026-08-09", hours: 2, minutes: 20, ldcHours: 1, ldcMinutes: 15 });
  assert.equal(result.minutes, 140);
  assert.equal(result.ldcMinutes, 75);
  assert.equal(recordTotalMinutes(result), 215);
  assert.throws(() => parseRecordInput({ date: "2026-08-09", hours: 1, minutes: 0, ldcHours: 0, ldcMinutes: 60 }), /horas LDC/);
});

test("normaliza a seleção de estudantes vinculada ao registro", () => {
  const result = parseRecordInput({ date: "2026-08-09", hours: 1, minutes: 0, studyIds: [3, 2, 3] });
  assert.deepEqual(result.studyIds, [3, 2]);
  assert.throws(() => parseRecordInput({ date: "2026-08-09", hours: 1, studyIds: [0] }), /estudantes válidos/);
});

test("aplica arredondamento somente ao total do relatório", () => {
  assert.equal(roundReportMinutes(149, "none"), 149);
  assert.equal(roundReportMinutes(149, "nearest"), 120);
  assert.equal(roundReportMinutes(151, "nearest"), 180);
  assert.equal(roundReportMinutes(121, "up"), 180);
  assert.equal(roundReportMinutes(179, "down"), 120);
});

test("calcula projeção anual e estudos únicos ativos no período", () => {
  assert.equal(annualProjection(300 * 60, 6), 600 * 60);
  assert.equal(studyIsActiveInMonth({ startedOn: "2026-07-20", endedOn: null }, 2026, 8), true);
  assert.equal(studyIsActiveInMonth({ startedOn: "2026-07-20", endedOn: "2026-07-31" }, 2026, 8), false);
  assert.equal(studyIsActiveInMonth({ startedOn: "2026-08-31", endedOn: "2026-09-02" }, 2026, 8), true);
});

test("valida o cadastro individual de estudos", () => {
  const study = parseStudyInput({ name: "  Estudo 01 ", startedOn: "2026-08-09", preferredDays: ["monday", "wednesday"], preferredTime: "19:30", address: "  Rua das Flores, 10  ", remindersEnabled: true, nextMeetingOn: "2026-08-12", recurrence: "weekly", staleAfterDays: 10, notes: "  acompanhamento  " });
  assert.equal(study.name, "Estudo 01");
  assert.equal(study.active, true);
  assert.deepEqual(study.preferredDays, ["monday", "wednesday"]);
  assert.equal(study.preferredTime, "19:30");
  assert.equal(study.address, "Rua das Flores, 10");
  assert.equal(study.remindersEnabled, true);
  assert.equal(study.nextMeetingOn, "2026-08-12");
  assert.equal(study.recurrence, "weekly");
  assert.equal(study.staleAfterDays, 10);
  assert.equal(studyScheduleLabel(study), "Seg, Qua · às 19:30");
  assert.equal(study.notes, "acompanhamento");
  assert.throws(() => parseStudyInput({ name: "A", startedOn: "2026-08-09" }), /nome/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-10", active: false, endedOn: "2026-08-09" }), /anterior/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-09", preferredTime: "25:90" }), /horário/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-09", preferredDays: ["feriado"] }), /dias válidos/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-09", recurrence: "monthly" as "weekly" }), /recorrência/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-09", staleAfterDays: 0 }), /inatividade/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-09", remindersEnabled: true, preferredDays: ["monday"] }), /horário preferido/);
  assert.throws(() => parseStudyInput({ name: "Estudo", startedOn: "2026-08-09", remindersEnabled: true, preferredTime: "19:00" }), /próximo encontro|dia preferido/);
});

test("registra presença, falta, reagendamento e progresso do estudante", () => {
  const presence = parseStudyEventInput({ eventDate: "2026-08-09", eventTime: "19:30", status: "present", subject: "Capítulo 4", progress: 35, notes: "Boa participação" });
  assert.equal(presence.subject, "Capítulo 4");
  assert.equal(presence.progress, 35);
  assert.equal(presence.rescheduledTo, null);

  const absence = parseStudyEventInput({ eventDate: "2026-08-10", status: "absent", progress: 35 });
  assert.equal(absence.status, "absent");
  assert.equal(absence.subject, "");

  const rescheduled = parseStudyEventInput({ eventDate: "2026-08-11", status: "rescheduled", rescheduledTo: "2026-08-13", rescheduledTime: "20:00" });
  assert.equal(rescheduled.rescheduledTo, "2026-08-13");
  assert.throws(() => parseStudyEventInput({ eventDate: "2026-08-11", status: "rescheduled" }), /nova data/);
  assert.throws(() => parseStudyEventInput({ eventDate: "2026-08-11", status: "rescheduled", rescheduledTo: "2026-08-10" }), /posterior/);
  assert.throws(() => parseStudyEventInput({ eventDate: "2026-08-11", status: "present", subject: "A", progress: 101 }), /progresso/);
});

test("mantém recorrência semanal sem regredir a agenda ao editar um histórico antigo", () => {
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(nextMeetingAfterEvent(
    { recurrence: "weekly", nextMeetingOn: "2026-08-30" },
    { eventDate: "2026-08-01", status: "present" },
  ), "2026-08-30");
  assert.equal(nextMeetingAfterEvent(
    { recurrence: "weekly", nextMeetingOn: "2026-08-09" },
    { eventDate: "2026-08-09", status: "present" },
  ), "2026-08-16");
  assert.equal(nextMeetingAfterEvent(
    { recurrence: "weekly", nextMeetingOn: "2026-08-09" },
    { eventDate: "2026-08-09", status: "rescheduled", rescheduledTo: "2026-08-12" },
  ), "2026-08-12");
});

test("identifica estudantes há muitos dias sem acompanhamento", () => {
  const reference = new Date(2026, 7, 15, 12);
  assert.equal(daysSinceDate("2026-08-01", reference), 14);
  assert.equal(studyNeedsAttention({ active: true, startedOn: "2026-08-01", lastContactOn: null, staleAfterDays: 14 }, reference), true);
  assert.equal(studyNeedsAttention({ active: true, startedOn: "2026-08-01", lastContactOn: "2026-08-10", staleAfterDays: 14 }, reference), false);
  assert.equal(studyNeedsAttention({ active: false, startedOn: "2026-01-01", lastContactOn: null, staleAfterDays: 1 }, reference), false);
});

test("traduz falhas de conexão e de estrutura do banco em mensagens úteis", () => {
  assert.match(databaseErrorMessage(new Error("DATABASE_URL não configurada.")), /não está conectado/);
  assert.match(databaseErrorMessage(new Error('relation "records" does not exist')), /precisa ser atualizado/);
  assert.match(databaseErrorMessage(new Error("TypeError: fetch failed")), /Não foi possível conectar/);
  assert.equal(databaseErrorMessage(new Error("erro desconhecido"), "Falha ao salvar."), "Falha ao salvar.");
});

test("verifica o banco de verdade e impede sobrescrita silenciosa quando a data já existe", () => {
  const health = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  const recordsRoute = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  const recordRoute = readFileSync(new URL("../app/api/records/[id]/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0003_records_reliability.sql", import.meta.url), "utf8");
  const studentsMigration = readFileSync(new URL("../drizzle/0005_record_students.sql", import.meta.url), "utf8");
  const scheduleMigration = readFileSync(new URL("../drizzle/0006_study_schedule.sql", import.meta.url), "utf8");
  const followupMigration = readFileSync(new URL("../drizzle/0007_student_followup.sql", import.meta.url), "utf8");
  assert.match(health, /database: "connected"/);
  assert.match(health, /to_regclass\('public\.records'\)/);
  assert.match(recordsRoute, /onConflictDoNothing/);
  assert.match(recordsRoute, /conflict: true/);
  assert.match(recordsRoute, /created/);
  assert.match(recordsRoute, /databaseErrorResponse/);
  assert.match(recordRoute, /databaseErrorResponse/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "records"/);
  assert.match(migration, /records_user_period_idx/);
  assert.match(studentsMigration, /study_ids/);
  assert.match(studentsMigration, /study_names/);
  assert.match(scheduleMigration, /preferred_days/);
  assert.match(scheduleMigration, /preferred_time/);
  assert.match(scheduleMigration, /address/);
  assert.match(followupMigration, /next_meeting_on/);
  assert.match(followupMigration, /CREATE TABLE IF NOT EXISTS "study_events"/);
  assert.match(followupMigration, /study_events_user_study_date_idx/);
  assert.match(health, /to_regclass\('public\.study_events'\)/);
});

test("oferece ficha completa, histórico e lembretes individuais por estudante", () => {
  const profile = readFileSync(new URL("../components/student-profile.tsx", import.meta.url), "utf8");
  const studiesModal = readFileSync(new URL("../components/studies-modal.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const historyRoute = readFileSync(new URL("../app/api/studies/[id]/history/route.ts", import.meta.url), "utf8");
  const eventRoute = readFileSync(new URL("../app/api/study-events/[id]/route.ts", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  for (const content of ["Ficha individual do estudante", "Histórico de acompanhamento", "Presença", "Falta", "Reagendado", "Assunto estudado", "Percentual exato"]) {
    assert.match(profile, new RegExp(content));
  }
  assert.match(studiesModal, /Próximo encontro/);
  assert.match(studiesModal, /Lembrete individual/);
  assert.match(studiesModal, /Alertar depois de quantos dias/);
  assert.match(styles, /\.study-form input\[type="time"\]/);
  assert.match(styles, /::-webkit-calendar-picker-indicator/);
  assert.match(styles, /\.study-form-row > \* \{ min-width: 0; \}/);
  assert.match(historyRoute, /export async function GET/);
  assert.match(historyRoute, /export async function POST/);
  assert.match(eventRoute, /export async function PATCH/);
  assert.match(eventRoute, /export async function DELETE/);
  assert.match(serviceWorker, /HORA_STUDY_SCHEDULES/);
  assert.match(serviceWorker, /hora-a-hora-study-reminders/);
});

test("registro rápido limpa zeros, normaliza campos vazios e aguarda o salvamento", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /clearInitialZero/);
  assert.match(component, /hours\.trim\(\) \|\| "0"/);
  assert.match(component, /await onSave\(\{/);
  assert.match(component, /quickTotalMinutes/);
  assert.match(component, /quick-mode-selector/);
  assert.match(component, /Somar novo tempo/);
  assert.match(component, /draft-discard-btn/);
  assert.match(component, /credentials: options\?\.credentials \?\? "same-origin"/);
  assert.match(styles, /\.quick-duration-card\.ldc-card/);
  assert.match(styles, /\.quick-duration-grid/);
  assert.match(styles, /\.quick-mode-selector/);
});

test("mantém a gravação confirmada visível mesmo se o cache local falhar", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  assert.match(component, /A resposta do POST\/PUT é a confirmação do banco/);
  assert.match(component, /offlineCacheSet\(currentKey, currentData\.records\)\.catch/);
  assert.match(component, /sameVisiblePeriod \? mergeSaved\(current\) : \[result\.record\]/);
});

test("trata falhas do banco nas rotas autenticadas sem deixar respostas quebradas", () => {
  const routes = [
    "../app/api/account/route.ts",
    "../app/api/admin/users/route.ts",
    "../app/api/admin/users/[id]/route.ts",
    "../app/api/admin/trial-users/route.ts",
    "../app/api/auth/login/route.ts",
    "../app/api/auth/logout/route.ts",
    "../app/api/auth/me/route.ts",
    "../app/api/auth/register/route.ts",
    "../app/api/auth/reset/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /databaseErrorResponse/, route);
  }
  const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /finally \{\s*await clearSessionCookie\(\)/);
});

test("oferece os sete temas e salva a preferência visual", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const theme of ["blue", "pink", "green", "lilac", "yellow", "dark", "white"]) {
    assert.match(component, new RegExp(`id: \\"${theme}\\"`));
    if (theme !== "blue") assert.match(styles, new RegExp(`data-theme=\\"${theme}\\"`));
  }
  assert.match(component, /hora-a-hora-theme/);
});

test("oferece backup em JSON, novos temas e menu lateral drawer no celular", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const theme of ["emerald", "sunset", "midnight", "lavender"]) {
    assert.match(component, new RegExp(`id: \\"${theme}\\"`));
    assert.match(styles, new RegExp(`data-theme=\\"${theme}\\"`));
  }
  assert.match(component, /downloadBackup/);
  assert.match(component, /importBackupFile/);
  assert.match(component, /mobile-drawer/);
  assert.match(styles, /\.mobile-drawer/);
  assert.match(styles, /\.drawer-backdrop/);
});

test("calcula ritmo diário, celebra metas com confetes, oferece modo foco no cronômetro e marcador de lição", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../components/timer-card.tsx", import.meta.url), "utf8");
  const studiesModal = readFileSync(new URL("../components/studies-modal.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../components/student-profile.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const studiesLib = readFileSync(new URL("../lib/studies.ts", import.meta.url), "utf8");

  // Ritmo Diário
  assert.match(component, /pace-card/);
  assert.match(component, /paceData/);
  assert.match(styles, /\.pace-card/);

  // Celebração de Metas
  assert.match(component, /milestone-banner/);
  assert.match(styles, /\.milestone-banner/);
  assert.match(styles, /\.milestone-50/);
  assert.match(styles, /\.milestone-75/);
  assert.match(styles, /\.milestone-100/);

  // Modo Foco no Cronômetro
  assert.match(timer, /timer-focus-overlay/);
  assert.match(timer, /timer-expand-button/);
  assert.match(timer, /wakeLock/);
  assert.match(styles, /\.timer-focus-overlay/);
  assert.match(styles, /\.timer-focus-display/);

  // Marcador de Lição
  assert.match(studiesModal, /currentSubject/);
  assert.match(studiesModal, /Lição ou Capítulo/);
  assert.match(profile, /Lição \/ Progresso/);
  assert.match(studiesLib, /currentSubject/);
});

test("usa cartões no mobile e impede que o painel ultrapasse a tela", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const history = readFileSync(new URL("../components/history-panel.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(history, /history-mobile-list/);
  assert.match(component, /admin-mobile-list/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /max-width: 100vw/);
  assert.match(styles, /\.history-table-wrap \{ display: none; \}/);
});

test("limita o painel administrativo aos dados essenciais de cada conta", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const listRoute = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");
  const userRoute = readFileSync(new URL("../app/api/admin/users/[id]/route.ts", import.meta.url), "utf8");
  assert.match(component, /<th>Usuário<\/th><th>Tipo<\/th>/);
  assert.match(component, /accountTypeLabel/);
  assert.match(component, /Criado em/);
  assert.match(component, /Último acesso/);
  assert.match(component, /lastAccessAt/);
  assert.match(component, /user-cell-copy/);
  assert.match(listRoute, /createdAt/);
  assert.match(listRoute, /lastAccessAt/);
  assert.doesNotMatch(component, /Ficha do usuário|Ver detalhes|Ver ficha completa|Histórico mensal/);
  assert.doesNotMatch(listRoute, /recordCount|goalHours|passwordHash|passwordSalt|records\./);
  assert.doesNotMatch(userRoute, /export async function GET|totalMinutes|activeSessions|recentRecords|goalHours/);
});

test("registra e exibe o último acesso dos usuários", () => {
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0008_last_access.sql", import.meta.url), "utf8");
  const login = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  const session = readFileSync(new URL("../app/api/auth/me/route.ts", import.meta.url), "utf8");
  const registration = readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  assert.match(schema, /lastAccessAt: timestamp\("last_access_at"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "last_access_at"/);
  assert.match(login, /lastAccessAt: now/);
  assert.match(session, /markUserAccess\(user\.id\)/);
  assert.match(registration, /lastAccessAt: now/);
  assert.match(admin, /lastAccessAt: user\.lastAccessAt\?\.toISOString\(\) \?\? null/);
  assert.match(component, /Último acesso: ainda não entrou/);
  assert.match(component, /lastAccessLabel\(target\.lastAccessAt\)/);
  assert.match(component, /dateTime\(value\)/);
});

test("inclui calendário, registro rápido e comparação com o mês anterior", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  assert.match(component, /calendar-panel/);
  assert.match(component, /Registro rápido/);
  assert.match(component, /previousRecords/);
  assert.match(component, /Comparação entre meses/);
  assert.match(component, /Preenchido/);
  assert.match(component, /Pendente/);
  assert.match(component, /Sem horas/);
});

test("oferece registro diário destacado e experiência móvel completa", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const text of ["Registrar hoje", "+15 min", "+30 min", "+45 min", "+1 hora", "Início", "Histórico", "Registrar", "Estudantes", "Relatórios"]) {
    assert.match(component, new RegExp(text.replace("+", "\\+")));
  }
  assert.match(component, /Bom dia/);
  assert.match(component, /Boa tarde/);
  assert.match(component, /Boa noite/);
  assert.match(component, /mobile-bottom-nav/);
  assert.match(component, /bottom-register/);
  assert.match(component, /Registro salvo com sucesso/);
  assert.match(component, /header-avatar/);
  assert.ok(component.indexOf("header-avatar") < component.indexOf("<ThemePicker"));
  assert.match(component, /field-error/);
  assert.match(styles, /@keyframes grow-bar/);
  assert.match(styles, /@keyframes modal-in/);
  assert.match(styles, /\.mobile-bottom-nav \{/);
});

test("mostra erros de cadastro no campo correto", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const registration = readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
  assert.match(component, /A senha precisa conter letras e números/);
  assert.match(component, /aria-invalid/);
  assert.match(component, /role="alert"/);
  assert.match(component, /noValidate/);
  assert.match(registration, /Este e-mail já está cadastrado/);
});

test("preserva rascunho, oferece tour e preferências de acessibilidade", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /hora-a-hora-draft/);
  assert.match(component, /Rascunho recuperado/);
  assert.match(component, /Tour rápido/);
  assert.match(component, /Texto maior/);
  assert.match(component, /Contraste extra/);
  assert.match(styles, /data-font-size="large"/);
  assert.match(styles, /data-contrast="high"/);
});

test("configura lembretes opcionais no app instalado", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(component, /Notification\.requestPermission/);
  assert.match(component, /periodicSync\.register/);
  assert.match(serviceWorker, /periodicsync/);
  assert.match(serviceWorker, /hora-a-hora-reminder/);
  assert.match(serviceWorker, /notificationclick/);
});

test("inclui cronômetro persistente, compartilhamento e fila offline", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../components/timer-card.tsx", import.meta.url), "utf8");
  const offline = readFileSync(new URL("../lib/offline-store.ts", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(timer, /hora-a-hora-timer/);
  assert.match(timer, /startedAt/);
  assert.match(component, /navigator\.share/);
  assert.match(component, /wa\.me/);
  assert.match(component, /syncOfflineMutations/);
  assert.match(offline, /indexedDB\.open/);
  assert.match(offline, /outbox/);
  assert.match(serviceWorker, /Scripts, estilos, fontes e imagens/);
});

test("cronômetro inicia sem depender de notificações e recupera seu estado com segurança", () => {
  const timer = readFileSync(new URL("../components/timer-card.tsx", import.meta.url), "utf8");
  const started = parseStoredTimer(JSON.stringify({
    category: "service",
    running: true,
    startedAt: 1_000,
    accumulatedMs: 30_000,
  }), 61_000);
  assert.equal(timerElapsed(started, 61_000), 90_000);
  assert.equal(timerMinutes(89_999), 1);
  assert.equal(timerMinutes(90_000), 2);
  assert.deepEqual(parseStoredTimer("conteúdo inválido", 10_000), {
    category: "service",
    running: false,
    startedAt: null,
    accumulatedMs: 0,
  });
  assert.doesNotMatch(timer, /startOrResume[\s\S]{0,350}await Notification\.requestPermission/);
  assert.match(timer, /Ativar notificações/);
  assert.match(timer, /disabled=\{!hydrated \|\| finishing\}/);
});

test("oferece meta anual, horas LDC e contagem individual de estudos", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0004_professional_features.sql", import.meta.url), "utf8");
  const studiesRoute = readFileSync(new URL("../app/api/studies/route.ts", import.meta.url), "utf8");
  const studiesModal = readFileSync(new URL("../components/studies-modal.tsx", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../lib/pdf-report.ts", import.meta.url), "utf8");
  assert.match(component, /AnnualPanel/);
  assert.match(component, /Meta anual/);
  assert.match(component, /Tempo LDC/);
  assert.match(schema, /annual_goal_hours/);
  assert.match(schema, /studies_registry/);
  assert.match(migration, /ldc_minutes/);
  assert.match(studiesRoute, /export async function POST/);
  assert.match(studiesModal, /Horário preferido/);
  assert.match(studiesModal, /Dias preferidos/);
  assert.match(studiesModal, /Endereço/);
  assert.match(pdf, /Agenda dos estudantes acompanhados/);
});

test("reconhece emojis que precisam ser incorporados ao PDF", () => {
  assert.equal(containsEmoji("Ótimo dia 😊"), true);
  assert.equal(containsEmoji("Família 👨‍👩‍👧‍👦"), true);
  assert.equal(containsEmoji("Meta concluída ✅"), true);
  assert.equal(containsEmoji("Anotação com acentos, sem emoji"), false);
});

test("limita cada conta de teste a exatamente 24 horas", () => {
  const start = new Date("2026-08-07T12:00:00.000Z");
  const expiresAt = createTrialExpiration(start);
  assert.equal(expiresAt.getTime() - start.getTime(), TRIAL_DURATION_MS);
  assert.equal(isTrialExpired(expiresAt, new Date("2026-08-08T11:59:59.999Z")), false);
  assert.equal(isTrialExpired(expiresAt, new Date("2026-08-08T12:00:00.000Z")), true);
  assert.equal(userHasAccess({ active: true, trialExpiresAt: expiresAt }, start), true);
  assert.equal(userHasAccess({ active: true, trialExpiresAt: expiresAt }, expiresAt), false);
});

test("gera credenciais curtas e válidas para a conta de teste", () => {
  const email = createTrialEmail();
  const password = createTrialPassword();
  assert.match(email, /^t[a-z2-9]{6}@h\.local$/);
  assert.equal(email.length, 15);
  assert.equal(password.length, 8);
  assert.match(password, /[A-Za-z]/);
  assert.match(password, /\d/);
  assert.equal(validPassword(password), true);
});

test("painel administrativo cria e identifica contas de teste", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/trial-users/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0001_trial_accounts.sql", import.meta.url), "utf8");
  assert.match(component, /Criar conta de teste/);
  assert.match(component, /Copiar dados de acesso/);
  assert.match(route, /createTrialExpiration/);
  assert.match(route, /current\.canCreateTrials/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /trialCreatedByEmail/);
  assert.match(route, /Cache-Control/);
  assert.match(migration, /trial_expires_at/);
});

test("permite que qualquer novo usuário crie uma conta pela tela de login", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const registration = readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
  assert.match(component, /Ainda não tem conta\?/);
  assert.match(component, />Criar conta<\/button>/);
  assert.doesNotMatch(component, /Acesso privado|Solicite uma conta de teste/);
  assert.doesNotMatch(page, /registrationEnabled|publicRegistrationEnabled/);
  assert.doesNotMatch(registration, /cadastro público está fechado|publicRegistrationEnabled/);
  assert.match(registration, /lower\(trim\(/);
  assert.match(registration, /prepareSession/);
  assert.match(registration, /Cache-Control/);
  assert.match(registration, /ALLOW_ADMIN_SELF_REGISTRATION|adminSelfRegistrationEnabled/);
});

test("aceita ações protegidas somente quando a origem coincide com o site", () => {
  assert.equal(isSameOriginRequest(new Request("https://app.exemplo.com/api/admin/trial-users", {
    headers: { origin: "https://app.exemplo.com" },
  })), true);
  assert.equal(isSameOriginRequest(new Request("https://app.exemplo.com/api/admin/trial-users", {
    headers: { origin: "https://site-malicioso.example" },
  })), false);
  assert.equal(isSameOriginRequest(new Request("https://app.exemplo.com/api/admin/trial-users")), false);
});

test("uma conta de teste nunca recebe privilégios administrativos", () => {
  const previousAdmins = process.env.ADMIN_EMAILS;
  const previousCreators = process.env.TRIAL_CREATOR_EMAILS;
  process.env.ADMIN_EMAILS = "dono@exemplo.com";
  process.env.TRIAL_CREATOR_EMAILS = "dono@exemplo.com";
  try {
    const safe = toSafeUser({
      id: 99,
      name: "Teste",
      email: "dono@exemplo.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      goalHours: 50,
      annualGoalHours: 600,
      roundingMode: "none",
      role: "admin",
      active: true,
      trialExpiresAt: new Date(Date.now() + 60_000),
      trialCreatedByEmail: "dono@exemplo.com",
      trialCreationRequestId: "request_1234567890",
      lastAccessAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(safe.role, "user");
    assert.equal(safe.canCreateTrials, false);
  } finally {
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
    if (previousCreators === undefined) delete process.env.TRIAL_CREATOR_EMAILS;
    else process.env.TRIAL_CREATOR_EMAILS = previousCreators;
  }
});

test("preserva conflitos offline, aplica cronômetro atomicamente e limpa dados privados", () => {
  const offline = readFileSync(new URL("../lib/offline-store.ts", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../app/api/records/timer/route.ts", import.meta.url), "utf8");
  const recordUpdate = readFileSync(new URL("../app/api/records/[id]/route.ts", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(offline, /syncStatus = "auth-required"/);
  assert.match(offline, /saveIssue\(db, mutation/);
  assert.match(offline, /previous\.entityKey === mutation\.entityKey/);
  assert.match(timer, /setWhere:/);
  assert.match(timer, /currentColumn} \+ \$\{addedMinutes\}/);
  assert.match(recordUpdate, /expectedUpdatedAt/);
  assert.match(recordUpdate, /conflict: true/);
  assert.match(serviceWorker, /HORA_CLEAR_PRIVATE_DATA/);
  assert.match(serviceWorker, /latest=1&through=/);
  assert.match(serviceWorker, /existing\.navigate\(`\/\?timerAction=/);
  assert.match(offline, /Timer mutations are additive/);
});

test("organiza o histórico, separa as áreas e permite desfazer exclusões", () => {
  const component = readFileSync(new URL("../components/hora-app.tsx", import.meta.url), "utf8");
  const history = readFileSync(new URL("../components/history-panel.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../components/student-profile.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const area of ['"home"', '"history"', '"studies"', '"reports"']) assert.match(component, new RegExp(area));
  for (const feature of ["Buscar em anotações", "Sincronização", "Mais recentes", "Exportar resultado", "Carregar mais 25"]) assert.match(history, new RegExp(feature));
  assert.match(history, /<details className="history-filters-panel panel">/);
  assert.match(history, /filtros ativos/);
  assert.match(component, /label: "Desfazer"/);
  assert.match(component, /restoreDeletedRecord/);
  assert.match(profile, /eventStatusFilter/);
  assert.match(profile, /eventYearFilter/);
  assert.match(profile, /progressChanges/);
  assert.match(styles, /\.timer-card\.running/);
  assert.match(styles, /\.workspace-nav button\.active/);
});
