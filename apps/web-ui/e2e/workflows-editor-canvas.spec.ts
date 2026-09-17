import { expect, test, type BrowserContext } from "@playwright/test";

const ApiUrl = process.env["ITERONIX_E2E_API_URL"] ?? "http://127.0.0.1:4001";
const Administrator = {
  email: process.env["ITERONIX_ADMIN_EMAIL"] ?? "admin@admin",
  password: process.env["ITERONIX_ADMIN_PASSWORD"] ?? "admin",
} as const;
const SessionCookieName = "iteronix_session";

test("drag from the node palette places a node that stays where it was dropped and tidied", async ({
  page,
  context,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 0) < 1000,
    "the canvas drag journey needs the desktop editor split view",
  );

  const sessionToken = await createIdeSession();
  await setIdeSessionCookie(context, sessionToken);

  await page.goto("/workflows");
  await expect(page.getByTestId("workflows-catalog-root")).toBeVisible();
  await page.getByTestId("workflows-catalog-create").click();
  const editorRoot = page.getByTestId("workflows-editor-root");
  await expect(editorRoot).toBeVisible();

  const canvas = page.getByTestId("workflows-canvas-viewport");
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const nodeCards = page.locator('[data-testid^="workflows-node-card-"]');
  const nodesBefore = await nodeCards.count();

  // The Nodes panel shows the palette without any lecture card above it.
  await expect(
    page.getByTestId("workflows-node-palette-trigger.manual"),
  ).toBeVisible();
  await expect(
    page.getByText("Add the MVP node set to the canvas"),
  ).toHaveCount(0);

  // HTML5 drag from palette to an open canvas spot places the node there.
  await page
    .getByTestId("workflows-node-palette-trigger.manual")
    .dragTo(canvas, {
      targetPosition: {
        x: (canvasBox?.width ?? 800) - 140,
        y: 380,
      },
    });
  await expect(nodeCards).toHaveCount(nodesBefore + 1);

  // Dragging the node by its handle moves it on the canvas (pointer events,
  // not HTML5 DnD) and the drop point is where it stays.
  const movedCard = nodeCards.last();
  const handle = movedCard.locator("[data-drag-handle]").first();
  await expect(handle).toBeVisible();
  const beforeBox = await movedCard.boundingBox();
  expect(beforeBox).not.toBeNull();
  await page.mouse.move((beforeBox?.x ?? 0) + 40, (beforeBox?.y ?? 0) + 40);
  await page.mouse.down();
  await page.mouse.move(
    (beforeBox?.x ?? 0) + 40 + 180,
    (beforeBox?.y ?? 0) + 40 + 140,
    { steps: 10 },
  );
  await page.mouse.up();
  // The unsaved badge proves the drag landed in the draft before we measure.
  await expect(page.getByText("unsaved", { exact: true })).toBeVisible();
  const movedBox = await movedCard.boundingBox();
  expect(movedBox).not.toBeNull();
  expect(movedBox?.x ?? 0).toBeGreaterThan((beforeBox?.x ?? 0) + 120);
  expect(movedBox?.y ?? 0).toBeGreaterThan((beforeBox?.y ?? 0) + 90);

  // Persisted: after save + reload the node is still exactly where it was left.
  await page.getByTestId("workflows-save").click();
  await expect(page.getByText("saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(editorRoot).toBeVisible();
  await expect(nodeCards).toHaveCount(nodesBefore + 1);
  const reloadedBox = await nodeCards.last().boundingBox();
  expect(reloadedBox).not.toBeNull();
  expect(Math.abs((reloadedBox?.x ?? 0) - (movedBox?.x ?? 0))).toBeLessThan(30);
  expect(Math.abs((reloadedBox?.y ?? 0) - (movedBox?.y ?? 0))).toBeLessThan(30);

  // Tidy-up re-lays the whole graph into aligned layers and the layout is
  // persisted as well, mirroring n8n's "Tidy up" + reload behaviour.
  await page.getByTestId("workflows-canvas-tidy-layout").click();
  await expect
    .poll(
      async () => {
        const box = await nodeCards.last().boundingBox();
        if (!box || !reloadedBox) {
          return 0;
        }
        return (
          Math.abs(box.x - reloadedBox.x) + Math.abs(box.y - reloadedBox.y)
        );
      },
      { timeout: 3000 },
    )
    .toBeGreaterThan(10);
  const tidyBox = await nodeCards.last().boundingBox();
  expect(tidyBox).not.toBeNull();

  // After tidy, nodes no longer collide: every card occupies its own space.
  const boxes = [];
  for (let index = 0; index < (await nodeCards.count()); index += 1) {
    const box = await nodeCards.nth(index).boundingBox();
    if (box) boxes.push(box);
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left]!;
      const b = boxes[right]!;
      const overlaps =
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      expect(overlaps, `cards ${left} and ${right} overlap`).toBe(false);
    }
  }

  await page.getByTestId("workflows-save").click();
  await expect(page.getByText("saved", { exact: true })).toBeVisible();
});

const createIdeSession = async (): Promise<string> => {
  const login = await fetch(`${ApiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Administrator),
  });
  if (!login.ok) {
    throw new Error(`Could not create E2E session: ${login.status}`);
  }
  const cookie = login.headers.get("set-cookie");
  const prefix = `${SessionCookieName}=`;
  const raw = cookie?.split(";")[0]?.trim() ?? "";
  const token = raw.startsWith(prefix) ? raw.slice(prefix.length) : "";
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
