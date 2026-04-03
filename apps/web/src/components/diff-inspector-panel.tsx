export function DiffInspectorPanel(props: {
  diffs: Array<{
    id: number;
    changedPaths: string[];
    afterSubsetJson: Record<string, unknown>;
  }>;
}) {
  return (
    <section className="panel panel-diff">
      <div className="panel-header">
        <h2>Diff Inspector</h2>
        <span>{props.diffs.length} entries</span>
      </div>

      <ul className="detail-list">
        {props.diffs.map((diff) => (
          <li key={diff.id}>
            <div>
              <strong>{diff.changedPaths.join(", ")}</strong>
              <span>{JSON.stringify(diff.afterSubsetJson)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
