import { expect, test } from "@playwright/test"

type PoiPerfSnapshot = {
  loadPois: number
  viewportPois: number
  renderablePois: number
  markerRows: number
  poiLayers: number
}

declare global {
  interface Window {
    __poiPerf?: {
      reset: () => void
      snapshot: () => PoiPerfSnapshot
    }
  }
}

test("wheel zoom does not reload POI parquet or repeatedly rebuild POI data", async ({ page }) => {
  const parquetRequests: string[] = []

  page.on("request", (request) => {
    const url = request.url()

    if (url.includes(".parquet")) {
      parquetRequests.push(url)
    }
  })

  await page.goto("/")
  await page.getByText("Destination Entrances").waitFor({ state: "visible" })

  const selectAll = page.getByText("Select all")
  await selectAll.click()

  await expect.poll(async () => page.evaluate(() => window.__poiPerf?.snapshot().loadPois ?? 0)).toBe(1)

  const mapCanvas = page.locator("canvas.maplibregl-canvas").first()
  await expect(mapCanvas).toBeVisible()

  const parquetRequestsAfterInitialLoad = parquetRequests.length

  await page.evaluate(() => {
    window.__poiPerf?.reset()
  })

  await mapCanvas.hover()

  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, -300)
  }

  await page.waitForTimeout(1000)

  const counters = await page.evaluate(() => window.__poiPerf?.snapshot())

  expect(parquetRequests.length).toBe(parquetRequestsAfterInitialLoad)
  expect(counters?.loadPois ?? 0).toBe(0)
  expect(counters?.viewportPois ?? 0).toBeLessThanOrEqual(4)
  expect(counters?.renderablePois ?? 0).toBeLessThanOrEqual(4)
  expect(counters?.markerRows ?? 0).toBeLessThanOrEqual(4)
  expect(counters?.poiLayers ?? 0).toBeLessThanOrEqual(4)
})
