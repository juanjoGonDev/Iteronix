import {
  clearChildren,
  createElement,
  isHTMLElement,
  selectElement
} from "../shared/dom.js";
import { buildLineNumbers } from "../shared/format.js";

type RepoEntry = {
  path: string;
  type: "file";
};

type RepoFile = {
  language: string;
  content: string;
};

type RepoState = {
  entries: RepoEntry[];
  files: Record<string, RepoFile>;
  selectedPath: string;
};

const defaultRepo: RepoState = {
  entries: [
    { path: "apps/server-api/src/server.ts", type: "file" },
    { path: "apps/server-api/src/projects.ts", type: "file" },
    { path: "packages/domain/src/providers/registry.ts", type: "file" },
    { path: "apps/web-ui/index.html", type: "file" },
    { path: "docs/server-api.md", type: "file" }
  ],
  files: {
    "apps/server-api/src/server.ts": {
      language: "TypeScript",
      content:
        "import { createServer } from \"http\";\nimport { parseRequest } from \"./request\";\n\nexport const startServer = () => {\n  const server = createServer(handle);\n  server.listen(4000);\n};\n\nconst handle = (req, res) => {\n  const request = parseRequest(req);\n  res.writeHead(200);\n  res.end(JSON.stringify(request));\n};"
    },
    "apps/server-api/src/projects.ts": {
      language: "TypeScript",
      content:
        "export const projects = new Map();\n\nexport const addProject = (project) => {\n  projects.set(project.id, project);\n};\n\nexport const listProjects = () => {\n  return Array.from(projects.values());\n};"
    },
    "packages/domain/src/providers/registry.ts": {
      language: "TypeScript",
      content:
        "export const createRegistry = (providers) => {\n  const registry = new Map();\n  providers.forEach((provider) => {\n    registry.set(provider.id, provider);\n  });\n  return registry;\n};"
    },
    "apps/web-ui/index.html": {
      language: "HTML",
      content:
        "<section class=\"repo\">\n  <div class=\"section-heading\">\n    <h3>Repository</h3>\n    <p>Browse the workspace and inspect files.</p>\n  </div>\n</section>"
    },
    "docs/server-api.md": {
      language: "Markdown",
      content:
        "# Server API\n\nRun the server with AUTH_TOKEN and WORKSPACE_ROOTS configured.\n\n## Docker\n\nBuild and run a minimal image with the compiled output."
    }
  },
  selectedPath: "apps/server-api/src/server.ts"
};

export const initRepoScreen = (root: ParentNode): void => {
  const repoTree = selectElement(root, "[data-repo-tree]", isHTMLElement);
  const repoCount = selectElement(root, "[data-repo-count]", isHTMLElement);
  const editorFile = selectElement(root, "[data-editor-file]", isHTMLElement);
  const editorLanguage = selectElement(root, "[data-editor-language]", isHTMLElement);
  const editorContent = selectElement(root, "[data-editor-content]", isHTMLElement);
  const editorLines = selectElement(root, "[data-editor-lines]", isHTMLElement);
  const state: RepoState = {
    entries: [...defaultRepo.entries],
    files: { ...defaultRepo.files },
    selectedPath: defaultRepo.selectedPath
  };

  const renderTree = (): void => {
    if (!repoTree) {
      return;
    }
    clearChildren(repoTree);
    state.entries.forEach((entry) => {
      repoTree.appendChild(buildRepoNode(entry, state.selectedPath, (path) => {
        state.selectedPath = path;
        renderTree();
        renderEditor();
      }));
    });
    if (repoCount) {
      repoCount.textContent = `${state.entries.length} files`;
    }
  };

  const renderEditor = (): void => {
    const file = getRepoFile(state.files, state.selectedPath);
    if (editorFile) {
      editorFile.textContent = file.pathLabel;
    }
    if (editorLanguage) {
      editorLanguage.textContent = file.language;
    }
    if (editorContent) {
      editorContent.textContent = file.content;
    }
    if (editorLines) {
      editorLines.textContent = buildLineNumbers(file.content);
    }
  };

  renderTree();
  renderEditor();
};

const buildRepoNode = (
  entry: RepoEntry,
  selectedPath: string,
  onSelect: (path: string) => void
): HTMLElement => {
  const button = createElement("button", "repo-node");
  button.type = "button";
  button.dataset["path"] = entry.path;
  if (entry.path === selectedPath) {
    button.dataset["active"] = "true";
  }
  const title = createElement("div");
  title.textContent = entry.path.split(/[/\\]/).slice(-1)[0] ?? entry.path;
  const path = createElement("span", "repo-path");
  path.textContent = entry.path;
  button.appendChild(title);
  button.appendChild(path);
  button.addEventListener("click", () => {
    onSelect(entry.path);
  });
  return button;
};

const getRepoFile = (
  files: Record<string, RepoFile>,
  path: string
): { pathLabel: string; language: string; content: string } => {
  const entry = files[path];
  if (!entry) {
    return {
      pathLabel: path,
      language: "Text",
      content: "Select a file from the workspace tree."
    };
  }
  return {
    pathLabel: path,
    language: entry.language,
    content: entry.content
  };
};
