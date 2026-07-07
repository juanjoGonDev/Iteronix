import { DefaultServerConnection } from "../src/shared/server-config.js";
import {
  WorkflowsEmulationFixture,
  createWorkflowsEmulationDefinition,
} from "./workflows-emulation-fixture.js";

const RoutePath = {
  ProjectsOpen: "/projects/open",
  WorkflowDefinitionsUpsert: "/workflows/definitions/upsert",
} as const;

const EnvKey = {
  ServerUrl: "ITERONIX_SERVER_URL",
  AuthToken: "ITERONIX_AUTH_TOKEN",
  ProjectRoot: "ITERONIX_EMULATION_PROJECT_ROOT",
} as const;

type ProjectResponse = {
  project: {
    id: string;
    name: string;
  };
};

type WorkflowResponse = {
  definition: {
    id: string;
    name: string;
  };
};

const seedWorkflowsEmulation = async (): Promise<void> => {
  const serverUrl = readServerUrl();
  const authToken = readAuthToken();
  const project = readProjectResponse(
    await postJson({
      serverUrl,
      authToken,
      path: RoutePath.ProjectsOpen,
      body: {
        rootPath: readProjectRoot(),
        name: WorkflowsEmulationFixture.ProjectName,
      },
    }),
  );
  const workflow = readWorkflowResponse(
    await postJson({
      serverUrl,
      authToken,
      path: RoutePath.WorkflowDefinitionsUpsert,
      body: {
        projectId: project.project.id,
        definition: createWorkflowsEmulationDefinition({
          projectId: project.project.id,
          workspaceId: project.project.id,
        }),
      },
    }),
  );

  console.log(
    `Seeded ${project.project.name} / ${workflow.definition.name} (${workflow.definition.id})`,
  );
};

const readServerUrl = (): string =>
  trimTrailingSlash(process.env[EnvKey.ServerUrl] ?? "http://127.0.0.1:4001");

const readAuthToken = (): string =>
  process.env[EnvKey.AuthToken] ?? DefaultServerConnection.authToken;

const readProjectRoot = (): string | null =>
  process.env[EnvKey.ProjectRoot] ?? WorkflowsEmulationFixture.ProjectRootPath;

const postJson = async (input: {
  serverUrl: string;
  authToken: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<unknown> => {
  const response = await fetch(`${input.serverUrl}${input.path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    throw new Error(
      `Seed request failed: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
};

const readProjectResponse = (value: unknown): ProjectResponse => {
  const record = readRecord(value);
  const project = readRecord(record["project"]);

  return {
    project: {
      id: readString(project["id"], "project.id"),
      name: readString(project["name"], "project.name"),
    },
  };
};

const readWorkflowResponse = (value: unknown): WorkflowResponse => {
  const record = readRecord(value);
  const definition = readRecord(record["definition"]);

  return {
    definition: {
      id: readString(definition["id"], "definition.id"),
      name: readString(definition["name"], "definition.name"),
    },
  };
};

const readRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Seed response is not an object");
  }

  return Object.fromEntries(Object.entries(value));
};

const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Seed response ${label} is not a string`);
  }

  return value;
};

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

await seedWorkflowsEmulation();
