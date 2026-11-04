export class RetryableTelegramRequestError extends Error {
  override readonly name = "RetryableTelegramRequestError";
}

export function telegramRequestTimeoutMs(method: string): number {
  if (method === "answerCallbackQuery") return 2_500;
  if (method === "getUpdates") return 30_000;
  if (method === "sendMessage") return 8_000;
  return 15_000;
}

// Callback acknowledgment is idempotent and time-sensitive. Recover from one
// transient failure promptly instead of waiting 15 seconds for a stuck request.
// Never replay sends, commands, expired callbacks, or rate-limited requests.
export async function withCallbackRecovery<T>(
  method: string,
  send: () => Promise<T>,
  onRetry: () => void,
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (
      method !== "answerCallbackQuery" ||
      !(error instanceof RetryableTelegramRequestError)
    ) {
      throw error;
    }
    onRetry();
    return send();
  }
}
