import {
  applyUrlStatePatch,
  readEnumUrlParam,
  readNonEmptyUrlParam,
} from "../shared/url-state.js";

const HistoryUrlKind = {
  Run: "run",
  Eval: "eval",
} as const;

type HistoryUrlKind = (typeof HistoryUrlKind)[keyof typeof HistoryUrlKind];

export type HistoryUrlState = {
  selectedKind: HistoryUrlKind | null;
  selectedId: string | null;
  selectedEvidenceSourceId: string | null;
};

export type HistoryUrlPatch = {
  selectedKind?: HistoryUrlKind | null;
  selectedId?: string | null;
  selectedEvidenceSourceId?: string | null;
};

const HistoryRoutePath = "/history";
const HistoryUrlParam = {
  Kind: "kind",
  Id: "id",
  Source: "source",
} as const;
const HistoryKinds = Object.values(HistoryUrlKind);

export const readHistoryUrlState = (urlInput: string): HistoryUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    selectedKind: readEnumUrlParam(
      url.searchParams.get(HistoryUrlParam.Kind),
      HistoryKinds,
    ),
    selectedId: readNonEmptyUrlParam(url.searchParams.get(HistoryUrlParam.Id)),
    selectedEvidenceSourceId: readNonEmptyUrlParam(
      url.searchParams.get(HistoryUrlParam.Source),
    ),
  };
};

export const applyHistoryUrlPatch = (
  urlInput: string,
  patch: HistoryUrlPatch,
): string =>
  applyUrlStatePatch(urlInput, HistoryRoutePath, {
    [HistoryUrlParam.Kind]: patch.selectedKind,
    [HistoryUrlParam.Id]: patch.selectedId,
    [HistoryUrlParam.Source]: patch.selectedEvidenceSourceId,
  });

export const readHistoryUrlStateFromLocation = (
  location: Location,
): HistoryUrlState =>
  readHistoryUrlState(`${location.pathname}${location.search}${location.hash}`);
