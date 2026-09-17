import express from "express";
import http from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

// API surfaces owned by the server process (see apps/server-api/src/constants.ts).
// The SPA also uses /workflows/:id and /assets/<family> as browser routes, so only
// these exact API shapes are proxied; everything else keeps falling through to
// index.html. This lets the dev server behave like the colocated Docker deployment
// (same-origin UI + API) for any host, not just localhost.
const BackendPort = Number(process.env["ITERONIX_BACKEND_PORT"] ?? "4001");
const ApiRoutePattern =
  /^\/(assets\/(list|upsert|delete|usage)|auth\/|external\/|governance\/|memory\/documents\/|providers\/|settings\/|workflows\/(assets|definitions|executions|providers)\/)/;

const isApiRequest = (request: express.Request): boolean =>
  ApiRoutePattern.test(request.path);

const proxyApiRequest = (
  request: express.Request,
  response: express.Response,
): void => {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: BackendPort,
      method: request.method,
      path: request.originalUrl,
      headers: {
        ...request.headers,
        // The dev proxy stands in for the colocated deployment origin, which the
        // backend already trusts for IDE session cookies by default.
        origin: `http://localhost:${port.toString()}`,
      },
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) {
      response.status(502).json({
        error: {
          message: `Backend is not reachable on 127.0.0.1:${BackendPort.toString()}. Start it with "pnpm dev:server" (PostgreSQL and .env DATABASE_URL must be configured).`,
        },
      });
      return;
    }
    response.destroy();
  });
  request.pipe(upstream);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const port = 4000;

const app = express();

// Enable CORS
app.use(
  (_: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept",
    );
    next();
  },
);

// Set proper MIME types for JS modules
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript");
    } else if (req.path.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css");
    } else if (req.path.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json");
    } else if (req.path.endsWith(".wasm")) {
      res.setHeader("Content-Type", "application/wasm");
    }
    next();
  },
);

// Handle ES module imports without .js extension before static middleware
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Only handle module requests from /dist/ that don't have extensions
    if (req.path.startsWith("/dist/") && !req.path.includes(".")) {
      const jsPath = req.path + ".js";
      const fullPath = join(projectRoot, jsPath);

      // Check if the .js file exists
      if (existsSync(fullPath)) {
        res.setHeader("Content-Type", "application/javascript");
        return res.sendFile(fullPath);
      }
    }
    next();
  },
);

// Proxy API traffic to the backend before static/SPA handling.
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isApiRequest(req)) {
      proxyApiRequest(req, res);
      return;
    }
    next();
  },
);

// Serve static files from project root
app.use(express.static(projectRoot));

// Handle all other routes - serve index.html for SPA routing
app.get("*", (req: express.Request, res: express.Response) => {
  // Don't intercept file requests that should be served by static middleware
  if (req.path.includes(".") && req.path !== "/") {
    res.status(404).send("Not Found");
    return;
  }
  res.sendFile(join(projectRoot, "index.html"));
});

app.listen(port, () => {
  console.log("\n🚀 Iteronix Web UI");
  console.log(`📁 Serving from: ${projectRoot}`);
  console.log(`🌐 Server running at: http://localhost:${port}`);
  console.log(`🔥 Ready for Stagehand interaction`);
  console.log(`📸 Screenshots: ${join(projectRoot, "screenshots")}\n`);
});
