import {
  applyUrlStatePatch,
  readNonEmptyUrlParam,
} from "../shared/url-state.js";

export type KanbanUrlState = {
  selectedTaskId: string | null;
};

export type KanbanUrlPatch = {
  selectedTaskId?: string | null;
};

const KanbanRoutePath = "/kanban";
const KanbanUrlParam = {
  Task: "task",
} as const;

export const readKanbanUrlState = (urlInput: string): KanbanUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    selectedTaskId: readNonEmptyUrlParam(
      url.searchParams.get(KanbanUrlParam.Task),
    ),
  };
};

export const applyKanbanUrlPatch = (
  urlInput: string,
  patch: KanbanUrlPatch,
): string =>
  applyUrlStatePatch(urlInput, KanbanRoutePath, {
    [KanbanUrlParam.Task]: patch.selectedTaskId,
  });

export const readKanbanUrlStateFromLocation = (
  location: Location,
): KanbanUrlState =>
  readKanbanUrlState(`${location.pathname}${location.search}${location.hash}`);
