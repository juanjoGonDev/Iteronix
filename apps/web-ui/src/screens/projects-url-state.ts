import { GitDiffScope, QualityGateId } from "../shared/workbench-types.js";
import {
  applyUrlStatePatch,
  readEnumUrlParam,
  readListUrlParam,
  readNonEmptyUrlParam,
} from "../shared/url-state.js";

export type ProjectsUrlState = {
  selectedRunId: string | null;
  selectedGates: ReadonlyArray<QualityGateId>;
  selectedGitDiffScope: GitDiffScope | null;
  focusedGitDiffPath: string | null;
};

export type ProjectsUrlPatch = {
  selectedRunId?: string | null;
  selectedGates?: ReadonlyArray<QualityGateId> | null;
  selectedGitDiffScope?: GitDiffScope | null;
  focusedGitDiffPath?: string | null;
};

const ProjectsRoutePath = "/projects";
const ProjectsUrlParam = {
  Run: "run",
  Gates: "gates",
  Diff: "diff",
  Path: "path",
} as const;
const QualityGateValues = Object.values(QualityGateId);
const GitDiffScopeValues = Object.values(GitDiffScope);

export const readProjectsUrlState = (urlInput: string): ProjectsUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    selectedRunId: readNonEmptyUrlParam(
      url.searchParams.get(ProjectsUrlParam.Run),
    ),
    selectedGates: readListUrlParam(
      url.searchParams.get(ProjectsUrlParam.Gates),
      QualityGateValues,
    ),
    selectedGitDiffScope: readEnumUrlParam(
      url.searchParams.get(ProjectsUrlParam.Diff),
      GitDiffScopeValues,
    ),
    focusedGitDiffPath: readRelativePathParam(
      url.searchParams.get(ProjectsUrlParam.Path),
    ),
  };
};

export const applyProjectsUrlPatch = (
  urlInput: string,
  patch: ProjectsUrlPatch,
): string =>
  applyUrlStatePatch(urlInput, ProjectsRoutePath, {
    [ProjectsUrlParam.Run]: patch.selectedRunId,
    [ProjectsUrlParam.Gates]:
      patch.selectedGates === undefined
        ? undefined
        : patch.selectedGates === null || patch.selectedGates.length === 0
          ? null
          : patch.selectedGates.join(","),
    [ProjectsUrlParam.Diff]: patch.selectedGitDiffScope,
    [ProjectsUrlParam.Path]: patch.focusedGitDiffPath,
  });

export const readProjectsUrlStateFromLocation = (
  location: Location,
): ProjectsUrlState =>
  readProjectsUrlState(
    `${location.pathname}${location.search}${location.hash}`,
  );

const readRelativePathParam = (value: string | null): string | null => {
  const path = readNonEmptyUrlParam(value);
  if (path === null || path.includes(":") || path.startsWith("/")) {
    return null;
  }

  return path;
};
