export function reviewSubmissionError(error: unknown): string {
  const status = (error as { status?: number; response?: { status?: number } } | null);
  const code = status?.status ?? status?.response?.status;
  if (code === 429) {
    return 'Too many attempts. Please wait five minutes and try again.';
  }
  if (code === 400) {
    return 'Please check your details and accept the review consent.';
  }
  if (code === 503 || code === 502 || code === 504) {
    return 'The review service could not be reached. Please try again shortly or contact Help & Support.';
  }
  return 'Could not submit your review. Check your connection and try again.';
}

export function resolvedReviewStatus(
  data: { status: "pending" | "approved" | "rejected" | "expired" } | undefined,
  error: unknown,
): "pending" | "approved" | "rejected" | "expired" | undefined {
  const apiError = error as { status?: number; response?: { status?: number } } | null;
  // A preview request from before switching to the shared service cannot be
  // decided by the production bot. Release that request so it can be resubmitted.
  if ((apiError?.status ?? apiError?.response?.status) === 404) return "expired";
  return data?.status;
}
