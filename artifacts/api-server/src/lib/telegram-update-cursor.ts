export function hasTelegramBotChanged(
  storedBotId: number | null | undefined,
  currentBotId: number,
): boolean {
  return storedBotId !== currentBotId;
}

export function nextTelegramUpdateOffset(
  storedBotId: number | null | undefined,
  currentBotId: number,
  storedOffset: number,
): number {
  return hasTelegramBotChanged(storedBotId, currentBotId) ? 0 : storedOffset;
}
