import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WebUiRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DistPath = resolve(WebUiRoot, "dist");

rmSync(DistPath, { recursive: true, force: true });
