import ExcelJS from "exceljs";
import type { ReportData } from "@/lib/reports";
import { formatDateTime } from "@/lib/format";

export async function reportToExcel(report: ReportData, company: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vértice";
  const sheet = workbook.addWorksheet("Relatório");
  sheet.addRow([company]);
  sheet.addRow([report.title]);
  sheet.addRow([`${report.description} · Gerado em ${formatDateTime(new Date())}`]);
  sheet.addRow([]);
  const header = sheet.addRow(report.columns.map((column) => column.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6E56" } };
  for (const row of report.rows) {
    const values = report.columns.map((column) => {
      const value = row[column.key] ?? "";
      if (column.kind === "money" && typeof value === "number") return value / 100;
      return value;
    });
    const added = sheet.addRow(values);
    report.columns.forEach((column, index) => {
      if (column.kind === "money") added.getCell(index + 1).numFmt = '"R$" #,##0.00';
    });
  }
  sheet.columns.forEach((column) => {
    column.width = 22;
  });
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  if (report.rows.length === 0) sheet.addRow(["Nenhum registro para os filtros informados."]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
