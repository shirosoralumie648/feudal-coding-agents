import { expect, test } from "@playwright/test";

test("drives one governance revision loop through approval and completion", async ({
  page
}) => {
  const title = "Governance revision drill";
  const prompt = "Exercise governance #mock:needs_revision-once";

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByLabel("Sensitivity").selectOption("high");
  await page.getByRole("checkbox", { name: "Require approval gate" }).uncheck();
  await page.getByRole("checkbox", { name: "Allow mock fallback" }).check();
  await page.getByRole("button", { name: "Submit task" }).click();

  await expect(page.getByRole("heading", { name: "Governance Inbox" })).toBeVisible();
  await expect(page.locator(".panel-detail .panel-header span")).toHaveText("Needs Revision");
  await expect(page.locator(".panel-detail").getByText("high sensitivity forced approval")).toBeVisible();

  await page
    .getByLabel("Revision note")
    .fill("Revision note: tighten rollback scope and add acceptance criteria.");
  await page.getByRole("button", { name: "Submit revision" }).click();

  const approveButton = page.getByRole("button", { name: `Approve ${title}` });
  await expect(approveButton).toBeVisible();
  await approveButton.click();

  await expect(page.locator(".governance-list")).toContainText("approved");
  await expect(page.locator(".governance-list")).toContainText("1");
  await expect(page.getByText("Verifier accepted the execution report.")).toBeVisible();
  await expect(page.locator(".panel-approval .panel-header span")).toHaveText("0 waiting");
});
