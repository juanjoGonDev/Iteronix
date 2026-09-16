import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ApiUrl = process.env["ITERONIX_E2E_API_URL"] ?? "http://127.0.0.1:4001";
// The server maintains this account from the environment at startup, so the suite
// signs in with the same values instead of creating the first administrator.
const Administrator = {
  email: process.env["ITERONIX_ADMIN_EMAIL"] ?? "admin@admin",
  password: process.env["ITERONIX_ADMIN_PASSWORD"] ?? "admin",
} as const;
const SessionCookieName = "iteronix_session";
const NavigationSelector = {
  AssetsGroup: "navigation-group-assets",
} as const;

test("loads an authenticated workflow canvas and asset catalog without unauthorized requests", async ({
  page,
  context,
}) => {
  const sessionToken = await createIdeSession();
  await setIdeSessionCookie(context, sessionToken);
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

test("restores an unauthenticated Assets deep link after secure login", async ({
  page,
}) => {
  const assetResponses = observeSuccessfulApiResponses(page, "/assets/");

  await page.goto("/assets/prompts");
  await expect(page.getByTestId("auth-login-root")).toBeVisible();
  await page.getByTestId("auth-login-email").fill(Administrator.email);
  await page.getByTestId("auth-login-password").fill(Administrator.password);
  await page.getByTestId("auth-login-submit").click();

  await expect(page).toHaveURL(/\/assets\/prompts$/);
  await expect(page.getByTestId("prompt-assets-root")).toBeVisible();
  await expect(page.getByTestId("header-user-menu")).toContainText(
    Administrator.email,
  );
  expect(assetResponses.unauthorized).toEqual([]);
  await expect.poll(() => assetResponses.successful.length).toBeGreaterThan(0);
});

test("keeps every grouped Asset route available to an authenticated session", async ({
  page,
  context,
}) => {
  const sessionToken = await createIdeSession();
  await setIdeSessionCookie(context, sessionToken);
  const assetRoutes = [
    { href: "/assets/prompts", root: "prompt-assets-root" },
    { href: "/assets/skills", root: "skill-assets-root" },
    { href: "/assets/memory", root: "memory-assets-root" },
    { href: "/assets/mcp", root: "mcp-assets-root" },
    { href: "/assets/plugins", root: "plugin-assets-root" },
  ] as const;

  await page.goto("/assets/prompts");
  await expect(page.getByTestId("prompt-assets-root")).toBeVisible();
  for (const assetRoute of assetRoutes) {
    await page.locator(`a[href="${assetRoute.href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${assetRoute.href}$`));
    await expect(page.getByTestId(assetRoute.root)).toBeVisible();
  }
});

const createIdeSession = async (): Promise<string> => {
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
