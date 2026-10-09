import { test, expect } from "@playwright/test";

test("overlapping cameras keep their rental start visible on the 15th", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  await expect(page).toHaveTitle(/Morii/);
  const target = page.locator(
    '.fc-daygrid-event.event-booked[title^="Canon PowerShot G7 X II · 01"]',
  );
  const startCell = page.locator(
    '.fc-daygrid-day:not(.fc-day-other)[data-date$="-15"]',
  );
  const startDate = await startCell.getAttribute("data-date");
  // Start with one camera, then include the second camera and shipping buffers.
  await page
    .getByLabel("กรองกล้อง", { exact: true })
    .selectOption({ label: "CAN-01 · ดำ" });
  await expect(target.first()).toBeVisible();
  const unitColor = await target
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const firstLeft = (await target.first().boundingBox())!.x;
  await page.getByLabel("กรองกล้อง", { exact: true }).selectOption("");
  await expect(page.locator(".fc-daygrid-more-link")).toHaveCount(0);
  await expect(target.first()).toBeVisible();
  expect(
    await target.first().evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(unitColor);
  const colors = await page
    .locator(".fc-daygrid-event.event-camera")
    .evaluateAll((events) =>
      events.map((event) => {
        const style = getComputedStyle(event);
        return {
          unit: (event as HTMLElement).dataset.unitId!,
          buffer: event.classList.contains("event-buffer"),
          background: style.backgroundColor,
          border: style.borderLeftColor,
          text: style.color,
        };
      }),
    );
  const rentals = colors.filter((c) => !c.buffer);
  const unitIds = [...new Set(rentals.map((c) => c.unit))];
  expect(unitIds.length).toBeGreaterThan(2);
  const rentalColors = unitIds.map((id) => {
    const unitRentals = rentals.filter((c) => c.unit === id);
    expect(new Set(unitRentals.map((c) => c.background)).size).toBe(1);
    return unitRentals[0].background;
  });
  expect(new Set(rentalColors).size).toBe(unitIds.length);
  for (const buffer of colors.filter((c) => c.buffer)) {
    const rental = rentals.find((c) => c.unit === buffer.unit)!;
    expect(buffer.border).toBe(rental.border);
    expect(buffer.text).toBe(rental.text);
    const brightness = (color: string) =>
      color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .reduce((a, b) => a + b, 0);
    expect(brightness(buffer.background)).toBeGreaterThan(
      brightness(rental.background),
    );
  }
  const crowdedLeft = (await target.first().boundingBox())!.x;
  const cell = (await startCell.boundingBox())!;
  expect(Math.abs(crowdedLeft - firstLeft)).toBeLessThan(3);
  expect(crowdedLeft).toBeGreaterThanOrEqual(cell.x);
  expect(crowdedLeft).toBeLessThan(cell.x + 12);
  await target.first().click();
  await expect(page.getByLabel("วันเริ่มเช่า", { exact: false })).toHaveValue(
    startDate!,
  );
  await expect(page.getByLabel("วันสิ้นสุดเช่า", { exact: false })).toHaveValue(
    startDate!.replace(/15$/, "17"),
  );
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.screenshot({
    path: `test-results/overlap-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("login entry and owner management preview", async ({ page }, testInfo) => {
  await page.goto("/demo");
  await page.getByRole("link", { name: "เข้าสู่ระบบแอดมิน" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("อีเมล", { exact: true })).toBeVisible();
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: `test-results/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/demo");
  await page.getByRole("link", { name: "จัดการแอดมิน" }).click();
  await expect(
    page.getByRole("heading", { name: "จัดการแอดมิน" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "ปิดสิทธิ์" })).toHaveCount(1);
  await page.getByLabel("ชื่อแอดมิน").fill("Test Admin");
  await page.getByLabel("อีเมล", { exact: true }).fill("test@example.com");
  await page.getByLabel("รหัสผ่านเริ่มต้น").fill("Example-password-123");
  await page.getByRole("button", { name: "เพิ่มแอดมิน", exact: true }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText(
    "หน้าตัวอย่างเท่านั้น",
  );
  await page.getByLabel("ประเภทบัญชี").selectOption("existing");
  await expect(page.getByLabel("รหัสผ่านเริ่มต้น")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/admins-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("calendar filters, editing, navigation and mobile layout", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "ปฏิทินคิวเช่ากล้อง" }),
  ).toBeVisible();
  await expect(page.locator(".fc")).toBeVisible();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".event-lines strong").first()).toBeVisible();
    expect(
      await page
        .locator(".event-lines strong")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).not.toBe("rgb(255, 255, 255)");
  }
  await page.screenshot({
    path: `test-results/initial-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("กรองรุ่นกล้อง")
    .selectOption({ label: "Fujifilm X100V" });
  await expect(page.locator(".fc-daygrid-event").first()).toContainText(
    "Fujifilm",
  );
  await expect(
    page.locator(".fc-daygrid-event").filter({ hasText: "Canon" }),
  ).toHaveCount(0);
  await page.locator(".fc-daygrid-event").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("ชื่อลูกค้า", { exact: false })).not.toBeEmpty();
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.getByLabel("กรองรุ่นกล้อง").selectOption("");
  await page.getByRole("button", { name: "เพิ่มคิวใหม่" }).click();
  await page.getByLabel("ชื่อลูกค้า", { exact: false }).fill("ลูกค้าทดสอบ");
  await page.getByLabel("เบอร์โทร", { exact: false }).fill("0812345678");
  await page.getByLabel("วันเริ่มเช่า", { exact: false }).fill("2030-01-10");
  await page.getByLabel("วันสิ้นสุดเช่า", { exact: false }).fill("2030-01-12");
  await page
    .getByLabel("วิธีส่ง", { exact: false })
    .last()
    .selectOption({ label: "EMS" });
  await expect(page.locator(".range-note")).toContainText("ก่อน 2 / หลัง 2");
  await page.locator(".camera-choice").first().getByRole("checkbox").check();
  await expect(page.locator(".price-input input")).toHaveValue("1200");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/form-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/calendar-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("catalog, settings, dashboard and export remain usable", async ({
  page,
}) => {
  await page.goto("/demo/inventory");
  await expect(
    page.getByRole("heading", { name: "กล้องและอุปกรณ์" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "เพิ่มรุ่นกล้อง", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.goto("/demo/settings");
  await expect(
    page.getByRole("heading", { name: "EMS", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "แก้ไข EMS", exact: true }).click();
  await expect(page.getByLabel("เผื่อก่อนเช่า (วัน)")).toHaveValue("2");
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.goto("/demo/dashboard");
  await expect(
    page.getByRole("heading", { name: "กล้องยอดนิยม" }),
  ).toBeVisible();
  await expect(page.locator(".chart-row").first()).toBeVisible();
  await page.goto("/demo/export");
  await page.getByRole("button", { name: /CSV document/ }).click();
  await expect(
    page.getByRole("button", { name: /CSV document/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("unconfigured protected routes and APIs do not leak demo data", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  const bookings = await request.get(
    "/api/bookings?start=2026-10-01&end=2026-10-31",
  );
  expect(bookings.status()).toBe(503);
  const exported = await request.get(
    "/api/export?format=csv&start=2026-10-01&end=2026-10-31",
  );
  expect(exported.status()).toBe(503);
});
test("calendar rolls into new Bangkok month and year", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-12-31T16:59:30Z") });
  await page.goto("/demo");
  await expect(page.locator(".calendar-navigation h2")).toContainText(
    "ธันวาคม",
  );
  await page.clock.fastForward(61_000);
  await expect(page.locator(".calendar-navigation h2")).toContainText("มกราคม");
});
