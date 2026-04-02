export function renderIntakePrompt(input: string) {
  return `Normalize this task into a concise JSON task specification.\n\n${input}`;
}

export function renderAnalystPrompt(input: string) {
  return `Produce a decision brief as JSON.\n\n${input}`;
}

export function renderAuditorPrompt(input: string) {
  return `Review this plan for consistency and risk. Return JSON only.\n\n${input}`;
}

export function renderCriticPrompt(input: string) {
  return `Act as an adversarial reviewer. Return JSON only.\n\n${input}`;
}

export function renderExecutorPrompt(input: string) {
  return `Execute the approved assignment and summarize the result as JSON.\n\n${input}`;
}

export function renderVerifierPrompt(input: string) {
  return `Verify the execution report and return JSON.\n\n${input}`;
}
