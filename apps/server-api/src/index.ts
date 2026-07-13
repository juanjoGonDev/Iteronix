import { config } from "dotenv";
config();
import { startServer } from "./server";

void startServer().catch((error: unknown) => {
  console.error("server.startup_failed", error);
  process.exitCode = 1;
});
