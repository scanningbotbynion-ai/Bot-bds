// These are status reads, not submissions: retry on the regular short interval
// instead of React Query's exponential retry backoff delaying an admin decision.
export const reviewStatusPolling = {
  refetchInterval: 250,
  refetchIntervalInBackground: true,
  retry: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;

export const APPROVED_ACCESS_PATH = "/signal-generator";
