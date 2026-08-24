import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMonthlyPdf } from "../lib/pdf-report";

const outputDirectory = join(process.cwd(), "tmp", "pdfs");
mkdirSync(outputDirectory, { recursive: true });
const output = join(outputDirectory, "relatorio-mensal-exemplo.pdf");

const records = [
  { date: "2026-08-02", weekday: "Domingo", minutes: 270, ldcMinutes: 0, publications: 3, studies: 1, studyIds: [1], studyNames: ["Ana"], notes: "Revisitas no período da manhã" },
  { date: "2026-08-05", weekday: "Quarta-feira", minutes: 360, ldcMinutes: 30, publications: 2, studies: 1, studyIds: [1], studyNames: ["Ana"], notes: "Estudo e atividade de campo" },
  { date: "2026-08-09", weekday: "Domingo", minutes: 300, ldcMinutes: 0, publications: 4, studies: 2, studyIds: [1, 2], studyNames: ["Ana", "Bruno"], notes: "Boa participação do grupo" },
  { date: "2026-08-14", weekday: "Sexta-feira", minutes: 450, ldcMinutes: 0, publications: 3, studies: 1, studyIds: [2], studyNames: ["Bruno"], notes: "Território comercial" },
  { date: "2026-08-18", weekday: "Terça-feira", minutes: 360, ldcMinutes: 0, publications: 2, studies: 1, studyIds: [1], studyNames: ["Ana"], notes: "Revisitas" },
  { date: "2026-08-23", weekday: "Domingo", minutes: 240, ldcMinutes: 60, publications: 2, studies: 1, studyIds: [2], studyNames: ["Bruno"], notes: "Atividade da congregação" },
  { date: "2026-08-29", weekday: "Sábado", minutes: 270, ldcMinutes: 0, publications: 2, studies: 0, studyIds: [], studyNames: [], notes: "Encerramento do mês" },
];

const document = createMonthlyPdf({
  user: { name: "Maria da Silva", goalHours: 50, roundingMode: "none" },
  records,
  month: 8,
  year: 2026,
  themeColor: "#4a6da7",
  activeStudies: 2,
  studyDirectory: [
    { id: 1, name: "Ana", active: true, preferredDays: ["wednesday"], preferredTime: "19:00", address: "Centro", currentSubject: "Capítulo 4", progress: 45 },
    { id: 2, name: "Bruno", active: true, preferredDays: ["sunday"], preferredTime: "16:00", address: "Bairro Norte", currentSubject: "Capítulo 2", progress: 25 },
  ],
});

writeFileSync(output, Buffer.from(document.output("arraybuffer")));
process.stdout.write(`${output}\n`);
