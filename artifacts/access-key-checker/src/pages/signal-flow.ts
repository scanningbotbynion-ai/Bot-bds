export const brokerOptions = ["Quotex", "Pocket Option", "Binomo"] as const;
export const marketOptions = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CHF",
  "USD/CAD",
  "AUD/USD",
  "NZD/USD",
  "EUR/JPY",
  "GBP/JPY",
  "USD/PKR",
  "EUR/USD (OTC)",
  "GBP/USD (OTC)",
  "USD/JPY (OTC)",
  "USD/CHF (OTC)",
  "USD/CAD (OTC)",
  "AUD/USD (OTC)",
  "NZD/USD (OTC)",
  "EUR/JPY (OTC)",
  "GBP/JPY (OTC)",
  "USD/PKR (OTC)",
] as const;
export const timeframeOptions = ["5s", "15s", "30s", "1m", "5m"] as const;

export type Broker = (typeof brokerOptions)[number];
export type Market = (typeof marketOptions)[number];
export type Timeframe = (typeof timeframeOptions)[number];
export type SignalDirection = "UP" | "DOWN";

export type SignalSettings = {
  broker: Broker;
  market: Market;
  timeframe: Timeframe;
};

export type ActiveSignal = SignalSettings & {
  direction: SignalDirection;
  generatedAt: number;
  expiresAt: number;
};

const SETTINGS_KEY = "chinese-auto-bot.signal-settings";
const ACTIVE_SIGNAL_KEY = "chinese-auto-bot.active-signal";

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readSignalSettings(): SignalSettings | null {
  try {
    const raw = getStorage()?.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (
      !isOneOf(candidate.broker, brokerOptions) ||
      !isOneOf(candidate.market, marketOptions) ||
      !isOneOf(candidate.timeframe, timeframeOptions)
    ) return null;
    return { broker: candidate.broker, market: candidate.market, timeframe: candidate.timeframe };
  } catch {
    return null;
  }
}

export function saveSignalSettings(settings: SignalSettings): void {
  const storage = getStorage();
  if (!storage) throw new Error("Session storage is unavailable.");
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function saveActiveSignal(signal: ActiveSignal): void {
  const storage = getStorage();
  if (!storage) throw new Error("Session storage is unavailable.");
  storage.setItem(ACTIVE_SIGNAL_KEY, JSON.stringify(signal));
}

export function readActiveSignal(): ActiveSignal | null {
  try {
    const raw = getStorage()?.getItem(ACTIVE_SIGNAL_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (
      !isOneOf(candidate.broker, brokerOptions) ||
      !isOneOf(candidate.market, marketOptions) ||
      !isOneOf(candidate.timeframe, timeframeOptions) ||
      (candidate.direction !== "UP" && candidate.direction !== "DOWN") ||
      typeof candidate.generatedAt !== "number" ||
      typeof candidate.expiresAt !== "number" ||
      !Number.isFinite(candidate.generatedAt) ||
      !Number.isFinite(candidate.expiresAt)
    ) return null;
    return candidate as ActiveSignal;
  } catch {
    return null;
  }
}

export function clearActiveSignal(): void {
  try {
    getStorage()?.removeItem(ACTIVE_SIGNAL_KEY);
  } catch {
    // Returning to the generator must still work if storage becomes unavailable.
  }
}

export function timeframeDurationSeconds(timeframe: Timeframe): number {
  return { "5s": 5, "15s": 15, "30s": 30, "1m": 60, "5m": 300 }[timeframe];
}
