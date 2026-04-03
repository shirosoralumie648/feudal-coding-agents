import { expect, test } from "@playwright/test";

test("creates and approves a task from the control console", async ({ page }) => {
  const title = "Stabilize replay recovery";
  const prompt = "Verify restart recovery and replay reporting in the console.";

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Prompt").fill(prompt);
  const createTaskResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tasks") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Submit task" }).click();
  expect((await createTaskResponse).ok()).toBe(true);

  await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();

  const approveButton = page.getByRole("button", { name: `Approve ${title}` });
  await expect(approveButton).toBeVisible();
  await approveButton.click();

  await expect(page.getByText("Verifier accepted the execution report.")).toBeVisible();
  await expect(page.getByText("0 waiting")).toBeVisible();
});
