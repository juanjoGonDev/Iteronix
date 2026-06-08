import {
  type ExplorerFileContentRecord,
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

export type ExplorerOpenFile = {
  path: string;
  pinned: boolean;
};

export const ExplorerPreviewLoadDirection = {
  Previous: "previous",
  Next: "next"
} as const;

export type ExplorerPreviewLoadDirection =
  typeof ExplorerPreviewLoadDirection[keyof typeof ExplorerPreviewLoadDirection];

export type ExplorerPreviewWindowState = {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
};

export type ExplorerSearchResultPath = string;

export const ExplorerTokenKind = {
  Plain: "plain",
  Keyword: "keyword",
  String: "string",
  Number: "number",
  Comment: "comment",
  Property: "property",
  Boolean: "boolean",
  Punctuation: "punctuation"
} as const;

export type ExplorerTokenKind =
  typeof ExplorerTokenKind[keyof typeof ExplorerTokenKind];

export type ExplorerHighlightToken = {
  text: string;
  kind: ExplorerTokenKind;
};

export type ExplorerLanguageTheme = {
  id: string;
  label: string;
  badgeClassName: string;
  accentClassName: string;
  surfaceClassName: string;
};

const ExplorerLanguageId = {
  TypeScript: "typescript",
  JavaScript: "javascript",
  Json: "json",
  Markdown: "markdown",
  Yaml: "yaml",
  Css: "css",
  Html: "html",
  PlainText: "plain-text"
} as const;

type ExplorerLanguageId =
  typeof ExplorerLanguageId[keyof typeof ExplorerLanguageId];

const ScriptKeywordPattern =
  /\b(?:export|class|const|let|var|return|if|else|async|await|import|from|type|interface|extends|implements|new|function|private|public|protected|readonly|static|get|set|null|true|false)\b/g;

const ScriptTokenPattern =
  /\/\/.*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|\b(?:export|class|const|let|var|return|if|else|async|await|import|from|type|interface|extends|implements|new|function|private|public|protected|readonly|static|get|set|null|true|false)\b/g;

const JsonTokenPattern =
  /"(?:\\.|[^"])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g;

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

export const setExplorerTreeExpansion = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  expanded: boolean
): ReadonlyArray<ExplorerTreeNode> =>
  nodes.map((node) =>
    node.kind === ExplorerFileEntryKind.Directory
      ? {
          ...node,
          expanded,
          children: setExplorerTreeExpansion(node.children, expanded)
        }
      : node
  );

export const setExplorerDirectoryExpanded = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  directoryPath: string,
  expanded: boolean
): ReadonlyArray<ExplorerTreeNode> =>
  nodes.map((node) =>
    node.path === directoryPath && node.kind === ExplorerFileEntryKind.Directory
      ? {
          ...node,
          expanded
        }
      : {
          ...node,
          children: setExplorerDirectoryExpanded(
            node.children,
            directoryPath,
            expanded
          )
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

export const openExplorerFile = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  path: string
): ReadonlyArray<ExplorerOpenFile> => {
  const normalizedPath = normalizeExplorerPath(path);
  if (normalizedPath.length === 0) {
    return openFiles;
  }

  if (openFiles.some((entry) => entry.path === normalizedPath)) {
    return openFiles;
  }

  return [...openFiles, {
    path: normalizedPath,
    pinned: false
  }];
};

export const setExplorerFilePinned = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  path: string,
  pinned: boolean
): ReadonlyArray<ExplorerOpenFile> => {
  const normalizedPath = normalizeExplorerPath(path);
  return reorderPinnedExplorerOpenFiles(
    openFiles.map((entry) =>
      entry.path === normalizedPath
        ? {
            ...entry,
            pinned
          }
        : entry
    )
  );
};

export const closeExplorerOpenFile = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  path: string
): ReadonlyArray<ExplorerOpenFile> => {
  const normalizedPath = normalizeExplorerPath(path);
  return openFiles.filter((entry) => entry.path !== normalizedPath);
};

export const closeExplorerFileTabsToLeft = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  path: string
): ReadonlyArray<ExplorerOpenFile> => {
  const normalizedPath = normalizeExplorerPath(path);
  const pivotIndex = openFiles.findIndex((entry) => entry.path === normalizedPath);
  if (pivotIndex < 0) {
    return openFiles;
  }

  return openFiles.slice(pivotIndex);
};

export const closeExplorerFileTabsToRight = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  path: string
): ReadonlyArray<ExplorerOpenFile> => {
  const normalizedPath = normalizeExplorerPath(path);
  const pivotIndex = openFiles.findIndex((entry) => entry.path === normalizedPath);
  if (pivotIndex < 0) {
    return openFiles;
  }

  return openFiles.slice(0, pivotIndex + 1);
};

export const closeAllExplorerOpenFiles = (
  _openFiles?: ReadonlyArray<ExplorerOpenFile>
): ReadonlyArray<ExplorerOpenFile> => [];

export const resolveNextExplorerActiveFilePath = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  activePath: string | null,
  preferredPath?: string
): string | null => {
  const preferred = normalizeExplorerPath(preferredPath ?? "");
  if (preferred.length > 0 && openFiles.some((entry) => entry.path === preferred)) {
    return preferred;
  }

  const normalizedActivePath = normalizeExplorerPath(activePath ?? "");
  if (normalizedActivePath.length === 0) {
    return openFiles[0]?.path ?? null;
  }

  const activeIndex = openFiles.findIndex((entry) => entry.path === normalizedActivePath);
  if (activeIndex >= 0) {
    return openFiles[activeIndex]?.path ?? null;
  }

  const insertionIndex = findExplorerOpenFileInsertionIndex(openFiles, normalizedActivePath);
  if (insertionIndex < openFiles.length) {
    return openFiles[insertionIndex]?.path ?? null;
  }

  return openFiles.at(-1)?.path ?? null;
};

export const readExplorerPreviewWindowRequest = (
  state: ExplorerPreviewWindowState,
  direction: ExplorerPreviewLoadDirection,
  lineCount: number
): {
  startLine: number;
  lineCount: number;
} | null => {
  const normalizedLineCount = Math.max(1, Math.floor(lineCount));

  if (direction === ExplorerPreviewLoadDirection.Previous) {
    if (state.startLine <= 1) {
      return null;
    }

    const startLine = Math.max(1, state.startLine - normalizedLineCount);
    return {
      startLine,
      lineCount: state.startLine - startLine
    };
  }

  if (state.endLine >= state.totalLines) {
    return null;
  }

  return {
    startLine: state.endLine + 1,
    lineCount: Math.min(normalizedLineCount, state.totalLines - state.endLine)
  };
};

export const mergeExplorerPreviewWindow = (
  state: ExplorerPreviewWindowState,
  file: ExplorerFileContentRecord,
  direction: ExplorerPreviewLoadDirection
): ExplorerPreviewWindowState => {
  if (direction === ExplorerPreviewLoadDirection.Previous) {
    return {
      content: joinExplorerPreviewContent(file.content, state.content),
      startLine: file.startLine,
      endLine: state.endLine,
      totalLines: file.totalLines,
      truncated: file.startLine > 1 || state.endLine < file.totalLines
    };
  }

  return {
    content: joinExplorerPreviewContent(state.content, file.content),
    startLine: state.startLine,
    endLine: file.endLine,
    totalLines: file.totalLines,
    truncated: state.startLine > 1 || file.endLine < file.totalLines
  };
};

export const collapseExplorerSearchResultPath = (
  collapsedPaths: ReadonlyArray<ExplorerSearchResultPath>,
  path: string
): ReadonlyArray<ExplorerSearchResultPath> => {
  const normalizedPath = normalizeExplorerPath(path);
  if (normalizedPath.length === 0) {
    return collapsedPaths;
  }

  if (collapsedPaths.includes(normalizedPath)) {
    return collapsedPaths.filter((entry) => entry !== normalizedPath);
  }

  return [...collapsedPaths, normalizedPath];
};

export const isExplorerSearchResultCollapsed = (
  collapsedPaths: ReadonlyArray<ExplorerSearchResultPath>,
  path: string
): boolean => collapsedPaths.includes(normalizeExplorerPath(path));

export const hideExplorerSearchResultPath = (
  hiddenPaths: ReadonlyArray<ExplorerSearchResultPath>,
  path: string
): ReadonlyArray<ExplorerSearchResultPath> => {
  const normalizedPath = normalizeExplorerPath(path);
  if (normalizedPath.length === 0 || hiddenPaths.includes(normalizedPath)) {
    return hiddenPaths;
  }

  return [...hiddenPaths, normalizedPath];
};

export const showExplorerSearchResultPath = (
  hiddenPaths: ReadonlyArray<ExplorerSearchResultPath>,
  path: string
): ReadonlyArray<ExplorerSearchResultPath> =>
  hiddenPaths.filter((entry) => entry !== normalizeExplorerPath(path));

export const filterHiddenExplorerSearchResults = <
  TResult extends { path: string }
>(
  results: ReadonlyArray<TResult>,
  hiddenPaths: ReadonlyArray<ExplorerSearchResultPath>
): ReadonlyArray<TResult> => {
  if (hiddenPaths.length === 0) {
    return results;
  }

  return results.filter(
    (entry) => !hiddenPaths.includes(normalizeExplorerPath(entry.path))
  );
};

export const reconcileExplorerSearchResultPaths = (
  paths: ReadonlyArray<ExplorerSearchResultPath>,
  results: ReadonlyArray<{ path: string }>
): ReadonlyArray<ExplorerSearchResultPath> => {
  const resultPaths = new Set(results.map((entry) => normalizeExplorerPath(entry.path)));
  const uniquePaths: ExplorerSearchResultPath[] = [];

  for (const path of paths) {
    const normalizedPath = normalizeExplorerPath(path);
    if (
      normalizedPath.length > 0 &&
      resultPaths.has(normalizedPath) &&
      !uniquePaths.includes(normalizedPath)
    ) {
      uniquePaths.push(normalizedPath);
    }
  }

  return uniquePaths;
};

export const readExplorerFileLanguage = (path: string): string =>
  readExplorerLanguageTheme(path).label;

export const readExplorerFileIcon = (path: string): string => {
  const languageId = readExplorerLanguageId(path);

  if (
    languageId === ExplorerLanguageId.TypeScript ||
    languageId === ExplorerLanguageId.JavaScript
  ) {
    return "code";
  }

  if (languageId === ExplorerLanguageId.Json) {
    return "data_object";
  }

  if (languageId === ExplorerLanguageId.Markdown) {
    return "article";
  }

  return "description";
};

export const readExplorerLanguageTheme = (path: string): ExplorerLanguageTheme => {
  const languageId = readExplorerLanguageId(path);

  if (languageId === ExplorerLanguageId.TypeScript) {
    return {
      id: languageId,
      label: "TypeScript",
      badgeClassName: "border-sky-400/30 bg-sky-400/10",
      accentClassName: "text-sky-300",
      surfaceClassName: "bg-[#111827]"
    };
  }

  if (languageId === ExplorerLanguageId.JavaScript) {
    return {
      id: languageId,
      label: "JavaScript",
      badgeClassName: "border-yellow-400/30 bg-yellow-400/10",
      accentClassName: "text-yellow-300",
      surfaceClassName: "bg-[#161614]"
    };
  }

  if (languageId === ExplorerLanguageId.Json) {
    return {
      id: languageId,
      label: "JSON",
      badgeClassName: "border-amber-400/30 bg-amber-400/10",
      accentClassName: "text-amber-300",
      surfaceClassName: "bg-[#18141a]"
    };
  }

  if (languageId === ExplorerLanguageId.Markdown) {
    return {
      id: languageId,
      label: "Markdown",
      badgeClassName: "border-violet-400/30 bg-violet-400/10",
      accentClassName: "text-violet-300",
      surfaceClassName: "bg-[#16131f]"
    };
  }

  if (languageId === ExplorerLanguageId.Yaml) {
    return {
      id: languageId,
      label: "YAML",
      badgeClassName: "border-emerald-400/30 bg-emerald-400/10",
      accentClassName: "text-emerald-300",
      surfaceClassName: "bg-[#111816]"
    };
  }

  if (languageId === ExplorerLanguageId.Css) {
    return {
      id: languageId,
      label: "CSS",
      badgeClassName: "border-pink-400/30 bg-pink-400/10",
      accentClassName: "text-pink-300",
      surfaceClassName: "bg-[#18121a]"
    };
  }

  if (languageId === ExplorerLanguageId.Html) {
    return {
      id: languageId,
      label: "HTML",
      badgeClassName: "border-orange-400/30 bg-orange-400/10",
      accentClassName: "text-orange-300",
      surfaceClassName: "bg-[#1a1411]"
    };
  }

  return {
    id: languageId,
    label: "Plain text",
    badgeClassName: "border-slate-400/30 bg-slate-400/10",
    accentClassName: "text-slate-300",
    surfaceClassName: "bg-[#111418]"
  };
};

export const highlightExplorerFileContent = (
  path: string,
  content: string
): ReadonlyArray<ReadonlyArray<ExplorerHighlightToken>> => {
  const lines = content.length > 0 ? content.split(/\r?\n/) : [""];
  const languageId = readExplorerLanguageTheme(path).id;

  return lines.map((line) => {
    if (languageId === ExplorerLanguageId.Json) {
      return highlightJsonLine(line);
    }

    if (
      languageId === ExplorerLanguageId.TypeScript ||
      languageId === ExplorerLanguageId.JavaScript
    ) {
      return highlightScriptLine(line);
    }

    return [createHighlightToken(line, ExplorerTokenKind.Plain)];
  });
};

export const readExplorerTokenClassName = (
  kind: ExplorerTokenKind
): string => {
  if (kind === ExplorerTokenKind.Keyword) {
    return "text-sky-300";
  }

  if (kind === ExplorerTokenKind.String) {
    return "text-emerald-300";
  }

  if (kind === ExplorerTokenKind.Number) {
    return "text-orange-300";
  }

  if (kind === ExplorerTokenKind.Comment) {
    return "text-slate-500";
  }

  if (kind === ExplorerTokenKind.Property) {
    return "text-rose-300";
  }

  if (kind === ExplorerTokenKind.Boolean) {
    return "text-purple-300";
  }

  if (kind === ExplorerTokenKind.Punctuation) {
    return "text-slate-400";
  }

  return "text-slate-100";
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
};

const sortExplorerEntries = (
  entries: ReadonlyArray<ExplorerFileEntryRecord>
): ReadonlyArray<ExplorerFileEntryRecord> =>
  [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === ExplorerFileEntryKind.Directory ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

const reorderPinnedExplorerOpenFiles = (
  openFiles: ReadonlyArray<ExplorerOpenFile>
): ReadonlyArray<ExplorerOpenFile> => {
  const pinned = openFiles.filter((entry) => entry.pinned);
  const unpinned = openFiles.filter((entry) => !entry.pinned);
  return [...pinned, ...unpinned];
};

const findExplorerOpenFileInsertionIndex = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  activePath: string
): number => {
  const exactIndex = openFiles.findIndex((entry) => entry.path === activePath);
  if (exactIndex >= 0) {
    return exactIndex;
  }

  for (let index = 0; index < openFiles.length; index += 1) {
    if (openFiles[index]!.path > activePath) {
      return index;
    }
  }

  return openFiles.length;
};

const readExplorerLanguageId = (path: string): ExplorerLanguageId => {
  const normalized = path.toLowerCase();

  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) {
    return ExplorerLanguageId.TypeScript;
  }

  if (normalized.endsWith(".js") || normalized.endsWith(".jsx")) {
    return ExplorerLanguageId.JavaScript;
  }

  if (normalized.endsWith(".json")) {
    return ExplorerLanguageId.Json;
  }

  if (normalized.endsWith(".md")) {
    return ExplorerLanguageId.Markdown;
  }

  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml")) {
    return ExplorerLanguageId.Yaml;
  }

  if (normalized.endsWith(".css")) {
    return ExplorerLanguageId.Css;
  }

  if (normalized.endsWith(".html")) {
    return ExplorerLanguageId.Html;
  }

  return ExplorerLanguageId.PlainText;
};

const normalizeExplorerPath = (value: string): string => value.trim();

const joinExplorerPreviewContent = (
  left: string,
  right: string
): string => {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  return `${left}\n${right}`;
};

const highlightJsonLine = (
  line: string
): ReadonlyArray<ExplorerHighlightToken> => {
  const tokens: ExplorerHighlightToken[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(JsonTokenPattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push(createHighlightToken(line.slice(lastIndex, start), ExplorerTokenKind.Plain));
    }

    const matchedText = match[0];
    tokens.push(
      createHighlightToken(
        matchedText,
        readJsonTokenKind(line, matchedText, start)
      )
    );
    lastIndex = start + matchedText.length;
  }

  if (lastIndex < line.length) {
    tokens.push(createHighlightToken(line.slice(lastIndex), ExplorerTokenKind.Plain));
  }

  return tokens.length > 0 ? tokens : [createHighlightToken("", ExplorerTokenKind.Plain)];
};

const highlightScriptLine = (
  line: string
): ReadonlyArray<ExplorerHighlightToken> => {
  const tokens: ExplorerHighlightToken[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(ScriptTokenPattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push(createHighlightToken(line.slice(lastIndex, start), ExplorerTokenKind.Plain));
    }

    const matchedText = match[0];
    tokens.push(
      createHighlightToken(matchedText, readScriptTokenKind(matchedText))
    );
    lastIndex = start + matchedText.length;
  }

  if (lastIndex < line.length) {
    tokens.push(createHighlightToken(line.slice(lastIndex), ExplorerTokenKind.Plain));
  }

  return tokens.length > 0 ? tokens : [createHighlightToken("", ExplorerTokenKind.Plain)];
};

const readJsonTokenKind = (
  line: string,
  value: string,
  startIndex: number
): ExplorerTokenKind => {
  if (/^"(?:\\.|[^"])*"$/.test(value)) {
    const nextCharacter = readNextNonWhitespaceCharacter(
      line,
      startIndex + value.length
    );
    return nextCharacter === ":" ? ExplorerTokenKind.Property : ExplorerTokenKind.String;
  }

  if (value === "true" || value === "false" || value === "null") {
    return ExplorerTokenKind.Boolean;
  }

  if (/^-?\d/.test(value)) {
    return ExplorerTokenKind.Number;
  }

  return ExplorerTokenKind.Punctuation;
};

const readScriptTokenKind = (value: string): ExplorerTokenKind => {
  if (value.startsWith("//")) {
    return ExplorerTokenKind.Comment;
  }

  if (value.startsWith("\"") || value.startsWith("'") || value.startsWith("`")) {
    return ExplorerTokenKind.String;
  }

  if (/^\d/.test(value)) {
    return ExplorerTokenKind.Number;
  }

  if (ScriptKeywordPattern.test(value)) {
    ScriptKeywordPattern.lastIndex = 0;
    return value === "true" || value === "false" || value === "null"
      ? ExplorerTokenKind.Boolean
      : ExplorerTokenKind.Keyword;
  }

  ScriptKeywordPattern.lastIndex = 0;
  return ExplorerTokenKind.Plain;
};

const readNextNonWhitespaceCharacter = (
  value: string,
  startIndex: number
): string | undefined => {
  for (let index = startIndex; index < value.length; index += 1) {
    const current = value[index];
    if (current !== undefined && !/\s/.test(current)) {
      return current;
    }
  }

  return undefined;
};

const createHighlightToken = (
  text: string,
  kind: ExplorerTokenKind
): ExplorerHighlightToken => ({
  text,
  kind
});
