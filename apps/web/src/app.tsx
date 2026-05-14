import { AgentRegistryPanel } from "./components/agent-registry-panel";
import { AlertPanel } from "./components/alert-panel";
import { AnalyticsDashboard } from "./components/analytics-dashboard";
import { ApprovalInboxPanel } from "./components/approval-inbox-panel";
import { AuditTrailViewer } from "./components/audit-trail-viewer";
import { DiffInspectorPanel } from "./components/diff-inspector-panel";
import { NewTaskPanel } from "./components/new-task-panel";
import { OperatorQueuePanel } from "./components/operator-queue-panel";
import { PluginEcosystemPanel } from "./components/plugin-ecosystem-panel";
import { TaskDetailPanel } from "./components/task-detail-panel";
import { TimelinePanel } from "./components/timeline-panel";
import { useTaskConsole } from "./hooks/use-task-console";
import { laneLabels, laneOrder } from "./lib/task-lanes";

export function App() {
  const {
    activeGovernanceId,
    activeOperatorAction,
    agents,
    awaitingTasks,
    canSubmit,
    draft,
    error,
    governanceTasks,
    governanceErrorByTaskId,
    handleDraftChange,
    handleGovernanceAction,
    handleOperatorAction,
    handleReplay,
    handleTaskSubmit,
    isSubmitting,
    operatorDrafts,
    operatorErrorByTaskId,
    operatorSummary,
    recoveryCount,
    recoveryLabel,
    revisionDrafts,
    selectedReplayTask,
    selectedTask,
    selectedTaskDiffs,
    selectedTaskEvents,
    selectedTaskOperatorActions,
    selectTask,
    setDraft,
    setOperatorDrafts,
    setRevisionDrafts,
    tasks
  } = useTaskConsole();

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Codex Cluster / ACP Control Plane</p>
        <h1>Repository Governance Console</h1>
        <p className="lede">
          Watch one task move through the feudal workflow with visible approvals,
          artifacts, and agent accountability.
        </p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <AlertPanel />

      <main className="console-grid">
        <section className="panel panel-overview">
          <div className="panel-header">
            <h2>Overview</h2>
            <span>{tasks.length} active tasks</span>
          </div>

          <div className="metric-row">
            <article>
              <strong>{awaitingTasks.length}</strong>
              <span>Awaiting approval</span>
            </article>
            <article>
              <strong>{agents.length}</strong>
              <span>Discovered agents</span>
            </article>
            <article>
              <strong>{selectedTask?.runs.length ?? 0}</strong>
              <span>Tracked ACP runs</span>
            </article>
            <article>
              <strong>{recoveryCount}</strong>
              <span>{recoveryLabel}</span>
            </article>
          </div>

          <div className="lane-grid" aria-label="Workflow swimlanes">
            {laneOrder.map((status) => {
              const current = tasks.filter((task) => task.status === status).length;

              return (
                <article key={status} className="lane-card">
                  <span>{laneLabels[status]}</span>
                  <strong>{current}</strong>
                </article>
              );
            })}
          </div>
        </section>

        <AnalyticsDashboard />
        <PluginEcosystemPanel />
        <NewTaskPanel
          canSubmit={canSubmit}
          draft={draft}
          isSubmitting={isSubmitting}
          onSubmit={handleTaskSubmit}
          onDraftChange={handleDraftChange}
          onAllowMockChange={(checked) =>
            setDraft((current) => ({ ...current, allowMock: checked }))
          }
          onRequiresApprovalChange={(checked) =>
            setDraft((current) => ({ ...current, requiresApproval: checked }))
          }
        />
        <OperatorQueuePanel
          disabled={Boolean(activeOperatorAction)}
          activeTaskId={selectedTask?.id}
          onSelectTask={(taskId) => {
            if (activeOperatorAction) {
              return;
            }

            selectTask(taskId);
          }}
          summary={operatorSummary}
        />
        <TaskDetailPanel
          laneLabels={laneLabels}
          operatorActions={selectedTaskOperatorActions}
          operatorError={selectedTask ? operatorErrorByTaskId[selectedTask.id] : undefined}
          operatorNote={selectedTask ? operatorDrafts[selectedTask.id] ?? "" : ""}
          operatorPending={Boolean(activeOperatorAction)}
          onOperatorNoteChange={(value) => {
            if (!selectedTask) {
              return;
            }

            setOperatorDrafts((current) => ({ ...current, [selectedTask.id]: value }));
          }}
          onRecover={() =>
            selectedTask
              ? handleOperatorAction(selectedTask.id, "recover")
              : Promise.resolve()
          }
          onTakeover={() =>
            selectedTask
              ? handleOperatorAction(selectedTask.id, "takeover")
              : Promise.resolve()
          }
          onAbandon={() =>
            selectedTask
              ? handleOperatorAction(selectedTask.id, "abandon")
              : Promise.resolve()
          }
          onRevisionNoteChange={(value) => {
            if (!selectedTask) {
              return;
            }

            setRevisionDrafts((current) => ({ ...current, [selectedTask.id]: value }));
          }}
          onSubmitRevision={() =>
            selectedTask
              ? handleGovernanceAction(
                  selectedTask.id,
                  "revise",
                  revisionDrafts[selectedTask.id]?.trim()
                )
              : Promise.resolve()
          }
          revisionError={selectedTask ? governanceErrorByTaskId[selectedTask.id] : undefined}
          revisionNote={selectedTask ? revisionDrafts[selectedTask.id] ?? "" : ""}
          revisionPending={activeGovernanceId === selectedTask?.id}
          selectedTask={selectedTask}
        />
        <TimelinePanel
          events={selectedTaskEvents}
          onReplay={(eventId) =>
            selectedTask ? handleReplay(selectedTask.id, eventId) : undefined
          }
          replayTask={selectedReplayTask}
          taskTitle={selectedTask?.title ?? "Task"}
        />
        <AuditTrailViewer />
        <DiffInspectorPanel diffs={selectedTaskDiffs} />
        <ApprovalInboxPanel
          activeTaskId={activeGovernanceId}
          errorByTaskId={governanceErrorByTaskId}
          onGovernanceAction={handleGovernanceAction}
          tasks={governanceTasks}
        />
        <AgentRegistryPanel agents={agents} />
      </main>
    </div>
  );
}
