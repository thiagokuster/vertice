import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { displayCell, type ReportData } from "@/lib/reports";
import { formatDateTime } from "@/lib/format";

export async function reportToPdf(report: ReportData, company: string) {
  const pdf = await PDFDocument.create();
  const fontBytes = await readFile(path.join(process.cwd(), "src", "assets", "fonts", "NotoSans-Regular.ttf"));
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const margin = 32;
  const rowHeight = 16;
  let page = pdf.addPage([842, 595]);
  let y = 560;

  const drawHeader = () => {
    page.drawText(company, { x: margin, y, size: 10, font, color: rgb(0.15, 0.35, 0.3) });
    y -= 18;
    page.drawText(report.title, { x: margin, y, size: 16, font, color: rgb(0.08, 0.15, 0.12) });
    y -= 16;
    page.drawText(`${report.description} · Gerado em ${formatDateTime(new Date())}`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.3, 0.35, 0.33),
    });
    y -= 22;
    drawRow(report.columns.map((column) => column.label), true);
  };

  const drawRow = (cells: string[], header = false) => {
    if (y < 48) {
      page = pdf.addPage([842, 595]);
      y = 560;
      drawRow(report.columns.map((column) => column.label), true);
    }
    const width = (842 - margin * 2) / report.columns.length;
    cells.forEach((cell, index) => {
      const text = cell.length > 28 ? `${cell.slice(0, 27)}…` : cell;
      page.drawText(text, {
        x: margin + index * width,
        y,
        size: header ? 8 : 8,
        font,
        color: header ? rgb(0.1, 0.28, 0.22) : rgb(0.12, 0.14, 0.13),
      });
    });
    y -= rowHeight;
  };

  drawHeader();
  if (report.rows.length === 0) {
    page.drawText("Nenhum registro para os filtros informados.", { x: margin, y, size: 10, font });
  }
  for (const row of report.rows) {
    drawRow(report.columns.map((column) => displayCell(row[column.key] ?? "", column.kind)));
  }

  return Buffer.from(await pdf.save());
}
