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
    route: ROUTES.OVERVIEW,
    status: "none",
    allowedParams: [],
    forbiddenState: ForbiddenUrlState,
    reason: "Static overview has no reload-useful deep state yet.",
  },
  {
    route: ROUTES.PROJECTS,
    status: "mixed",
    allowedParams: ["run", "gates", "diff", "path"],
    forbiddenState: ForbiddenUrlState,
    reason:
      "Restores selected quality run, gate filters and focused diff path.",
  },
  {
    route: ROUTES.EXPLORER,
    status: "mixed",
    allowedParams: ["section", "file", "q", "regex", "case", "word"],
    forbiddenState: ForbiddenUrlState,
    reason: "Restores sidebar section, relative file path and search flags.",
  },
  {
    route: ROUTES.KANBAN,
    status: "push",
    allowedParams: ["task"],
    forbiddenState: ForbiddenUrlState,
    reason: "Restores selected task modal.",
  },
  {
    route: ROUTES.WORKFLOWS,
    status: "mixed",
    allowedParams: [
      "panel",
      "modal",
      "node",
      "execution",
      "version",
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
    route: ROUTES.HISTORY,
    status: "mixed",
    allowedParams: ["kind", "id", "source"],
    forbiddenState: ForbiddenUrlState,
    reason: "Restores selected run/evaluation and evidence source.",
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

export const getUrlStateRoutePolicy = (
  route: string,
): UrlStateRoutePolicy | undefined =>
  UrlStatePolicies.find((policy) => policy.route === route);

export const validateUrlStateRegistryCoverage = (): ReadonlyArray<string> => {
  const policyRoutes = new Set(UrlStatePolicies.map((policy) => policy.route));
  return RegisteredRouteValues.filter((route) => !policyRoutes.has(route));
};
