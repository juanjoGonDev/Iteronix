import {
  ExplorerFileEntryKind,
  type ExplorerFileEntryRecord
} from "../shared/explorer-client.js";

export type ExplorerTreeNode = {
  path: string;
  name: string;
  kind: ExplorerFileEntryRecord["kind"];
  expanded: boolean;
  loaded: boolean;
  children: ReadonlyArray<ExplorerTreeNode>;
};

export type FlattenedExplorerTreeNode = {
  node: ExplorerTreeNode;
  depth: number;
};

export const buildExplorerTreeNodes = (
  entries: ReadonlyArray<ExplorerFileEntryRecord>
): ReadonlyArray<ExplorerTreeNode> =>
  sortExplorerEntries(entries).map((entry) => ({
    path: entry.path,
    name: entry.name,
    kind: entry.kind,
    expanded: false,
    loaded: entry.kind === ExplorerFileEntryKind.File,
    children: []
  }));

export const mergeExplorerDirectoryChildren = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  directoryPath: string,
  entries: ReadonlyArray<ExplorerFileEntryRecord>
): ReadonlyArray<ExplorerTreeNode> => {
  if (directoryPath.trim().length === 0) {
    return buildExplorerTreeNodes(entries);
  }

  return nodes.map((node) =>
    node.path === directoryPath && node.kind === ExplorerFileEntryKind.Directory
      ? {
          ...node,
          expanded: true,
          loaded: true,
          children: buildExplorerTreeNodes(entries)
        }
      : {
          ...node,
          children: mergeExplorerDirectoryChildren(node.children, directoryPath, entries)
        }
  );
};

export const toggleExplorerDirectory = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  directoryPath: string
): ReadonlyArray<ExplorerTreeNode> =>
  nodes.map((node) =>
    node.path === directoryPath && node.kind === ExplorerFileEntryKind.Directory
      ? {
          ...node,
          expanded: !node.expanded
        }
      : {
          ...node,
          children: toggleExplorerDirectory(node.children, directoryPath)
        }
  );

export const filterExplorerTreeNodes = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  query: string
): ReadonlyArray<ExplorerTreeNode> => {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filteredChildren = filterExplorerTreeNodes(node.children, normalizedQuery);
    const selfMatches = node.name.toLowerCase().includes(normalizedQuery);

    if (!selfMatches && filteredChildren.length === 0) {
      return [];
    }

    return [
      {
        ...node,
        expanded: filteredChildren.length > 0 ? true : node.expanded,
        children: selfMatches ? node.children : filteredChildren
      }
    ];
  });
};

export const flattenExplorerTreeNodes = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  revealAll: boolean = false
): ReadonlyArray<FlattenedExplorerTreeNode> => {
  const flattened: FlattenedExplorerTreeNode[] = [];

  appendFlattenedExplorerNodes(flattened, nodes, 0, revealAll);

  return flattened;
};

export const readExplorerFileLanguage = (path: string): string => {
  const normalized = path.toLowerCase();

  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) {
    return "TypeScript";
  }

  if (normalized.endsWith(".js") || normalized.endsWith(".jsx")) {
    return "JavaScript";
  }

  if (normalized.endsWith(".json")) {
    return "JSON";
  }

  if (normalized.endsWith(".md")) {
    return "Markdown";
  }

  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml")) {
    return "YAML";
  }

  if (normalized.endsWith(".css")) {
    return "CSS";
  }

  if (normalized.endsWith(".html")) {
    return "HTML";
  }

  return "Plain text";
};

const appendFlattenedExplorerNodes = (
  flattened: FlattenedExplorerTreeNode[],
  nodes: ReadonlyArray<ExplorerTreeNode>,
  depth: number,
  revealAll: boolean
): void => {
  for (const node of nodes) {
    flattened.push({
      node,
      depth
    });

    if (node.children.length > 0 && (revealAll || node.expanded)) {
      appendFlattenedExplorerNodes(flattened, node.children, depth + 1, revealAll);
    }
  }
}

const sortExplorerEntries = (
  entries: ReadonlyArray<ExplorerFileEntryRecord>
): ReadonlyArray<ExplorerFileEntryRecord> =>
  [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === ExplorerFileEntryKind.Directory ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
