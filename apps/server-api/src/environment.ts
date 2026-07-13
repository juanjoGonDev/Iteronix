import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

const EnvironmentFileName = ".env";
const WorkspaceManifestFileName = "pnpm-workspace.yaml";

export const resolveRepositoryEnvPath = (
  executionDirectory: string,
): string => {
  return join(findRepositoryRoot(executionDirectory), EnvironmentFileName);
};

const findRepositoryRoot = (executionDirectory: string): string => {
  let candidateDirectory = resolve(executionDirectory);

  while (candidateDirectory !== parse(candidateDirectory).root) {
    if (existsSync(join(candidateDirectory, WorkspaceManifestFileName))) {
      return candidateDirectory;
    }

    candidateDirectory = dirname(candidateDirectory);
  }

  throw new Error("Unable to locate the Iteronix repository root");
};
