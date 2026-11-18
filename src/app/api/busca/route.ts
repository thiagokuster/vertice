import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userCan, Permission } from "@/lib/permissions";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active || user.tokenVersion !== session.user.tokenVersion) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  if (!(await userCan(user, Permission.PRODUCTS_VIEW))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q.toUpperCase() } },
        { barcode: { contains: q } },
      ],
    },
    select: { id: true, name: true, sku: true, barcode: true },
    take: 8,
  });
  return NextResponse.json(products);
}
