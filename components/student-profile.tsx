"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, BookOpen, CalendarDays, Check, Clock3, Edit3, MapPin, Plus, RefreshCw, Save, Search, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import type { StudyEntry } from "@/components/studies-modal";
import { daysSinceDate, studyNeedsAttention, studyScheduleLabel } from "@/lib/studies";
import { offlineCacheGet, offlineCacheSet } from "@/lib/offline-store";

type StudyEventStatus = "present" | "absent" | "rescheduled";
type StudyEvent = {
  id: number;
  eventDate: string;
  eventTime: string;
  status: StudyEventStatus;
  subject: string;
  progress: number;
  notes: string;
  rescheduledTo: string | null;
  rescheduledTime: string;
  createdAt: string;
  updatedAt: string;
};
type RelatedRecord = {
  id: number;
  date: string;
  weekday: string;
  minutes: number;
  ldcMinutes: number;
  notes: string;
};
type ProfileData = { study: StudyEntry; events: StudyEvent[]; records: RelatedRecord[] };
type EventDraft = {
  eventDate: string;
  eventTime: string;
  status: StudyEventStatus;
  subject: string;
  progress: string;
  notes: string;
  rescheduledTo: string;
  rescheduledTime: string;
};

function localToday() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function dateBR(value?: string | null) {
  if (!value) return "Não definido";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function hoursLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}min` : `${hours}h`;
}

function emptyDraft(study: StudyEntry): EventDraft {
  return {
    eventDate: study.nextMeetingOn || localToday(),
    eventTime: study.preferredTime || "",
    status: "present",
    subject: study.currentSubject || "",
    progress: String(study.progress ?? 0),
    notes: "",
    rescheduledTo: study.nextMeetingOn || "",
    rescheduledTime: study.preferredTime || "",
  };
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir esta ação.");
  return data as T;
}

const STATUS = {
  present: { label: "Presença", className: "present" },
  absent: { label: "Falta", className: "absent" },
  rescheduled: { label: "Reagendado", className: "rescheduled" },
} as const;

export function StudentProfile({ studyId }: { studyId: number }) {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudyEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [eventStatusFilter, setEventStatusFilter] = useState<"all" | StudyEventStatus>("all");
  const [eventYearFilter, setEventYearFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<ProfileData>(`/api/studies/${studyId}/history`);
      setData(result);
      setOfflineMode(false);
      const cachedUser = window.localStorage.getItem("hora-a-hora-last-user");
      const userId = cachedUser ? Number((JSON.parse(cachedUser) as { id?: number }).id) : 0;
      if (userId > 0) void offlineCacheSet(`user-${userId}-study-profile-${studyId}`, result).catch(() => undefined);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível carregar esta ficha.";
      if (/login/i.test(text)) {
        router.push("/");
      } else {
        try {
          const cachedUser = window.localStorage.getItem("hora-a-hora-last-user");
          const parsed = cachedUser ? JSON.parse(cachedUser) as { id?: number; sessionExpiresAt?: string | null; trialExpiresAt?: string | null } : null;
          const validSession = Boolean(parsed?.id && parsed.sessionExpiresAt && new Date(parsed.sessionExpiresAt).getTime() > Date.now() && !parsed.trialExpiresAt);
          const cached = validSession ? await offlineCacheGet<ProfileData>(`user-${parsed?.id}-study-profile-${studyId}`) : null;
          if (cached) {
            setData(cached);
            setOfflineMode(true);
            setMessage("Modo offline: exibindo a última ficha salva neste aparelho.");
          } else setMessage(text);
        } catch {
          setMessage(text);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [router, studyId]);

  useEffect(() => {
    // A primeira leitura da ficha acontece assim que a rota individual é aberta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const events = data?.events ?? [];
    return {
      present: events.filter((event) => event.status === "present").length,
      absent: events.filter((event) => event.status === "absent").length,
      rescheduled: events.filter((event) => event.status === "rescheduled").length,
      minutes: (data?.records ?? []).reduce((sum, record) => sum + record.minutes + record.ldcMinutes, 0),
    };
  }, [data]);

  const eventYears = useMemo(() => [...new Set((data?.events ?? []).map((event) => event.eventDate.slice(0, 4)))].sort((a, b) => b.localeCompare(a)), [data?.events]);
  const filteredEvents = useMemo(() => (data?.events ?? []).filter((event) =>
    (eventStatusFilter === "all" || event.status === eventStatusFilter)
    && (eventYearFilter === "all" || event.eventDate.startsWith(eventYearFilter))), [data?.events, eventStatusFilter, eventYearFilter]);
  const progressChanges = useMemo(() => {
    const changes = new Map<number, number>();
    let previous = 0;
    for (const event of [...(data?.events ?? [])].reverse()) {
      if (event.status !== "present") continue;
      changes.set(event.id, event.progress - previous);
      previous = event.progress;
    }
    return changes;
  }, [data?.events]);

  function openNewEvent() {
    if (!data) return;
    if (offlineMode) {
      setMessage("Conecte-se à internet para registrar ou alterar encontros.");
      return;
    }
    setEditing(null);
    setDraft(emptyDraft(data.study));
    setFormOpen(true);
  }

  function openEdit(event: StudyEvent) {
    if (offlineMode) {
      setMessage("Conecte-se à internet para registrar ou alterar encontros.");
      return;
    }
    setEditing(event);
    setDraft({
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      status: event.status,
      subject: event.subject,
      progress: String(event.progress),
      notes: event.notes,
      rescheduledTo: event.rescheduledTo ?? "",
      rescheduledTime: event.rescheduledTime,
    });
    setFormOpen(true);
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const url = editing ? `/api/study-events/${editing.id}` : `/api/studies/${studyId}/history`;
      await api(url, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...draft, progress: Number(draft.progress) }) });
      setFormOpen(false);
      setEditing(null);
      setDraft(null);
      await load();
      setMessage(editing ? "Encontro atualizado." : "Encontro registrado com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o encontro.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(event: StudyEvent) {
    if (offlineMode) {
      setMessage("Conecte-se à internet para excluir encontros.");
      return;
    }
    if (!window.confirm("Excluir este item do histórico?")) return;
    setBusy(true);
    try {
      await api(`/api/study-events/${event.id}`, { method: "DELETE" });
      await load();
      setMessage("Item removido do histórico.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="student-profile-loading"><RefreshCw className="spin" size={29} /><p>Carregando ficha do estudante…</p></main>;
  if (!data) return <main className="student-profile-loading"><TriangleAlert size={30} /><p>{message || "Estudante não encontrado."}</p><Link href="/"><ArrowLeft size={17} /> Voltar ao painel</Link></main>;

  const { study, events, records } = data;
  const attention = studyNeedsAttention(study);
  const inactiveDays = daysSinceDate(study.lastContactOn || study.startedOn);

  return (
    <div className="student-profile-shell">
      <header className="student-profile-topbar"><Link className="student-profile-brand" href="/"><span>H</span><strong>Hora a Hora</strong></Link><Link className="button secondary" href="/"><ArrowLeft size={17} /> Voltar ao painel</Link></header>
      <main className="student-profile-page">
        {message && <div className="student-profile-message" role="status">{message}<button type="button" onClick={() => setMessage("")}><X size={15} /></button></div>}
        <section className="student-profile-hero">
          <div className="student-profile-identity"><span><UserRound size={34} /></span><div><small>Ficha individual do estudante</small><h1>{study.name}</h1><p>{study.active ? "Acompanhamento ativo" : "Acompanhamento encerrado"} · desde {dateBR(study.startedOn)}</p></div></div>
          <div className="student-profile-hero-actions">{study.address && <a className="button secondary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(study.address)}`}><MapPin size={17} /> Abrir no Maps</a>}<button type="button" className="button primary" onClick={openNewEvent}><Plus size={18} /> Registrar encontro</button></div>
        </section>

        {attention && <section className="student-profile-alert"><TriangleAlert size={21} /><div><strong>Acompanhamento pendente</strong><p>{study.lastContactOn ? `O último encontro registrado foi há ${inactiveDays} dias.` : `Ainda não há presença registrada. O cadastro começou há ${inactiveDays} dias.`}</p></div></section>}

        <section className="student-profile-overview">
          <article className="student-main-progress"><div><small>Lição / Progresso atual</small><strong>{study.progress}%</strong><p>{study.currentSubject ? `📖 ${study.currentSubject}` : "Nenhum assunto ou lição registrado ainda."}</p></div><div className="student-progress-track"><span style={{ width: `${Math.min(100, study.progress)}%` }} /></div></article>
          <article><span><CalendarDays size={19} /></span><small>Próximo encontro</small><strong>{dateBR(study.nextMeetingOn)}</strong><p>{study.preferredTime ? `às ${study.preferredTime}` : "Horário a combinar"} · {study.recurrence === "weekly" ? "semanal" : "sem repetição"}</p></article>
          <article><span><Clock3 size={19} /></span><small>Preferência</small><strong>{studyScheduleLabel(study) || "A combinar"}</strong><p>{study.remindersEnabled ? "Lembrete individual ativo" : "Lembrete desativado"}</p></article>
          <article><span><MapPin size={19} /></span><small>Endereço</small><strong>{study.address || "Não informado"}</strong><p>{study.address ? "Disponível para abrir no mapa" : "Edite o cadastro para adicionar"}</p></article>
        </section>

        <section className="student-profile-stats">
          <div><strong>{totals.present}</strong><span>Presenças</span></div><div><strong>{totals.absent}</strong><span>Faltas</span></div><div><strong>{totals.rescheduled}</strong><span>Reagendamentos</span></div><div><strong>{hoursLabel(totals.minutes)}</strong><span>Horas relacionadas</span></div>
        </section>

        <section className="student-profile-grid">
          <article className="student-history-panel">
            <header className="student-history-heading"><div><small>Linha do tempo</small><h2>Histórico de acompanhamento</h2></div><button className="button primary" type="button" onClick={openNewEvent}><Plus size={17} /> Novo</button></header>
            {events.length > 0 && <div className="student-history-filters"><label><span>Situação</span><select value={eventStatusFilter} onChange={(event) => setEventStatusFilter(event.target.value as "all" | StudyEventStatus)}><option value="all">Todas</option><option value="present">Presenças</option><option value="absent">Faltas</option><option value="rescheduled">Reagendamentos</option></select></label><label><span>Ano</span><select value={eventYearFilter} onChange={(event) => setEventYearFilter(event.target.value)}><option value="all">Todos</option>{eventYears.map((year) => <option value={year} key={year}>{year}</option>)}</select></label><small>{filteredEvents.length} {filteredEvents.length === 1 ? "item encontrado" : "itens encontrados"}</small></div>}
            {filteredEvents.length ? <div className="student-event-list">{filteredEvents.map((event) => {
              const progressChange = progressChanges.get(event.id) ?? 0;
              return <article className={`student-event ${STATUS[event.status].className}`} key={event.id}><div className="student-event-marker"><span /></div><div className="student-event-content"><header><div><span className={`event-status ${STATUS[event.status].className}`}>{STATUS[event.status].label}</span><strong>{dateBR(event.eventDate)}{event.eventTime ? ` às ${event.eventTime}` : ""}</strong></div><div><button type="button" aria-label="Editar encontro" onClick={() => openEdit(event)}><Edit3 size={15} /></button><button type="button" aria-label="Excluir encontro" onClick={() => void deleteEvent(event)}><Trash2 size={15} /></button></div></header>{event.status === "present" && <><h3>{event.subject}</h3><div className="event-progress"><span style={{ width: `${event.progress}%` }} /></div><div className="event-progress-meta"><small>Progresso registrado: {event.progress}%</small>{progressChange !== 0 && <span className={progressChange > 0 ? "positive" : "negative"}>{progressChange > 0 ? "+" : ""}{progressChange} pontos</span>}</div></>}{event.status === "rescheduled" && <p><CalendarDays size={15} /> Novo encontro: <strong>{dateBR(event.rescheduledTo)}{event.rescheduledTime ? ` às ${event.rescheduledTime}` : ""}</strong></p>}{event.notes && <p>{event.notes}</p>}</div></article>;
            })}</div> : events.length ? <div className="student-empty compact"><Search size={26} /><strong>Nenhum item com esses filtros</strong><p>Selecione outra situação ou outro ano.</p><button className="button ghost" type="button" onClick={() => { setEventStatusFilter("all"); setEventYearFilter("all"); }}>Limpar filtros</button></div> : <div className="student-empty"><BookOpen size={28} /><strong>Nenhum encontro registrado</strong><p>Registre a primeira presença, falta ou alteração de data.</p><button className="button secondary" type="button" onClick={openNewEvent}>Registrar agora</button></div>}
          </article>

          <aside className="student-records-panel">
            <header><small>Relatório de horas</small><h2>Registros relacionados</h2></header>
            {records.length ? <div className="student-related-records">{records.map((record) => <article key={record.id}><span><CalendarDays size={16} /></span><div><strong>{dateBR(record.date)}</strong><small>{record.weekday}</small>{record.notes && <p>{record.notes}</p>}</div><strong>{hoursLabel(record.minutes + record.ldcMinutes)}</strong></article>)}</div> : <div className="student-empty compact"><Clock3 size={25} /><strong>Nenhuma hora vinculada</strong><p>Selecione este estudante ao preencher um registro de horas.</p></div>}
          </aside>
        </section>
      </main>

      {formOpen && draft && <div className="modal-backdrop" role="presentation"><section className="modal student-event-modal" role="dialog" aria-modal="true" aria-label="Registrar encontro"><div className="modal-heading"><div><h2>{editing ? "Editar encontro" : "Registrar encontro"}</h2><p>{study.name}</p></div><button className="icon-button" type="button" onClick={() => setFormOpen(false)}><X size={20} /></button></div><form className="modal-form student-event-form" onSubmit={(event) => void saveEvent(event)}><div className="event-status-options">{(Object.keys(STATUS) as StudyEventStatus[]).map((status) => <button type="button" className={draft.status === status ? `selected ${STATUS[status].className}` : ""} key={status} onClick={() => setDraft({ ...draft, status })}>{status === "present" && <Check size={16} />}{status === "absent" && <X size={16} />}{status === "rescheduled" && <RefreshCw size={16} />}{STATUS[status].label}</button>)}</div><div className="two-columns"><label>Data<input required type="date" value={draft.eventDate} onChange={(event) => setDraft({ ...draft, eventDate: event.target.value })} /></label><label>Horário <span className="optional">opcional</span><input type="time" value={draft.eventTime} onChange={(event) => setDraft({ ...draft, eventTime: event.target.value })} /></label></div>{draft.status === "present" && <><label>Assunto estudado<input required minLength={2} maxLength={180} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="Ex.: capítulo, tema ou atividade" /></label><div className="event-progress-control"><label>Progresso do estudante<input className="range-input" type="range" min="0" max="100" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: event.target.value })} /></label><label><span>Percentual exato</span><span className="event-progress-number"><input aria-label="Percentual exato de progresso" type="number" inputMode="numeric" min="0" max="100" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: event.target.value })} /><strong>%</strong></span></label></div></>}{draft.status === "rescheduled" && <div className="two-columns"><label>Nova data<input required type="date" value={draft.rescheduledTo} onChange={(event) => setDraft({ ...draft, rescheduledTo: event.target.value })} /></label><label>Novo horário <span className="optional">opcional</span><input type="time" value={draft.rescheduledTime} onChange={(event) => setDraft({ ...draft, rescheduledTime: event.target.value })} /></label></div>}<label>Observações <span className="optional">opcional</span><textarea rows={4} maxLength={800} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Pontos importantes do encontro…" /></label><div className="event-recurrence-note"><Bell size={16} /><span>{study.recurrence === "weekly" ? "Ao salvar, o próximo encontro será calculado para a semana seguinte." : "A agenda será mantida sem repetição automática."}</span></div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setFormOpen(false)}>Cancelar</button><button className="button primary" disabled={busy}><Save size={17} /> {busy ? "Salvando…" : "Salvar encontro"}</button></div></form></section></div>}
    </div>
  );
}
