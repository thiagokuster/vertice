import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sessionBlockReason } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { userCan, Permission } from "@/lib/permissions";
import { getReport, REPORT_OPTIONS, type ReportId } from "@/lib/reports";
import { reportToExcel } from "@/lib/excel";
import { reportToPdf } from "@/lib/pdf";
import { parseDateInput } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || sessionBlockReason(user, session.user.tokenVersion)) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  const canExport = await userCan(user, Permission.REPORTS_EXPORT);
  const canView =
    (await userCan(user, Permission.REPORTS_OPERATIONAL)) ||
    (await userCan(user, Permission.REPORTS_FINANCIAL));
  if (!canExport || !canView) {
    return NextResponse.json({ error: "Sem permissão para exportar relatórios." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const id = params.get("tipo") as ReportId;
  if (!REPORT_OPTIONS.some((item) => item.id === id)) {
    return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });
  }
  const format = params.get("formato") === "pdf" ? "pdf" : "xlsx";
  const financial = await userCan(user, Permission.REPORTS_FINANCIAL);
  const report = await getReport(id, {
    from: params.get("de") ? parseDateInput(params.get("de")!) : null,
    to: params.get("ate") ? parseDateInput(params.get("ate")!) : null,
    productId: params.get("produto") || undefined,
    categoryId: params.get("categoria") || undefined,
    supplierId: params.get("fornecedor") || undefined,
    userId: params.get("usuario") || undefined,
    financial,
  });
  const settings = await getSettings();
  const body = format === "pdf" ? await reportToPdf(report, settings.companyName) : await reportToExcel(report, settings.companyName);
  const filename = `${id}.${format === "pdf" ? "pdf" : "xlsx"}`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
