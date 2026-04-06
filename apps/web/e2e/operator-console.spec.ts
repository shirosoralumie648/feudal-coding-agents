import { expect, test } from "@playwright/test";

test("takes over an awaiting approval task from the operator console", async ({
  page
}) => {
  const title = "Operator takeover drill";
  const note = "Take over this task and re-plan it.";

  await page.goto("/");

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Prompt").fill("Create an operator takeover scenario");
  await page.getByRole("button", { name: "Submit task" }).click();

  await expect(page.getByRole("heading", { name: "Operator Console" })).toBeVisible();

  await page.getByLabel("Operator note").fill(note);
  await page.getByRole("button", { name: "Take over task" }).click();

  await expect(page.getByText(note)).toBeVisible();
  await expect(page.locator(".panel-detail .panel-header span")).toHaveText(
    "Awaiting Approval"
  );
  await expect(page.locator(".operator-history")).toContainText("takeover / applied");
});
