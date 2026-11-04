type Reply = { chatId: number; text: string };

// Preserve reply order without making Telegram polling wait for outbound I/O.
// Delivery errors must not poison the queue or trigger getUpdates backoff.
export function createTelegramReplyQueue(
  send: (reply: Reply) => Promise<unknown>,
  onFailure: (error: unknown) => void,
): (reply: Reply) => void {
  let tail: Promise<unknown> = Promise.resolve();
  return (reply) => {
    tail = tail.then(() => send(reply)).catch(onFailure);
  };
}
