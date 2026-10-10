import { test, expect } from "@playwright/test";

test("daily preparation section and pickup/messenger time input integrate with the calendar", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  const daily = page.getByRole("region", {
    name: "เตรียมกล้องวันนี้และพรุ่งนี้",
  });
  await expect(
    daily.getByRole("heading", { name: "ต้องส่งวันนี้", exact: true }),
  ).toBeVisible();
  await expect(
    daily.getByRole("heading", { name: "เตรียมพรุ่งนี้", exact: true }),
  ).toBeVisible();
  const columns = await page.locator(".preparation-column").all();
  const left = (await columns[0].boundingBox())!;
  const right = (await columns[1].boundingBox())!;
  if (testInfo.project.name === "mobile")
    expect(right.y).toBeGreaterThan(left.y + left.height);
  else expect(Math.abs(right.y - left.y)).toBeLessThan(1);
  const stats = (await page.locator(".stat-grid").boundingBox())!;
  expect(stats.y).toBeGreaterThan(left.y + left.height);
  await page.getByRole("button", { name: "เพิ่มคิวใหม่" }).click();
  const time = page.getByLabel("เวลานัดรับ / เวลาส่งแมส", { exact: false });
  await expect(time).toHaveAttribute("type", "time");
  await time.fill("14:30");
  const method = page
    .getByRole("dialog")
    .getByLabel("วิธีส่ง", { exact: false });
  for (const label of ["แมสจากคอน", "แมสจากอ้อม", "นัดรับ"]) {
    await method.selectOption({ label });
    await expect(time).toHaveValue("14:30");
  }
  await method.selectOption({ label: "EMS" });
  await expect(time).toHaveCount(0);
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/preparation-empty-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
