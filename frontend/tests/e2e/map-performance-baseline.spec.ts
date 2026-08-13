import { expect, test } from "@playwright/test"

test("base map diagnostics mode renders only the MapLibre map surface", async ({ page }) => {
  const parquetRequests: string[] = []

  page.on("request", (request) => {
    const url = request.url()

    if (url.includes(".parquet")) {
      parquetRequests.push(url)
    }
  })

  await page.goto("/?mapPerfMode=base")

  const mapCanvas = page.locator("canvas.maplibregl-canvas").first()
  await expect(mapCanvas).toBeVisible()

  await expect(page.getByText("Destination Entrances")).toHaveCount(0)
  await expect(page.getByText("Adjust grid transparency")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Configure" })).toHaveCount(0)
  await expect(page.getByTitle("Make selection")).toHaveCount(0)

  await mapCanvas.hover()

  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, 700)
  }

  await page.waitForTimeout(500)

  expect(parquetRequests).toEqual([])
})
