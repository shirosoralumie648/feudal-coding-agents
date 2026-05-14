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
  YAxis
} from "recharts";
import type { MetricSnapshot } from "@feudal/contracts";
import { useAnalytics } from "../hooks/use-analytics";

const CHART_COLORS = [
  "#4f46e5",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777"
];

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function toPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function metricDelta(
  current: MetricSnapshot | null,
  previous: MetricSnapshot | undefined,
  field: keyof Pick<
    MetricSnapshot,
    "totalTaskCount" | "awaitingApproval" | "recoveryRequired" | "errorRate"
  >
) {
  if (!current || !previous) {
    return "";
  }

  const delta = current[field] - previous[field];

  if (delta === 0) {
    return "0";
  }

  return delta > 0 ? `+${delta.toFixed(field === "errorRate" ? 2 : 0)}` : delta.toFixed(field === "errorRate" ? 2 : 0);
}

function statusData(snapshot: MetricSnapshot | null) {
  return Object.entries(snapshot?.tasksByStatus ?? {})
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count);
}

function agentData(snapshot: MetricSnapshot | null) {
  return Object.entries(snapshot?.runsByAgent ?? {}).map(([name, value]) => ({
    name,
    value
  }));
}

function historyData(history: MetricSnapshot[]) {
  return history.map((entry) => ({
    time: entry.timestamp,
    tasks: entry.totalTaskCount,
    runs: entry.totalRunCount
  }));
}

function MetricCard(props: {
  label: string;
  value: string | number;
  delta: string;
}) {
  return (
    <article>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
      {props.delta ? <small>{props.delta}</small> : null}
    </article>
  );
}

export function AnalyticsDashboard() {
  const { snapshot, connected, error, snapshotHistory } = useAnalytics();
  const previousSnapshot =
    snapshotHistory.length > 1
      ? snapshotHistory[snapshotHistory.length - 2]
      : undefined;
  const lineData = historyData(snapshotHistory);
  const taskStatusData = statusData(snapshot);
  const utilizationData = agentData(snapshot);

  return (
    <section className="panel panel-analytics">
      <div className="panel-header">
        <h2>Analytics Dashboard</h2>
        <span>{connected ? "Live" : "Disconnected"}</span>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {!connected && !snapshot ? (
        <p className="status-message">Connecting to analytics...</p>
      ) : null}

      {connected && !snapshot ? (
        <p className="status-message">Waiting for metrics data...</p>
      ) : null}

      {snapshot ? (
        <>
          <div className="metric-row analytics-metrics">
            <MetricCard
              label="Total Tasks"
              value={snapshot.totalTaskCount}
              delta={metricDelta(snapshot, previousSnapshot, "totalTaskCount")}
            />
            <MetricCard
              label="Awaiting Approval"
              value={snapshot.awaitingApproval}
              delta={metricDelta(snapshot, previousSnapshot, "awaitingApproval")}
            />
            <MetricCard
              label="Recovery Required"
              value={snapshot.recoveryRequired}
              delta={metricDelta(snapshot, previousSnapshot, "recoveryRequired")}
            />
            <MetricCard
              label="Error Rate"
              value={toPercent(snapshot.errorRate)}
              delta={metricDelta(snapshot, previousSnapshot, "errorRate")}
            />
          </div>

          <div className="chart-grid">
            <article className="chart-card chart-card-wide">
              <h3>Throughput</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tickFormatter={formatTime} />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(value) => formatTime(String(value))} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="tasks"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="runs"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </article>

            <article className="chart-card">
              <h3>Task Status</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={taskStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" angle={-20} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" />
                </BarChart>
              </ResponsiveContainer>
            </article>

            <article className="chart-card">
              <h3>Agent Utilization</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={utilizationData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={80}
                    label
                  >
                    {utilizationData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}

