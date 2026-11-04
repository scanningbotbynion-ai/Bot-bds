import { vi } from "vitest";

// Replace configuration before importing the real API modules. No workspace
// credentials, database connection or published service are used by this suite.
vi.stubEnv("NODE_ENV", "development");
vi.stubEnv("TELEGRAM_SHARED_API_URL", "https://synthetic-upstream.invalid/api");
vi.stubEnv("TELEGRAM_DEV_BOT_ENABLED", "false");
vi.stubEnv("TELEGRAM_BOT_TOKEN", "synthetic-production-token");
vi.stubEnv("TELEGRAM_BOT_TOKEN_2", "synthetic-legacy-token");
vi.stubEnv("TELEGRAM_DEV_BOT_TOKEN", "synthetic-disconnected-token");
vi.stubEnv("TELEGRAM_DEV_BOT_TOKEN_2", "synthetic-disconnected-legacy-token");
vi.stubEnv("ADMIN_IDS", "1001");
