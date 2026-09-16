import { config } from "dotenv";
import { resolveRepositoryEnvPath } from "./environment";

config({ path: resolveRepositoryEnvPath(__dirname) });
import { startServer } from "./server";

void startServer().catch((error: unknown) => {
  console.error("server.startup_failed", error);
  process.exitCode = 1;
});
