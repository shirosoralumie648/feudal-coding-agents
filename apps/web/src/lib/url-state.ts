/**
 * URL state management for the task console.
 * Persists selected task ID and replay event ID to URL search params.
 */

export interface UrlState {
  selectedTaskId?: string;
  replayEventId?: number;
}

const TASK_ID_PARAM = "task";
const REPLAY_EVENT_PARAM = "replay";

export function getUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get(TASK_ID_PARAM) ?? undefined;
  const replayEventStr = params.get(REPLAY_EVENT_PARAM);
  const replayEventId = replayEventStr ? parseInt(replayEventStr, 10) : undefined;

  return {
    selectedTaskId: taskId,
    replayEventId: isNaN(replayEventId ?? NaN) ? undefined : replayEventId
  };
}

export function setUrlState(state: UrlState) {
  const params = new URLSearchParams(window.location.search);

  if (state.selectedTaskId) {
    params.set(TASK_ID_PARAM, state.selectedTaskId);
  } else {
    params.delete(TASK_ID_PARAM);
  }

  if (state.replayEventId !== undefined) {
    params.set(REPLAY_EVENT_PARAM, String(state.replayEventId));
  } else {
    params.delete(REPLAY_EVENT_PARAM);
  }

  const newSearch = params.toString();
  const newUrl = newSearch
    ? `${window.location.pathname}?${newSearch}`
    : window.location.pathname;

  window.history.replaceState(null, "", newUrl);
}

export function updateUrlState(partial: Partial<UrlState>) {
  const current = getUrlState();
  setUrlState({ ...current, ...partial });
}
