import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import fs from "fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { getUploadsDir } from "./lib/storage.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api/uploads", express.static(getUploadsDir()));
app.use("/api", router);

// ── Fallback: serve built frontend in production, helpful message in dev ─────
// Vite builds to dist/public (see vite.config.ts → build.outDir)
const frontendDist = path.resolve(process.cwd(), "../../app/dist/public");
if (process.env.NODE_ENV === "production" && fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist, { maxAge: "1h" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({
      status: "AI Builder API Server",
      version: "1.0.0",
      note: "The frontend runs on port 5000. Visit the preview URL to access the app.",
      endpoints: ["/api/health", "/api/auth/login", "/api/projects"],
    });
  });
}

export default app;
