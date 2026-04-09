import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { optionalAuth } from "./lib/auth";
import { isDatabaseError } from "./lib/db-errors";

const app: Express = express();
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const nativeOrigins = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);

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

if (corsOrigins.length > 0) {
  app.use(
    cors({
      origin(origin, callback) {
        // Allow native app requests (no Origin header) and explicitly listed web origins.
        if (!origin || corsOrigins.includes(origin) || nativeOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Not allowed by CORS"));
      },
    }),
  );
} else {
  app.use(cors());
}

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(optionalAuth);

app.use("/api", router);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode =
    typeof err === "object" && err !== null && "statusCode" in err && typeof (err as { statusCode?: unknown }).statusCode === "number"
      ? ((err as { statusCode: number }).statusCode || 500)
      : 500;
  const message =
    statusCode >= 500 && isDatabaseError(err)
      ? "Database schema is updating. Please retry in a few seconds."
      : err instanceof Error
        ? err.message || "Internal Server Error"
        : "Internal Server Error";

  logger.error({ err }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(statusCode).json({ error: message });
});

export default app;
