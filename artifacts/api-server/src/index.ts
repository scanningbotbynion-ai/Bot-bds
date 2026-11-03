import app from "./app";
import { initializeAccessKeyState } from "./lib/access-key";
import { logger } from "./lib/logger";
import {
  startPaymentReviewCleanup,
  startTelegramBot,
} from "./lib/telegram-bot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    await initializeAccessKeyState();
  } catch (error) {
    logger.error(
      { err: error },
      "Could not initialize access-key storage. Apply the development database schema and restart.",
    );
    process.exit(1);
  }

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
    startPaymentReviewCleanup();
    startTelegramBot();
  });

  server.on("error", (error) => {
    logger.error({ err: error }, "Error listening on port");
    process.exit(1);
  });
}

void startServer();
