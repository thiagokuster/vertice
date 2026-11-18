import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/session";
import { getDashboard } from "@/lib/dashboard";
import { formatBRL, formatDateTime, formatNumber } from "@/lib/format";
import { movementTitle } from "@/lib/constants";
import { AutoRefresh } from "@/components/shell";
import { CategoryChart, MovementChart } from "@/components/charts";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboard(user);
  const stats = [
    ["Produtos ativos", formatNumber(data.products)],
    ["Categorias", formatNumber(data.categories)],
    ["Itens em estoque", formatNumber(data.stockUnits)],
    ["Abaixo do mínimo", formatNumber(data.lowStock)],
    ["Sem estoque", formatNumber(data.outOfStock)],
  ];
  if (!data.simplified) {
    stats.push(["Entradas no mês", formatNumber(data.entriesMonth ?? 0)], ["Saídas no mês", formatNumber(data.exitsMonth ?? 0)]);
  }
  if (data.stockValue != null) stats.push(["Valor em estoque", formatBRL(data.stockValue)]);

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {data.simplified ? "Painel simplificado" : data.financial ? "Visão geral" : "Painel operacional"}
        </h1>
        <p className="text-sm text-muted-foreground">Olá, {user.name}. Os números são atualizados a cada minuto e a cada movimentação.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {data.lowList.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Estoque baixo</CardTitle>
            <CardDescription>Produtos ativos abaixo do mínimo, ainda com saldo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Mínimo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lowList.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell><Link className="underline-offset-2 hover:underline" href={`/produtos/${item.id}`}>{item.name}</Link></TableCell>
                    <TableCell>{item.location || "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(item.quantity)}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(item.minStock)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {!data.simplified ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Entradas e saídas</CardTitle>
              <CardDescription>Quantidades dos últimos seis meses.</CardDescription>
            </CardHeader>
            <CardContent>
              <MovementChart data={data.series} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Distribuição por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryChart data={data.categoriesChart} />
            </CardContent>
          </Card>
        </div>
      ) : null}
      {!data.simplified && data.top.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Produtos mais movimentados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.top.map((item) => (
              <div key={item.name} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span className="tabular-nums text-muted-foreground">{formatNumber(item.quantity)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{data.simplified ? "Minhas movimentações" : "Últimas movimentações"}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Qtd.</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell>{movementTitle(item.type, item.effect)}</TableCell>
                    <TableCell>{item.product.name}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(item.quantity)}</TableCell>
                    <TableCell>{item.user.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
