"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/constants";

interface NameValue {
  name: string;
  value: number;
}

export function LeadsByAreaChart({ data }: { data: NameValue[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
        <CartesianGrid horizontal={false} stroke="#E2E8F0" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 12, fill: "#64748B" }}
        />
        <Tooltip cursor={{ fill: "#F1F5F9" }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#1E3A8A" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadsBySourceChart({ data }: { data: NameValue[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function UrgencyChart({ data }: { data: NameValue[] }) {
  const colors = ["#DC2626", "#F59E0B", "#16A34A"];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 0, right: 16 }}>
        <CartesianGrid vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} />
        <YAxis tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#F1F5F9" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvolutionChart({
  data,
}: {
  data: { semana: string; leads: number; clientes: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ left: 0, right: 16 }}>
        <CartesianGrid vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#64748B" }} />
        <YAxis tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="leads" stroke="#1E3A8A" strokeWidth={2} name="Leads" />
        <Line
          type="monotone"
          dataKey="clientes"
          stroke="#C9A84C"
          strokeWidth={2}
          name="Clientes"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
