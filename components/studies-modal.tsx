"use client";

import { FormEvent, useState } from "react";
import { Bell, BookHeart, CalendarDays, Check, ExternalLink, MapPin, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { STUDY_DAY_OPTIONS, studyScheduleLabel } from "@/lib/studies";

export type StudyEntry = {
  id: number;
  name: string;
  active: boolean;
  startedOn: string;
  endedOn: string | null;
  preferredDays: string[];
  preferredTime: string;
  address: string;
  remindersEnabled: boolean;
  nextMeetingOn: string | null;
  recurrence: "none" | "weekly";
  staleAfterDays: number;
  lastContactOn: string | null;
  currentSubject: string;
  progress: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type StudyForm = {
  name: string;
  startedOn: string;
  preferredDays: string[];
  preferredTime: string;
  address: string;
  remindersEnabled: boolean;
  nextMeetingOn: string;
  recurrence: "none" | "weekly";
  staleAfterDays: number;
  currentSubject: string;
  notes: string;
};

function localDate() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function emptyStudyForm(): StudyForm {
  return { name: "", startedOn: localDate(), preferredDays: [], preferredTime: "", address: "", remindersEnabled: false, nextMeetingOn: "", recurrence: "weekly", staleAfterDays: 14, currentSubject: "", notes: "" };
}

export function StudiesModal({ studies, busy, onClose, onCreate, onUpdate, onDelete }: {
  studies: StudyEntry[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: StudyForm) => Promise<boolean>;
  onUpdate: (study: StudyEntry, input: Partial<StudyEntry>) => Promise<boolean>;
  onDelete: (study: StudyEntry) => Promise<void>;
}) {
  const [editing, setEditing] = useState<StudyEntry | null>(null);
  const [form, setForm] = useState<StudyForm>(emptyStudyForm);

  function edit(study: StudyEntry) {
    setEditing(study);
    setForm({
      name: study.name,
      startedOn: study.startedOn,
      preferredDays: study.preferredDays ?? [],
      preferredTime: study.preferredTime ?? "",
      address: study.address ?? "",
      remindersEnabled: study.remindersEnabled ?? false,
      nextMeetingOn: study.nextMeetingOn ?? "",
      recurrence: study.recurrence ?? "weekly",
      staleAfterDays: study.staleAfterDays ?? 14,
      currentSubject: study.currentSubject ?? "",
      notes: study.notes,
    });
  }

  function clearForm() {
    setEditing(null);
    setForm(emptyStudyForm());
  }

  function toggleDay(day: string) {
    setForm((current) => ({
      ...current,
      preferredDays: current.preferredDays.includes(day)
        ? current.preferredDays.filter((item) => item !== day)
        : [...current.preferredDays, day],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = editing ? await onUpdate(editing, form) : await onCreate(form);
    if (saved) clearForm();
  }

  const active = studies.filter((study) => study.active);
  const inactive = studies.filter((study) => !study.active);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal modal-wide studies-modal" role="dialog" aria-modal="true" aria-label="Gerenciar estudos">
        <div className="modal-heading"><div><h2>Estudos acompanhados</h2><p>Cadastre cada estudo uma única vez para o relatório contar pessoas, não sessões repetidas.</p></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={21} /></button></div>
        <div className="studies-layout">
          <form className="study-form" onSubmit={(event) => void submit(event)}>
            <div className="study-form-title"><span><BookHeart size={20} /></span><div><strong>{editing ? "Editar acompanhamento" : "Novo acompanhamento"}</strong><small>Cadastre a pessoa e a preferência de estudo.</small></div></div>
            <label>Identificação<input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Maria S. ou Estudo 01" /></label>
            <div className="study-form-row">
              <label>Início<input required type="date" value={form.startedOn} onChange={(event) => setForm({ ...form, startedOn: event.target.value })} /></label>
              <label>Horário preferido <span className="optional">opcional</span><input type="time" value={form.preferredTime} onChange={(event) => setForm({ ...form, preferredTime: event.target.value })} /></label>
            </div>
            <fieldset className="study-days-field">
              <legend>Dias preferidos <span className="optional">opcional</span></legend>
              <div className="study-day-options">
                {STUDY_DAY_OPTIONS.map((day) => <button type="button" key={day.id} className={form.preferredDays.includes(day.id) ? "selected" : ""} aria-pressed={form.preferredDays.includes(day.id)} onClick={() => toggleDay(day.id)}>{day.short}</button>)}
              </div>
            </fieldset>
            <label>Endereço <span className="optional">opcional</span><input maxLength={240} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Rua, número, bairro e referência" /></label>
            <label>Lição ou Capítulo Atual <span className="optional">opcional</span><input maxLength={140} value={form.currentSubject} onChange={(event) => setForm({ ...form, currentSubject: event.target.value })} placeholder="Ex: Livro Seja Feliz, Lição 08, ponto 3" /></label>
            <section className="study-agenda-settings">
              <div className="study-form-row">
                <label>Próximo encontro <span className="optional">opcional</span><input type="date" value={form.nextMeetingOn} onChange={(event) => setForm({ ...form, nextMeetingOn: event.target.value })} /></label>
                <label>Recorrência<select value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as StudyForm["recurrence"] })}><option value="weekly">Toda semana</option><option value="none">Sem repetição</option></select></label>
              </div>
              <label className="study-reminder-toggle"><input type="checkbox" checked={form.remindersEnabled} onChange={(event) => setForm({ ...form, remindersEnabled: event.target.checked })} /><span><Bell size={17} /><span><strong>Lembrete individual</strong><small>Notificar no horário preferido deste estudante.</small></span></span></label>
              <label>Alertar depois de quantos dias sem acompanhamento?<input type="number" min="1" max="365" value={form.staleAfterDays} onChange={(event) => setForm({ ...form, staleAfterDays: Number(event.target.value) || 14 })} /></label>
            </section>
            <label>Anotações <span className="optional">opcional</span><textarea rows={3} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Informações que ajudem no acompanhamento…" /></label>
            <div className="modal-actions"><button type="button" className="button ghost" onClick={clearForm}>{editing ? "Cancelar edição" : "Limpar"}</button><button className="button primary" disabled={busy}>{editing ? <><Check size={17} /> Salvar</> : <><Plus size={17} /> Cadastrar</>}</button></div>
          </form>
          <div className="studies-list-wrap">
            <div className="studies-list-heading"><div><strong>{active.length} ativos</strong><small>{inactive.length} encerrados</small></div></div>
            {studies.length ? <div className="studies-list">
              {[...active, ...inactive].map((study) => <article className={`study-item ${study.active ? "" : "inactive"}`} key={study.id}>
                <div className="study-item-main"><span><BookHeart size={18} /></span><div><strong>{study.name}</strong><small>Desde {new Intl.DateTimeFormat("pt-BR").format(new Date(`${study.startedOn}T12:00:00`))}{study.endedOn ? ` · encerrado em ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${study.endedOn}T12:00:00`))}` : ""}</small><div className="study-details">{studyScheduleLabel(study) && <span><CalendarDays size={13} /> {studyScheduleLabel(study)}</span>}{study.nextMeetingOn && <span><CalendarDays size={13} /> Próximo: {new Intl.DateTimeFormat("pt-BR").format(new Date(`${study.nextMeetingOn}T12:00:00`))}</span>}{study.address && <span><MapPin size={13} /> {study.address}</span>}{study.remindersEnabled && <span><Bell size={13} /> Lembrete ativo</span>}</div>{study.currentSubject && <p><strong>Assunto atual:</strong> {study.currentSubject} · {study.progress}%</p>}{study.notes && <p>{study.notes}</p>}</div></div>
                <div className="study-item-actions"><a href={`/estudantes/${study.id}`}><ExternalLink size={15} /> Abrir ficha</a><button type="button" onClick={() => edit(study)}><Pencil size={15} /> Editar</button><button type="button" onClick={() => void onUpdate(study, { active: !study.active, endedOn: study.active ? localDate() : null })}>{study.active ? <><Check size={15} /> Encerrar</> : <><RotateCcw size={15} /> Reativar</>}</button><button type="button" className="danger" onClick={() => void onDelete(study)}><Trash2 size={15} /> Excluir</button></div>
              </article>)}
            </div> : <div className="empty-study"><BookHeart size={29} /><strong>Nenhum estudo cadastrado</strong><p>Cadastre ao lado para ativar a contagem exata.</p></div>}
          </div>
        </div>
      </section>
    </div>
  );
}
