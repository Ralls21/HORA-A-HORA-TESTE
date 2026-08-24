import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const outputDir = path.join(process.cwd(), "tmp", "pdfs");
fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, "relatorio-mensal-exemplo.pdf");
const doc = new jsPDF({ unit: "mm", format: "a4" });
const blue = [74, 109, 167];
const navy = [35, 51, 77];
const muted = [102, 118, 143];

doc.setFillColor(...blue);
doc.rect(0, 0, 210, 46, "F");
doc.setTextColor(255);
doc.setFont("helvetica", "bold");
doc.setFontSize(22);
doc.text("Hora a Hora", 16, 20);
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.text("Relatório mensal de serviço", 16, 28);
doc.setFont("helvetica", "bold");
doc.setFontSize(13);
doc.text("Agosto de 2026", 194, 20, { align: "right" });
doc.setFont("helvetica", "normal");
doc.setFontSize(9);
doc.text("Maria da Silva", 194, 28, { align: "right" });

[["HORAS", "37h 30min"], ["PUBLICAÇÕES", "18"], ["ESTUDOS", "7"], ["META", "50h"]].forEach(([label, value], index) => {
  const x = 16 + index * 46;
  doc.setFillColor(243, 246, 251);
  doc.roundedRect(x, 53, 42, 23, 3, 3, "F");
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
doc.text("75%", 194, 86, { align: "right" });
doc.setFillColor(226, 232, 242);
doc.roundedRect(16, 90, 178, 4, 2, 2, "F");
doc.setFillColor(...blue);
doc.roundedRect(16, 90, 133.5, 4, 2, 2, "F");

autoTable(doc, {
  startY: 103,
  head: [["Data", "Dia", "Tempo", "Public.", "Estudos", "Anotações"]],
  body: [
    ["02/08/2026", "Domingo", "4h 30min", "3", "1", "Revisitas no período da manhã"],
    ["05/08/2026", "Quarta", "6h", "2", "1", "Estudo e atividade de campo"],
    ["09/08/2026", "Domingo", "5h", "4", "2", "Boa participação do grupo"],
    ["14/08/2026", "Sexta", "7h 30min", "3", "1", "Território comercial"],
    ["18/08/2026", "Terça", "6h", "2", "1", "Revisitas"],
    ["23/08/2026", "Domingo", "4h", "2", "1", "Atividade da congregação"],
    ["29/08/2026", "Sábado", "4h 30min", "2", "0", "Encerramento do mês"],
  ],
  theme: "plain",
  headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", cellPadding: 3.2 },
  bodyStyles: { textColor: navy, fontSize: 8.5, cellPadding: 3.2 },
  alternateRowStyles: { fillColor: [247, 249, 252] },
  columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 23 }, 2: { cellWidth: 21 }, 3: { cellWidth: 16, halign: "center" }, 4: { cellWidth: 16, halign: "center" }, 5: { cellWidth: 80 } },
  margin: { left: 16, right: 16, bottom: 24 },
});

const pageHeight = doc.internal.pageSize.height;
doc.setDrawColor(224, 230, 239);
doc.line(16, pageHeight - 18, 194, pageHeight - 18);
doc.setTextColor(...muted);
doc.setFont("helvetica", "italic");
doc.setFontSize(8);
doc.text('“Usando o meu tempo do melhor modo possível.” — Efésios 5:16', 16, pageHeight - 11);
doc.setFont("helvetica", "normal");
doc.text("Página 1", 194, pageHeight - 11, { align: "right" });
fs.writeFileSync(output, Buffer.from(doc.output("arraybuffer")));
process.stdout.write(`${output}\n`);
