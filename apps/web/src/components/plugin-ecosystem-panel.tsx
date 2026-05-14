import { useEffect, useMemo, useState } from "react";
import { fetchPluginMarketplace, type PluginMarketplaceSnapshot } from "../lib/api";

function formatExtensionTypes(types: string[]) {
  return types.length > 0 ? types.join(" / ") : "none";
}

export function PluginEcosystemPanel() {
  const [snapshot, setSnapshot] = useState<PluginMarketplaceSnapshot>({
    entries: [],
    failed: []
  });
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    fetchPluginMarketplace()
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setError(undefined);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const highRisk = snapshot.entries.filter(
      (entry) =>
        entry.security.riskLevel === "high" ||
        entry.security.riskLevel === "critical"
    ).length;
    const compatible = snapshot.entries.filter(
      (entry) => entry.compatibility.status === "compatible"
    ).length;
    const enabled = snapshot.entries.filter((entry) => entry.state === "enabled").length;

    return {
      highRisk,
      compatible,
      enabled
    };
  }, [snapshot.entries]);

  return (
    <section className="panel panel-plugins">
      <div className="panel-header">
        <div>
          <h2>Plugin Ecosystem</h2>
          <span>{snapshot.entries.length} local catalog entries</span>
        </div>
        <span>{snapshot.failed.length} discovery issues</span>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="metric-row plugin-metrics">
        <article>
          <strong>{summary.enabled}</strong>
          <span>Enabled</span>
        </article>
        <article>
          <strong>{summary.compatible}</strong>
          <span>Compatible</span>
        </article>
        <article>
          <strong>{summary.highRisk}</strong>
          <span>High risk</span>
        </article>
        <article>
          <strong>SDK</strong>
          <span>docs/plugins/sdk.md</span>
        </article>
      </div>

      <div className="table-scroll">
        <table className="data-table plugin-table">
          <thead>
            <tr>
              <th>Plugin</th>
              <th>State</th>
              <th>Risk</th>
              <th>Compatibility</th>
              <th>Extensions</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.entries.map((entry) => (
              <tr key={entry.pluginId}>
                <td>
                  <strong>{entry.name}</strong>
                  <span>{entry.pluginId}</span>
                </td>
                <td>{entry.state}</td>
                <td>{entry.security.riskLevel}</td>
                <td>{entry.compatibility.status}</td>
                <td>{formatExtensionTypes(entry.extensionTypes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {snapshot.entries.length === 0 ? (
        <p className="empty-state">No local plugins discovered</p>
      ) : null}
    </section>
  );
}
