import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ApiUrl = process.env["ITERONIX_E2E_API_URL"] ?? "http://127.0.0.1:4001";
// Matches the Docker Compose administrator maintained from the environment,
// so the run never depends on browser bootstrap state.
const Administrator = {
  email: process.env["ITERONIX_ADMIN_EMAIL"] ?? "admin@admin",
  password: process.env["ITERONIX_ADMIN_PASSWORD"] ?? "admin",
} as const;
const SessionCookieName = "iteronix_session";
// The CI stack trusts this throwaway key via ITERONIX_TRUSTED_PLUGIN_IDS (see
// .github/workflows/ci.yml), so the journey never mutates or deletes the
// seeded reference.echo plugin that other specs and workflows depend on.
// It doubles as the end-to-end proof of the operator allowlist wiring:
// ci.yml -> compose.yaml -> server config -> /assets/list -> this select.
const TrustedPluginKey = "e2e.assets.demo";
const ReferencePluginKey = "reference.echo";
const PluginName = "E2E demo plugin";

test("drives the full trusted plugin journey: register, toggle, edit, delete", async ({
  page,
  context,
}) => {
  const sessionToken = await createIdeSession();
  await setIdeSessionCookie(context, sessionToken);
  const assetResponses = observeSuccessfulApiResponses(page, "/assets/");

  const row = page.getByTestId(`plugin-assets-row-${TrustedPluginKey}`);
  await page.goto("/assets/plugins");
  await expect(page.getByTestId("plugin-assets-root")).toBeVisible();
  await expect(row).toBeHidden();
  // The toolbar offers registration whether the workspace is empty or not.
  await expect(page.getByTestId("plugin-assets-create")).toBeVisible();

  await page.getByTestId("plugin-assets-create").click();
  await expect(page.getByTestId("plugin-assets-editor")).toBeVisible();
  const trustedKey = page.getByTestId("plugin-assets-trusted-key");
  // The select is fed by the server's allowlist: the built-in plugin plus the
  // operator-configured key are the only registrable choices.
  await expect(
    trustedKey.locator(`option[value="${ReferencePluginKey}"]`),
  ).toHaveCount(1);
  await expect(
    trustedKey.locator(`option[value="${TrustedPluginKey}"]`),
  ).toHaveCount(1);
  await trustedKey.selectOption(TrustedPluginKey);
  await page.getByTestId("plugin-assets-name").fill(PluginName);
  await page
    .getByTestId("plugin-assets-input-schema")
    .fill('{ "type": "object", "required": ["message"] }');
  // Invalid contracts must block saving with a visible reason, not a silent failure.
  await page.getByTestId("plugin-assets-output-schema").fill("{ broken");
  await expect(
    page.getByTestId("plugin-assets-output-schema-state"),
  ).toContainText("Invalid JSON");
  await expect(page.getByTestId("plugin-assets-save")).toBeDisabled();
  await page
    .getByTestId("plugin-assets-output-schema")
    .fill('{ "type": "object" }');
  await expect(page.getByTestId("plugin-assets-save")).toBeEnabled();
  await page.getByTestId("plugin-assets-save").click();

  await expect(row).toBeVisible();
  await expect(row).toContainText(PluginName);
  await expect(row).toContainText("Enabled");
  await expect(row).toContainText("cap:tool-calls");
  await expect(row).toContainText("Last audit: registered");

  // Saving flips the editor to edit mode; closing returns to the catalog where
  // the row-level controls must be hittable (no overlay interception).
  await page.getByTestId("plugin-assets-editor-close").click();
  await expect(page.getByTestId("plugin-assets-editor")).toBeHidden();

  await page.getByTestId(`plugin-assets-toggle-${TrustedPluginKey}`).click();
  await expect(row).toContainText("Disabled");

  await row.getByRole("button", { name: /Edit/ }).click();
  const editor = page.getByTestId("plugin-assets-editor");
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("plugin-assets-name")).toHaveValue(PluginName);
  await expect(page.getByTestId("plugin-assets-output-schema")).toHaveValue(
    /"type":\s*"object"/,
  );
  await page.getByTestId("plugin-assets-name").fill(`${PluginName} (renamed)`);
  await page.getByTestId("plugin-assets-save").click();
  await expect(row).toContainText(`${PluginName} (renamed)`);
  await expect(row).toContainText("Last audit: updated");
  await page.getByTestId("plugin-assets-editor-close").click();
  await expect(page.getByTestId("plugin-assets-editor")).toBeHidden();

  await page.getByTestId(`plugin-assets-delete-${TrustedPluginKey}`).click();
  const dialog = page.getByTestId("plugin-assets-delete-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("cannot be undone");
  await page.getByTestId("plugin-assets-delete-cancel").click();
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();
  await page.getByTestId(`plugin-assets-delete-${TrustedPluginKey}`).click();
  await page.getByTestId("plugin-assets-delete-confirm").click();
  await expect(row).toBeHidden();

  expect(assetResponses.unauthorized).toEqual([]);
  expect(assetResponses.successful.length).toBeGreaterThanOrEqual(4);

  // The delete really persisted server-side, and the journey left every other
  // asset untouched: a reload shows no demo row but keeps the reference plugin.
  await page.reload();
  await expect(page.getByTestId("plugin-assets-root")).toBeVisible();
  await expect(row).toBeHidden();
  await expect(
    page.getByTestId(`plugin-assets-row-${ReferencePluginKey}`),
  ).toBeVisible();
});

type ObservedResponses = {
  successful: string[];
  unauthorized: string[];
};

const observeSuccessfulApiResponses = (
  page: Page,
  pathFragment: string,
): ObservedResponses => {
  const observation: ObservedResponses = { successful: [], unauthorized: [] };
  page.on("response", (response) => {
    if (!response.url().includes(pathFragment)) return;
    if (response.status() === 401) {
      observation.unauthorized.push(response.url());
      return;
    }
    if (response.ok()) observation.successful.push(response.url());
  });
  return observation;
};

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

const setIdeSessionCookie = async (
  context: BrowserContext,
  sessionToken: string,
): Promise<void> => {
  await context.addCookies([
    {
      name: SessionCookieName,
      value: sessionToken,
      url: new URL(
        process.env["ITERONIX_E2E_BASE_URL"] ?? "http://127.0.0.1:4000",
      ).origin,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
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
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined;
};
