import { ROUTES } from "./constants.js";

type UrlStateMode = "none" | "replace" | "push" | "mixed";

export type UrlStateRoutePolicy = {
  route: string;
  status: UrlStateMode;
  allowedParams: ReadonlyArray<string>;
  forbiddenState: ReadonlyArray<string>;
  reason: string;
};

const ForbiddenUrlState = [
  "secrets",
  "api keys",
  "auth tokens",
  "passwords",
  "draft text",
  "file contents",
  "absolute paths",
  "diff payloads",
  "commit messages",
  "toast state",
  "hover state",
  "drag state",
  "internal focus",
] as const;

const UrlStatePolicies = [
  {
    route: ROUTES.WORKFLOWS,
    status: "none",
    allowedParams: [],
    forbiddenState: ForbiddenUrlState,
    reason:
      "Workflow selection belongs to this catalog route, not query state.",
  },
  {
    route: ROUTES.WORKFLOW_EDITOR,
    status: "mixed",
    allowedParams: [
      "panel",
      "modal",
      "node",
      "asset",
      "execution",
      "version",
      "compare",
      "diff",
      "inputTab",
      "outputTab",
      "inputSource",
      "editor",
      "deepTab",
      "deepOutputTab",
      "regexPattern",
      "regexFlags",
      "action",
    ],
    forbiddenState: ForbiddenUrlState,
    reason: "Restores workflow panels, modals and useful debug/editor state.",
  },
  {
    route: ROUTES.PROMPT_ASSETS,
    status: "push",
    allowedParams: ["mode", "prompt", "version"],
    forbiddenState: ForbiddenUrlState,
    reason:
      "Restores prompt catalog editor selection without serializing drafts.",
  },
  {
    route: ROUTES.SETTINGS,
    status: "replace",
    allowedParams: ["tab", "profile"],
    forbiddenState: ForbiddenUrlState,
    reason: "Restores active settings tab and selected provider profile.",
  },
] as const satisfies ReadonlyArray<UrlStateRoutePolicy>;

const RegisteredRouteValues = Object.values(ROUTES);

export const listUrlStateRoutePolicies =
  (): ReadonlyArray<UrlStateRoutePolicy> => UrlStatePolicies;

export const validateUrlStateRegistryCoverage = (): ReadonlyArray<string> => {
  const policyRoutes = new Set(UrlStatePolicies.map((policy) => policy.route));
  return RegisteredRouteValues.filter((route) => !policyRoutes.has(route));
};
