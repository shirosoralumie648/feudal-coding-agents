import type {
  TaskAction,
  TaskGovernance,
  TaskRecord,
  TaskRevisionRequest,
  TaskSpec,
  TaskStatus
} from "@feudal/contracts";

export interface ReviewArtifactVerdict {
  reviewer?: string;
  verdict?: string;
  note?: string;
  reasons?: string[];
}

export interface AggregatedReviewVerdict {
  reviewVerdict: TaskGovernance["reviewVerdict"];
  policyReasons: string[];
  revisionRequest?: TaskRevisionRequest;
}

const NO_REVIEW_RESULTS_REASON =
  "no review results available; treated as needs_revision";

export function createTaskGovernance(spec: TaskSpec): TaskGovernance {
  const policyReasons: string[] = [];
  const highSensitivityForcedApproval =
    spec.sensitivity === "high" && spec.requiresApproval === false;

  if (highSensitivityForcedApproval) {
    policyReasons.push("high sensitivity forced approval");
  }

  return {
    requestedRequiresApproval: spec.requiresApproval,
    effectiveRequiresApproval: spec.requiresApproval || spec.sensitivity === "high",
    allowMock: spec.allowMock,
    sensitivity: spec.sensitivity,
    executionMode: spec.allowMock ? "real_with_mock_fallback" : "real",
    policyReasons,
    reviewVerdict: "pending",
    allowedActions: [],
    revisionCount: 0
  };
}

export function allowedActionsForStatus(status: TaskStatus): TaskAction[] {
  if (status === "awaiting_approval") {
    return ["approve", "reject"];
  }

  if (status === "needs_revision") {
    return ["revise"];
  }

  return [];
}

export function syncGovernance(task: TaskRecord): TaskRecord {
  if (!task.governance) {
    return task;
  }

  return {
    ...task,
    governance: {
      ...task.governance,
      allowedActions: allowedActionsForStatus(task.status)
    }
  };
}

export function aggregateReviewVerdict(
  reviews: ReviewArtifactVerdict[]
): AggregatedReviewVerdict {
  if (reviews.length === 0) {
    return {
      reviewVerdict: "needs_revision",
      policyReasons: [NO_REVIEW_RESULTS_REASON],
      revisionRequest: {
        note: NO_REVIEW_RESULTS_REASON,
        reviewerReasons: [NO_REVIEW_RESULTS_REASON],
        createdAt: new Date().toISOString()
      }
    };
  }

  const approvingReviews: ReviewArtifactVerdict[] = [];
  const rejectingReviews: ReviewArtifactVerdict[] = [];
  const revisionReviews: ReviewArtifactVerdict[] = [];
  const explicitRevisionReviews: ReviewArtifactVerdict[] = [];
  const fallbackRevisionReviews: ReviewArtifactVerdict[] = [];

  for (const review of reviews) {
    const normalizedReview = normalizeReviewEntry(review);

    if (normalizedReview.verdict === "approve") {
      approvingReviews.push(normalizedReview);
      continue;
    }

    if (normalizedReview.verdict === "reject") {
      rejectingReviews.push(normalizedReview);
      continue;
    }

    if (normalizedReview.verdict === "needs_revision") {
      revisionReviews.push(normalizedReview);
      explicitRevisionReviews.push(normalizedReview);
      continue;
    }

    revisionReviews.push(normalizedReview);
    fallbackRevisionReviews.push(normalizedReview);
  }

  if (rejectingReviews.length > 0) {
    return {
      reviewVerdict: "rejected",
      policyReasons: rejectingReviews.flatMap((review) =>
        collectRejectReasons(review)
      )
    };
  }

  if (revisionReviews.length > 0) {
    const effectiveRevisionReviews = revisionReviews;
    const reviewerReasons = effectiveRevisionReviews.flatMap((review) =>
      collectRevisionReasons(review)
    );

    return {
      reviewVerdict: "needs_revision",
      policyReasons: reviewerReasons,
      revisionRequest: {
        note: selectRevisionNote(
          explicitRevisionReviews,
          fallbackRevisionReviews,
          reviewerReasons
        ),
        reviewerReasons,
        createdAt: new Date().toISOString()
      }
    };
  }

  if (approvingReviews.length > 0) {
    return {
      reviewVerdict: "approved",
      policyReasons: []
    };
  }

  return {
    reviewVerdict: "needs_revision",
    policyReasons: [NO_REVIEW_RESULTS_REASON],
    revisionRequest: {
      note: NO_REVIEW_RESULTS_REASON,
      reviewerReasons: [NO_REVIEW_RESULTS_REASON],
      createdAt: new Date().toISOString()
    }
  };
}

function collectRejectReasons(review: ReviewArtifactVerdict): string[] {
  const note = normalizeOptionalText(review.note);
  const reasons = normalizeReasons(review.reasons);

  if (note || reasons.length > 0) {
    return [...(note ? [note] : []), ...reasons];
  }

  return [`${reviewerLabel(review)}: review rejected without additional rationale`];
}

function collectRevisionReasons(review: ReviewArtifactVerdict): string[] {
  const reasons = normalizeReasons(review.reasons);

  if (review.verdict === "needs_revision") {
    const note = normalizeOptionalText(review.note);

    if (reasons.length > 0) {
      return reasons;
    }

    if (note) {
      return [note];
    }

    return [`${reviewerLabel(review)}: review requested revision without additional rationale`];
  }

  const fallbackReason = `${reviewerLabel(review)}: invalid or missing review verdict treated as needs_revision`;
  return [fallbackReason, ...reasons];
}

function selectRevisionNote(
  explicitRevisionReviews: ReviewArtifactVerdict[],
  fallbackRevisionReviews: ReviewArtifactVerdict[],
  reviewerReasons: string[]
): string {
  for (const review of explicitRevisionReviews) {
    const note = normalizeOptionalText(review.note);

    if (note) {
      return note;
    }
  }

  for (const review of fallbackRevisionReviews) {
    const note = normalizeOptionalText(review.note);

    if (note) {
      return note;
    }
  }

  if (reviewerReasons.length > 0) {
    return reviewerReasons[0];
  }

  return "Review requested revision. Address feedback and submit a revision note.";
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeReasons(reasons: string[] | undefined): string[] {
  if (!Array.isArray(reasons)) {
    return [];
  }

  return reasons
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0);
}

function normalizeReviewEntry(
  review: unknown
): ReviewArtifactVerdict {
  if (!review || typeof review !== "object") {
    return {};
  }

  return review;
}

function reviewerLabel(review: ReviewArtifactVerdict): string {
  const reviewer = normalizeOptionalText(review.reviewer);
  return reviewer ?? "unknown reviewer";
}
