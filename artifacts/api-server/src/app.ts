import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// NOTE: `trust proxy` is deliberately left OFF. Trusting X-Forwarded-For
// wholesale would let a caller spoof their address into the THC location
// layer. Client IPs are instead derived by `getClientIp` (src/utils/clientIp),
// which only honors the single forwarded hop appended by the trusted local
// reverse proxy and ignores caller-supplied entries.

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
app.use(cors());
// ScanView captures full-resolution JPEGs with skipProcessing:true (quality
// ignored). Estimated 2–5 MiB JPEG -> 2.7–6.7 MiB base64; 8 MiB allows margin.
// Match the exact route so other endpoints cannot inherit the image allowance.
app.post("/api/identify-bottle", express.json({ limit: "8mb" }),
  express.urlencoded({ extended: true, limit: "8mb" }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);

export default app;
