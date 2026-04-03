import type { TaskRecord } from "@feudal/contracts";

export function TimelinePanel(props: {
  events: Array<{ id: number; eventType: string; occurredAt: string }>;
  onReplay: (eventId: number) => void;
  taskTitle: string;
  replayTask?: Pick<TaskRecord, "id" | "title" | "status">;
}) {
  return (
    <section className="panel panel-replay">
      <div className="panel-header">
        <h2>Replay Timeline</h2>
        <span>{props.events.length} events</span>
      </div>

      {props.replayTask ? (
        <div className="replay-snapshot">
          <strong>Current Snapshot</strong>
          <span>
            {props.replayTask.title} / {props.replayTask.status}
          </span>
        </div>
      ) : null}

      <ul className="detail-list">
        {props.events.map((event) => (
          <li key={event.id}>
            <div>
              <strong>{event.eventType}</strong>
              <span>{event.occurredAt}</span>
            </div>
            <button type="button" onClick={() => props.onReplay(event.id)}>
              {`Replay ${props.taskTitle}`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
