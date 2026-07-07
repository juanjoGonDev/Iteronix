import {
  applyUrlStatePatch,
  readBooleanUrlParam,
  readEnumUrlParam,
  readNonEmptyUrlParam,
} from "../shared/url-state.js";

const ExplorerUrlSection = {
  Explorer: "explorer",
  Search: "search",
} as const;

type ExplorerUrlSection =
  (typeof ExplorerUrlSection)[keyof typeof ExplorerUrlSection];

export type ExplorerUrlState = {
  activeSidebarSection: ExplorerUrlSection | null;
  selectedFilePath: string | null;
  searchQuery: string | null;
  regex: boolean | null;
  matchCase: boolean | null;
  wholeWord: boolean | null;
};

export type ExplorerUrlPatch = {
  activeSidebarSection?: ExplorerUrlSection | null;
  selectedFilePath?: string | null;
  searchQuery?: string | null;
  regex?: boolean | null;
  matchCase?: boolean | null;
  wholeWord?: boolean | null;
};

const ExplorerRoutePath = "/explorer";
const ExplorerUrlParam = {
  Section: "section",
  File: "file",
  Query: "q",
  Regex: "regex",
  MatchCase: "case",
  WholeWord: "word",
} as const;
const ExplorerSections = Object.values(ExplorerUrlSection);

export const readExplorerUrlState = (urlInput: string): ExplorerUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    activeSidebarSection: readEnumUrlParam(
      url.searchParams.get(ExplorerUrlParam.Section),
      ExplorerSections,
    ),
    selectedFilePath: readRelativePathParam(
      url.searchParams.get(ExplorerUrlParam.File),
    ),
    searchQuery: readNonEmptyUrlParam(
      url.searchParams.get(ExplorerUrlParam.Query),
    ),
    regex: readBooleanUrlParam(url.searchParams.get(ExplorerUrlParam.Regex)),
    matchCase: readBooleanUrlParam(
      url.searchParams.get(ExplorerUrlParam.MatchCase),
    ),
    wholeWord: readBooleanUrlParam(
      url.searchParams.get(ExplorerUrlParam.WholeWord),
    ),
  };
};

export const applyExplorerUrlPatch = (
  urlInput: string,
  patch: ExplorerUrlPatch,
): string =>
  applyUrlStatePatch(urlInput, ExplorerRoutePath, {
    [ExplorerUrlParam.Section]: patch.activeSidebarSection,
    [ExplorerUrlParam.File]: patch.selectedFilePath,
    [ExplorerUrlParam.Query]: patch.searchQuery,
    [ExplorerUrlParam.Regex]: writeBooleanParam(patch.regex),
    [ExplorerUrlParam.MatchCase]: writeBooleanParam(patch.matchCase),
    [ExplorerUrlParam.WholeWord]: writeBooleanParam(patch.wholeWord),
  });

export const readExplorerUrlStateFromLocation = (
  location: Location,
): ExplorerUrlState =>
  readExplorerUrlState(
    `${location.pathname}${location.search}${location.hash}`,
  );

const readRelativePathParam = (value: string | null): string | null => {
  const path = readNonEmptyUrlParam(value);
  if (
    path === null ||
    path.includes(":") ||
    path.startsWith("/") ||
    path.startsWith("\\\\")
  ) {
    return null;
  }

  return path.replaceAll("\\", "/");
};

const writeBooleanParam = (
  value: boolean | null | undefined,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value ? "1" : "0";
};
