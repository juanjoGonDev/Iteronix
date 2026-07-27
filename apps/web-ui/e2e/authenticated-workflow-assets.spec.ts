import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ApiUrl = process.env["ITERONIX_E2E_API_URL"] ?? "http://127.0.0.1:4001";
const AuthToken =
  process.env["ITERONIX_E2E_AUTH_TOKEN"] ??
  process.env["AUTH_TOKEN"] ??
  "iteronix_e2e_token";
const Administrator = {
  email: "e2e-admin@iteronix.test",
  password: "CorrectHorseBatteryStaple1",
} as const;
const SessionCookieName = "iteronix_session";
const NavigationSelector = {
  AssetsGroup: "navigation-group-assets",
} as const;
const ExistingAdministratorStatus = 400;
const ExistingAdministratorMessage = "Administrator already exists";

test.beforeEach(async ({ context }) => {
  const sessionToken = await createIdeSession();
  await setIdeSessionCookie(context, sessionToken);
});

test("loads an authenticated workflow canvas and asset catalog without unauthorized requests", async ({
  page,
}) => {
  const workflowResponses = observeSuccessfulApiResponses(page, "/workflows/");
  await page.goto("/workflows");
  await expect(page.getByTestId("workflows-catalog-root")).toBeVisible();
  await expect(page.getByTestId("workflows-catalog-create")).toBeVisible();

  await page.getByTestId("workflows-catalog-create").click();
  await expect(page).toHaveURL(/\/workflows\/[^/]+$/);
  await expect(page.getByTestId("workflows-editor-root")).toBeVisible();
  await expect(page.getByTestId("workflows-canvas-viewport")).toBeVisible();
  expect(workflowResponses.unauthorized).toEqual([]);
  expect(workflowResponses.successful).not.toEqual([]);

  const assetResponses = observeSuccessfulApiResponses(page, "/assets/");
  await page.getByTestId(NavigationSelector.AssetsGroup).click();
  await expect(
    page.getByTestId(NavigationSelector.AssetsGroup),
  ).toHaveAttribute("aria-expanded", "true");
  await page.locator('a[href="/assets/prompts"]').click();
  await expect(page).toHaveURL(/\/assets\/prompts$/);
  await expect(page.getByTestId("prompt-assets-root")).toBeVisible();
  await expect(page.getByTestId("prompt-assets-create")).toBeVisible();
  expect(assetResponses.unauthorized).toEqual([]);
  await expect.poll(() => assetResponses.successful.length).toBeGreaterThan(0);
});

const createIdeSession = async (): Promise<string> => {
  const bootstrap = await postJson("/auth/bootstrap-admin", Administrator, {
    Authorization: `Bearer ${AuthToken}`,
  });
  if (!bootstrap.ok && !(await isExistingAdministratorResponse(bootstrap))) {
    throw new Error(
      `Could not bootstrap E2E administrator: ${bootstrap.status}`,
    );
  }

  const login = await postJson("/auth/login", Administrator);
  if (!login.ok) {
    throw new Error(`Could not create E2E session: ${login.status}`);
  }
  const cookie = login.headers.get("set-cookie");
  const token = readCookieValue(cookie, SessionCookieName);
  if (!token) {
    throw new Error("E2E login response did not set an IDE session cookie.");
  }
  return token;
};

const isExistingAdministratorResponse = async (
  response: Response,
): Promise<boolean> => {
  if (response.status !== ExistingAdministratorStatus) return false;
  const body: unknown = await response.json().catch(() => null);
  const error = isRecord(body) ? body["error"] : null;
  return isRecord(error) && error["message"] === ExistingAdministratorMessage;
};

const postJson = (
  path: string,
  body: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> =>
  fetch(`${ApiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const readCookieValue = (
  header: string | null,
  name: string,
): string | undefined => {
  if (!header) return undefined;
  const prefix = `${name}=`;
  const value = header.split(";")[0] ?? "";
  return value.startsWith(prefix)
    ? decodeURIComponent(value.slice(prefix.length))
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const setIdeSessionCookie = async (
  context: BrowserContext,
  value: string,
): Promise<void> => {
  await context.addCookies([
    {
      name: SessionCookieName,
      value,
      url: ApiUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
};

const observeSuccessfulApiResponses = (
  page: Page,
  pathFragment: string,
): { successful: number[]; unauthorized: number[] } => {
  const successful: number[] = [];
  const unauthorized: number[] = [];
  page.on("response", (response) => {
    if (!response.url().includes(pathFragment)) return;
    if (response.status() === 401) unauthorized.push(response.status());
    if (response.ok()) successful.push(response.status());
  });
  return { successful, unauthorized };
};
