import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { containsEmoji, rasterizePdfText, type RasterizedPdfText } from "@/lib/pdf-emoji";
import { recordTotalMinutes, roundReportMinutes, type RoundingMode } from "@/lib/reporting";
import { studyScheduleLabel } from "@/lib/studies";

type ReportUser = { name: string; goalHours: number; roundingMode: RoundingMode };
type ReportRecord = {
  date: string;
  weekday: string;
  minutes: number;
  ldcMinutes: number;
  publications: number;
  studies: number;
  studyIds: number[];
  studyNames: string[];
  notes: string;
};
type ReportStudy = {
  id: number;
  name: string;
  active: boolean;
  preferredDays: string[];
  preferredTime: string;
  address: string;
  currentSubject: string;
  progress: number;
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function hours(minutes: number) {
  const full = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${full}h ${rest.toString().padStart(2, "0")}min` : `${full}h`;
}

function dateBR(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function hexToRgb(value?: string): [number, number, number] {
  const fallback: [number, number, number] = [74, 109, 167];
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export type MonthlyPdfInput = {
  user: ReportUser;
  records: ReportRecord[];
  month: number;
  year: number;
  themeColor?: string;
  activeStudies?: number;
  studyDirectory?: ReportStudy[];
  rolloverMinutes?: number;
};

export function createMonthlyPdf(input: MonthlyPdfInput) {
  const { user, records, month, year, rolloverMinutes = 0 } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const serviceMinutes = records.reduce((sum, record) => sum + record.minutes, 0);
  const ldcMinutes = records.reduce((sum, record) => sum + record.ldcMinutes, 0);
  const exactMinutes = records.reduce((sum, record) => sum + recordTotalMinutes(record), 0) + rolloverMinutes;
  const totalMinutes = roundReportMinutes(exactMinutes, user.roundingMode);
  const publications = records.reduce((sum, record) => sum + record.publications, 0);
  const studySessions = records.reduce((sum, record) => sum + record.studies, 0);
  const studies = input.activeStudies ?? studySessions;
  const progress = Math.min(100, Math.round((totalMinutes / (user.goalHours * 60)) * 100));
  const blue = hexToRgb(input.themeColor);
  const navy: [number, number, number] = [35, 51, 77];
  const muted: [number, number, number] = [102, 118, 143];
  const emojiNotes = new Map<number, RasterizedPdfText>();
  const selectedStudyIds = new Set(records.flatMap((record) => record.studyIds ?? []));
  const scheduledStudies = (input.studyDirectory ?? []).filter((study) => selectedStudyIds.size ? selectedStudyIds.has(study.id) : study.active);

  records.forEach((record, index) => {
    if (!record.notes || !containsEmoji(record.notes)) return;
    const rendered = rasterizePdfText(record.notes, {
      maxWidthMm: 39,
      fontSizePt: 8.5,
      color: "#23334d",
    });
    if (rendered) emojiNotes.set(index, rendered);
  });

  doc.setFillColor(...blue);
  doc.rect(0, 0, 210, 46, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Hora a Hora", 16, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Relatório mensal de serviço", 16, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`${MONTHS[month - 1]} de ${year}`, 194, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const renderedUserName = containsEmoji(user.name)
    ? rasterizePdfText(user.name, {
        maxWidthMm: 82,
        fontSizePt: 9,
        color: "#ffffff",
        singleLine: true,
      })
    : null;
  if (renderedUserName) {
    doc.addImage(
      renderedUserName.dataUrl,
      "PNG",
      194 - renderedUserName.widthMm,
      24.2,
      renderedUserName.widthMm,
      renderedUserName.heightMm,
      undefined,
      "FAST",
    );
  } else {
    doc.text(user.name, 194, 28, { align: "right" });
  }

  const cards = [
    ["SERVIÇO", hours(serviceMinutes)],
    ["LDC", hours(ldcMinutes)],
    ["TOTAL", hours(totalMinutes)],
    ["PUBLICAÇÕES", String(publications)],
    ["ESTUDOS", String(studies)],
  ];
  cards.forEach(([label, value], index) => {
    const x = 16 + index * 36;
    doc.setFillColor(243, 246, 251);
    doc.roundedRect(x, 53, 32, 23, 3, 3, "F");
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label, x + 4, 61);
    doc.setTextColor(...navy);
    doc.setFontSize(13);
    doc.text(value, x + 4, 70);
  });

  doc.setTextColor(...navy);
  doc.setFontSize(9);
  doc.text("Progresso da meta", 16, 86);
  doc.setTextColor(...muted);
  doc.text(`${progress}%`, 194, 86, { align: "right" });
  doc.setFillColor(226, 232, 242);
  doc.roundedRect(16, 90, 178, 4, 2, 2, "F");
  if (progress > 0) {
    doc.setFillColor(...blue);
    doc.roundedRect(16, 90, 178 * (progress / 100), 4, 2, 2, "F");
  }

  const drawFooter = () => {
    const pageHeight = doc.internal.pageSize.height;
    const page = doc.getCurrentPageInfo().pageNumber;
    doc.setDrawColor(224, 230, 239);
    doc.line(16, pageHeight - 18, 194, pageHeight - 18);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text('“Usando o meu tempo do melhor modo possível.” — Efésios 5:16', 16, pageHeight - 11);
    doc.setFont("helvetica", "normal");
    doc.text(`Página ${page}`, 194, pageHeight - 11, { align: "right" });
  };

  autoTable(doc, {
    startY: 103,
    head: [["Data", "Dia", "Serviço", "LDC", "Public.", "Estudantes / sessões", "Anotações"]],
    body: records.length
      ? records.map((record, index) => [
          dateBR(record.date),
          record.weekday.replace("-feira", ""),
          hours(record.minutes),
          hours(record.ldcMinutes),
          record.publications,
          record.studyNames?.length
            ? `${record.studyNames.join(", ")} · ${record.studies} sessão${record.studies === 1 ? "" : "ões"}`
            : record.studies ? `${record.studies} sessão${record.studies === 1 ? "" : "ões"}` : "—",
          emojiNotes.has(index) ? "" : record.notes || "—",
        ])
      : [["—", "—", "—", "—", "—", "—", "Nenhum registro neste mês"]],
    theme: "plain",
    headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", cellPadding: 3.2 },
    bodyStyles: { textColor: navy, fontSize: 8.5, cellPadding: 3.2 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 20 },
      2: { cellWidth: 18 },
      3: { cellWidth: 15 },
      4: { cellWidth: 13, halign: "center" },
      5: { cellWidth: 46 },
      6: { cellWidth: 45 },
    },
    margin: { left: 16, right: 16, bottom: 24 },
    rowPageBreak: "avoid",
    didParseCell: (cellData) => {
      if (cellData.section !== "body" || cellData.column.index !== 6) return;
      const rendered = emojiNotes.get(cellData.row.index);
      if (!rendered) return;
      cellData.cell.text = [];
      cellData.cell.styles.minCellHeight = rendered.heightMm + 6.4;
    },
    didDrawCell: (cellData) => {
      if (cellData.section !== "body" || cellData.column.index !== 6) return;
      const rendered = emojiNotes.get(cellData.row.index);
      if (!rendered) return;
      doc.addImage(
        rendered.dataUrl,
        "PNG",
        cellData.cell.x + 3.2,
        cellData.cell.y + 3.2,
        Math.min(rendered.widthMm, cellData.cell.width - 6.4),
        rendered.heightMm,
        undefined,
        "FAST",
      );
    },
    didDrawPage: drawFooter,
  });

  if (scheduledStudies.length) {
    let startY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 103) + 13;
    if (startY > 235) {
      doc.addPage();
      startY = 23;
    }
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Agenda dos estudantes acompanhados", 16, startY);
    autoTable(doc, {
      startY: startY + 5,
      head: [["Estudante", "Preferência", "Assunto / progresso", "Endereço"]],
      body: scheduledStudies.map((study) => [study.name, studyScheduleLabel(study) || "A combinar", study.currentSubject ? `${study.currentSubject} · ${study.progress}%` : "Ainda não registrado", study.address || "Não informado"]),
      theme: "plain",
      headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", cellPadding: 3 },
      bodyStyles: { textColor: navy, fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 42 }, 2: { cellWidth: 47 }, 3: { cellWidth: 55 } },
      margin: { left: 16, right: 16, bottom: 24 },
      rowPageBreak: "avoid",
      didDrawPage: drawFooter,
    });
  }

  return doc;
}

export function downloadMonthlyPdf(input: MonthlyPdfInput) {
  const doc = createMonthlyPdf(input);
  doc.save(`hora-a-hora-${input.year}-${String(input.month).padStart(2, "0")}.pdf`);
}
