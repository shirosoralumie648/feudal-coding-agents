import type { ACPAgentManifest } from "@feudal/acp";

interface AgentRegistryPanelProps {
  agents: ACPAgentManifest[];
}

export function AgentRegistryPanel(props: AgentRegistryPanelProps) {
  const { agents } = props;

  return (
    <section className="panel panel-agents">
      <div className="panel-header">
        <h2>Agent Registry</h2>
        <span>{agents.length} available</span>
      </div>

      <ul className="registry-list">
        {agents.map((agent) => (
          <li key={agent.name}>
            <div>
              <strong>{agent.name}</strong>
              <span>{agent.role}</span>
            </div>
            <p>{agent.description}</p>
            <small>{agent.capabilities.join(" / ")}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
