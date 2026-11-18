"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#0f6e56", "#c2410c", "#1d4e89", "#a16207", "#6d28d9", "#0f766e"];

export function MovementChart({ data }: { data: { month: string; entradas: number; saidas: number }[] }) {
  if (data.length === 0) return null;
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="entradas" name="Entradas" fill="#0f6e56" radius={4} />
          <Bar dataKey="saidas" name="Saídas" fill="#c2410c" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ data }: { data: { name: string; value: number }[] }) {
  const filled = data.filter((item) => item.value > 0);
  if (filled.length === 0) return <p className="text-sm text-muted-foreground">Sem saldo para distribuir.</p>;
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={filled} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
            {filled.map((item, index) => (
              <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
