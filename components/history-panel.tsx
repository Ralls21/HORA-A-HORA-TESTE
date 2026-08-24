"use client";

import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FilterX, Pencil, Search, SlidersHorizontal, Trash2, UsersRound, Wifi, WifiOff } from "lucide-react";
import type { StudyEntry } from "@/components/studies-modal";
import { recordTotalMinutes } from "@/lib/reporting";

export type HistoryRecord = {
  id: number;
  date: string;
  weekday: string;
  minutes: number;
  ldcMinutes: number;
  publications: number;
  studies: number;
  studyIds: number[];
  studyNames: string[];
  notes: string;
  month: number;
  year: number;
  createdAt?: string;
  updatedAt?: string;
  offlineKey?: string;
};

type Filters = {
  search: string;
  month: string;
  category: "all" | "service" | "ldc";
  study: string;
  status: "all" | "synced" | "pending";
  from: string;
  to: string;
  sort: "newest" | "oldest" | "hours" | "pending";
};

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const INITIAL_FILTERS: Filters = { search: "", month: "all", category: "all", study: "all", status: "all", from: "", to: "", sort: "newest" };

function hoursLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}min` : `${hours}h`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00`)).replace(" de ", " ");
}

function isPending(record: HistoryRecord) {
  return record.id <= 0 || Boolean(record.offlineKey);
}

export function HistoryPanel({ records, studies, year, onYearChange, onEdit, onDelete, onExport }: {
  records: HistoryRecord[];
  studies: StudyEntry[];
  year: number;
  onYearChange: (year: number) => void;
  onEdit: (record: HistoryRecord) => void;
  onDelete: (record: HistoryRecord) => void;
  onExport: (records: HistoryRecord[]) => void;
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [visibleCount, setVisibleCount] = useState(25);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(25);
  }

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase("pt-BR");
    const selectedStudy = Number(filters.study);
    const result = records.filter((record) => {
      if (filters.month !== "all" && record.month !== Number(filters.month)) return false;
      if (filters.category === "service" && record.minutes <= 0) return false;
      if (filters.category === "ldc" && record.ldcMinutes <= 0) return false;
      if (filters.study !== "all" && !(record.studyIds ?? []).includes(selectedStudy)) return false;
      if (filters.status === "pending" && !isPending(record)) return false;
      if (filters.status === "synced" && isPending(record)) return false;
      if (filters.from && record.date < filters.from) return false;
      if (filters.to && record.date > filters.to) return false;
      if (search) {
        const formattedDate = dateLabel(record.date);
        const dayMonth = `${record.date.slice(8, 10)}/${record.date.slice(5, 7)}`;
        const searchTarget = `${record.date} ${formattedDate} ${dayMonth} ${record.notes || ""} ${record.weekday} ${(record.studyNames ?? []).join(" ")}`.toLocaleLowerCase("pt-BR");
        if (!searchTarget.includes(search)) return false;
      }
      return true;
    });
    return result.sort((a, b) => {
      if (filters.sort === "oldest") return a.date.localeCompare(b.date);
      if (filters.sort === "hours") return recordTotalMinutes(b) - recordTotalMinutes(a) || b.date.localeCompare(a.date);
      if (filters.sort === "pending") return Number(isPending(b)) - Number(isPending(a)) || b.date.localeCompare(a.date);
      return b.date.localeCompare(a.date);
    });
  }, [filters, records]);

  const visible = filtered.slice(0, visibleCount);
  const grouped = useMemo(() => {
    const groups = new Map<number, HistoryRecord[]>();
    for (const record of visible) groups.set(record.month, [...(groups.get(record.month) ?? []), record]);
    return [...groups.entries()].sort(([monthA], [monthB]) => filters.sort === "oldest" ? monthA - monthB : monthB - monthA);
  }, [filters.sort, visible]);
  const totals = useMemo(() => filtered.reduce((sum, record) => ({
    service: sum.service + record.minutes,
    ldc: sum.ldc + record.ldcMinutes,
    publications: sum.publications + record.publications,
    studies: sum.studies + record.studies,
  }), { service: 0, ldc: 0, publications: 0, studies: 0 }), [filtered]);
  const activeFilters = Object.entries(filters).filter(([key, value]) => value !== INITIAL_FILTERS[key as keyof Filters]).length;

  return (
    <section className="history-workspace" aria-labelledby="history-title">
      <header className="workspace-heading">
        <div><span className="card-label">Histórico de registros</span><h1 id="history-title">Tudo o que você registrou</h1><p>Localize, confira, edite e exporte seus registros sem misturar com a agenda dos estudantes.</p></div>
        <div className="history-year-switcher"><button type="button" aria-label="Ano anterior" onClick={() => onYearChange(year - 1)}><ChevronLeft size={19} /></button><strong>{year}</strong><button type="button" aria-label="Próximo ano" onClick={() => onYearChange(year + 1)}><ChevronRight size={19} /></button></div>
      </header>

      <details className="history-filters-panel panel">
        <summary className="history-filters-toggle">
          <span className="history-filters-toggle-icon"><SlidersHorizontal size={19} /></span>
          <span className="history-filters-toggle-copy"><strong>Filtros do histórico</strong><small>{activeFilters ? `${activeFilters} ${activeFilters === 1 ? "filtro ativo" : "filtros ativos"}` : "Busca, período, estudante, status e ordenação"}</small></span>
          {activeFilters > 0 && <span className="history-filter-count">{activeFilters}</span>}
          <ChevronDown className="history-filters-chevron" size={20} />
        </summary>
        <div className="history-filters">
          <label className="history-search"><Search size={18} /><span className="sr-only">Buscar no histórico</span><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Buscar em anotações ou estudantes…" /></label>
          <label><span>Mês</span><select value={filters.month} onChange={(event) => updateFilter("month", event.target.value)}><option value="all">Todos os meses</option>{MONTHS.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></label>
          <label><span>Categoria</span><select value={filters.category} onChange={(event) => updateFilter("category", event.target.value as Filters["category"])}><option value="all">Serviço e LDC</option><option value="service">Com serviço</option><option value="ldc">Com LDC</option></select></label>
          <label><span>Estudante</span><select value={filters.study} onChange={(event) => updateFilter("study", event.target.value)}><option value="all">Todos</option>{studies.map((study) => <option value={study.id} key={study.id}>{study.name}</option>)}</select></label>
          <label><span>Sincronização</span><select value={filters.status} onChange={(event) => updateFilter("status", event.target.value as Filters["status"])}><option value="all">Todos</option><option value="synced">Sincronizados</option><option value="pending">Pendentes</option></select></label>
          <label><span>De</span><input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
          <label><span>Até</span><input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
          <label><span>Ordenar</span><select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as Filters["sort"])}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="hours">Mais horas</option><option value="pending">Pendentes primeiro</option></select></label>
          <div className="history-filter-actions"><button type="button" className="button ghost" disabled={!activeFilters} onClick={() => { setFilters(INITIAL_FILTERS); setVisibleCount(25); }}><FilterX size={17} /> Limpar {activeFilters ? `(${activeFilters})` : ""}</button><button type="button" className="button secondary" disabled={!filtered.length} onClick={() => onExport(filtered)}><Download size={17} /> Exportar resultado</button></div>
        </div>
      </details>

      <section className="history-summary" aria-label="Resumo dos resultados">
        <article><Clock3 /><span><small>Serviço</small><strong>{hoursLabel(totals.service)}</strong></span></article>
        <article><Clock3 /><span><small>LDC</small><strong>{hoursLabel(totals.ldc)}</strong></span></article>
        <article><BookOpen /><span><small>Publicações</small><strong>{totals.publications}</strong></span></article>
        <article><UsersRound /><span><small>Sessões</small><strong>{totals.studies}</strong></span></article>
        <article><CalendarDays /><span><small>Dias registrados</small><strong>{filtered.length}</strong></span></article>
      </section>

      {grouped.length ? <div className="history-groups">{grouped.map(([month, monthRecords], groupIndex) => {
        const monthTotal = monthRecords.reduce((sum, record) => sum + recordTotalMinutes(record), 0);
        return <details className="history-month panel" open={groupIndex === 0 ? true : undefined} key={month}>
          <summary><span><CalendarDays size={19} /><span><strong>{MONTHS[month - 1]} de {year}</strong><small>{monthRecords.length} {monthRecords.length === 1 ? "registro" : "registros"} · {hoursLabel(monthTotal)}</small></span></span><ChevronDown size={19} /></summary>
          <div className="history-table-wrap">
            <table className="history-table"><thead><tr><th>Data</th><th>Serviço</th><th>LDC</th><th>Total</th><th>Publicações</th><th>Estudantes / sessões</th><th>Anotações</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{monthRecords.map((record) => <tr key={`${record.id}-${record.date}`}><td><strong>{dateLabel(record.date)}</strong><small>{record.weekday}</small></td><td>{hoursLabel(record.minutes)}</td><td>{record.ldcMinutes ? hoursLabel(record.ldcMinutes) : "—"}</td><td><strong>{hoursLabel(recordTotalMinutes(record))}</strong></td><td>{record.publications}</td><td><strong>{record.studyNames?.join(", ") || `${record.studies} sessão${record.studies === 1 ? "" : "ões"}`}</strong></td><td className="notes-cell">{record.notes || <span className="muted">Sem anotações</span>}</td><td><span className={`sync-pill ${isPending(record) ? "pending" : "synced"}`}>{isPending(record) ? <WifiOff size={13} /> : <Wifi size={13} />}{isPending(record) ? "Pendente" : "Sincronizado"}</span></td><td><div className="row-actions"><button type="button" aria-label={`Editar registro de ${dateLabel(record.date)}`} onClick={() => onEdit(record)}><Pencil size={16} /></button><button type="button" className="danger-icon" aria-label={`Excluir registro de ${dateLabel(record.date)}`} onClick={() => onDelete(record)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table>
          </div>
          <div className="history-mobile-list">{monthRecords.map((record) => <article key={`${record.id}-${record.date}`}><header><span><strong>{dateLabel(record.date)}</strong><small>{record.weekday}</small></span><span className={`sync-pill ${isPending(record) ? "pending" : "synced"}`}>{isPending(record) ? <WifiOff size={12} /> : <Wifi size={12} />}{isPending(record) ? "Pendente" : "Sincronizado"}</span></header><div className="history-mobile-values"><span><small>Serviço</small><strong>{hoursLabel(record.minutes)}</strong></span><span><small>LDC</small><strong>{hoursLabel(record.ldcMinutes)}</strong></span><span><small>Total</small><strong>{hoursLabel(recordTotalMinutes(record))}</strong></span><span><small>Publicações</small><strong>{record.publications}</strong></span></div>{record.studyNames?.length ? <p><strong>Estudantes:</strong> {record.studyNames.join(", ")}</p> : null}{record.notes ? <p>{record.notes}</p> : null}<footer><button type="button" onClick={() => onEdit(record)}><Pencil size={15} /> Editar</button><button type="button" className="danger" onClick={() => onDelete(record)}><Trash2 size={15} /> Excluir</button></footer></article>)}</div>
        </details>;
      })}</div> : <div className="history-empty panel"><Search size={31} /><h2>Nenhum registro encontrado</h2><p>Altere os filtros ou selecione outro ano para consultar o histórico.</p>{activeFilters > 0 && <button type="button" className="button secondary" onClick={() => setFilters(INITIAL_FILTERS)}>Limpar filtros</button>}</div>}

      {filtered.length > visible.length && <div className="history-load-more"><span>Mostrando {visible.length} de {filtered.length} registros</span><button type="button" className="button secondary" onClick={() => setVisibleCount((count) => count + 25)}>Carregar mais 25</button></div>}
    </section>
  );
}
