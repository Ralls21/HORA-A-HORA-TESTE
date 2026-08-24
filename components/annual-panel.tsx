"use client";

import { CalendarRange, TrendingUp } from "lucide-react";
import { annualProjection, recordTotalMinutes } from "@/lib/reporting";

type AnnualRecord = { month: number; minutes: number; ldcMinutes: number };

function hoursLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}min` : `${hours}h`;
}

export function AnnualPanel({ records, goalHours, year }: { records: AnnualRecord[]; goalHours: number; year: number }) {
  const total = records.reduce((sum, record) => sum + recordTotalMinutes(record), 0);
  const current = new Date();
  const daysInCurrentMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const elapsedMonths = year < current.getFullYear()
    ? 12
    : year > current.getFullYear()
      ? 0
      : current.getMonth() + current.getDate() / daysInCurrentMonth;
  const goalMinutes = goalHours * 60;
  const progress = Math.min(100, Math.round((total / goalMinutes) * 100));
  const remaining = Math.max(0, goalMinutes - total);
  const wholeMonthsRemaining = year < current.getFullYear() ? 0 : year > current.getFullYear() ? 12 : 11 - current.getMonth();
  const projection = annualProjection(total, elapsedMonths);
  const averageLabel = year < current.getFullYear() ? "Ano encerrado" : year > current.getFullYear() ? "Média planejada" : "Média necessária";
  const averageValue = !remaining
    ? "Meta alcançada"
    : wholeMonthsRemaining > 0
      ? hoursLabel(Math.ceil(remaining / wholeMonthsRemaining))
      : "Meta não alcançada";
  const monthly = Array.from({ length: 12 }, (_, index) => records.filter((record) => record.month === index + 1).reduce((sum, record) => sum + recordTotalMinutes(record), 0));
  const max = Math.max(...monthly, 60);

  return (
    <section className="panel annual-panel">
      <div className="panel-heading annual-heading">
        <div><span className="card-label">Visão anual</span><h2>Sua evolução em {year}</h2><p>Acompanhe a meta sem esperar o fechamento do ano.</p></div>
        <CalendarRange size={23} />
      </div>
      <div className="annual-summary">
        <div><small>Acumulado</small><strong>{hoursLabel(total)}</strong></div>
        <div><small>Meta anual</small><strong>{goalHours}h</strong></div>
        <div><small>Faltam</small><strong>{hoursLabel(remaining)}</strong></div>
        <div><small>{averageLabel}</small><strong>{averageValue}</strong></div>
      </div>
      <div className="annual-progress"><span style={{ width: `${progress}%` }} /><strong>{progress}%</strong></div>
      <div className="annual-chart" aria-label="Horas registradas por mês" role="img">
        {monthly.map((minutes, index) => <div key={index} aria-label={`Mês ${index + 1}: ${hoursLabel(minutes)}`}><span style={{ height: `${Math.max(minutes ? 8 : 2, (minutes / max) * 100)}%` }} title={hoursLabel(minutes)} /><small>{String(index + 1).padStart(2, "0")}</small></div>)}
      </div>
      <p className="annual-projection"><TrendingUp size={17} /> Mantendo o ritmo atual, a projeção é de <strong>{hoursLabel(projection)}</strong> no ano.</p>
    </section>
  );
}
