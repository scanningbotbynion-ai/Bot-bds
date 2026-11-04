import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { createSharedReviewProxy } from "./lib/shared-review-proxy";

const app: Express = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN?.trim();

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: allowedOrigin || false,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "4kb" }));
app.use(express.urlencoded({ extended: true, limit: "4kb" }));

app.use("/api", createSharedReviewProxy({
  nodeEnv: process.env.NODE_ENV,
  apiUrl: process.env.TELEGRAM_SHARED_API_URL,
}));
app.use("/api", router);

export default app;
