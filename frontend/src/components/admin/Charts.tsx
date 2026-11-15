import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayCount } from "@/lib/admin";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tip = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
};

/** Day series line chart. A text summary sits beside it for screen readers. */
export function TrendChart({
  title,
  data,
  color = "var(--chart-1)",
}: {
  title: string;
  data: DayCount[];
  color?: string;
}) {
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <figure aria-label={`${title}: ${total} in this period`}>
      <figcaption className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="tabular-nums text-muted-foreground">{total}</span>
      </figcaption>
      {data.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No activity in this period.
        </p>
      ) : (
        <div className="h-40" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tick={axis}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={24}
              />
              <YAxis tick={axis} allowDecimals={false} />
              <Tooltip {...tip} />
              <Line type="monotone" dataKey="count" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

export function BarsChart({
  title,
  data,
  color = "var(--chart-1)",
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  return (
    <figure aria-label={title}>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 24 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={axis} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={axis} width={96} />
            <Tooltip {...tip} />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal share bars for small categorical breakdowns (lead status, kind). */
export function ShareBars({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <ul className="space-y-2">
      {entries.map(([k, v]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between">
            <span>{k.replace(/_/g, " ")}</span>
            <span className="tabular-nums text-muted-foreground">{v}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-muted" role="presentation">
            <div className="h-2 rounded bg-primary" style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
