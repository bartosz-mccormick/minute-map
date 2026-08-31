import { expect, test, type Page } from "@playwright/test"
import { gridDisk, latLngToCell } from "h3-js"

const INDICATOR_TRIGGER_NAME = /X-Min City Compliance|Population|Bar:\s*Walking.*Compliance|Bar:\s*Walking.*Time to Nearest|Bar:\s*Walking.*Number of Opportunities/
const HEX_FIXTURE_INDICATORS = [
  { value: "compliance_weighted_avg", label: "X-Min City Compliance" },
  { value: "pop", label: "Population" },
  {
    value: "bar",
    label: "Bar",
    children: [
      {
        value: "bar::walk",
        label: "Walking (4 km/h)",
        children: [
          { value: "bar::walk::compliance", label: "Compliance" },
          { value: "bar::walk::min_travel_time", label: "Time to Nearest" },
          { value: "bar::walk::n_total", label: "Number of Opportunities" },
        ],
      },
    ],
  },
]

function createHexPerformanceFixture(indicator = "compliance_weighted_avg") {
  const centerCell = latLngToCell(48.13481, 11.57471, 9)
  return gridDisk(centerCell, 36).map((h3Cell, index) => {
    const angle = index * 0.017
    const compliance = (Math.sin(angle) + 1) / 2
    const population = 80 + ((index * 13) % 240)
    const travelTime = 4 + ((index * 7) % 27)
    const opportunities = (index * 11) % 31
    const valueByIndicator: Record<string, number> = {
      compliance_weighted_avg: compliance,
      pop: population,
      "bar::walk::compliance": 1 - compliance,
      "bar::walk::min_travel_time": travelTime,
      "bar::walk::n_total": opportunities,
    }
    const value = valueByIndicator[indicator] ?? compliance

    return {
      h3_cell: h3Cell,
      value,
      compliance_weighted_avg: compliance,
      pop: population,
    }
  })
}

async function installHexPerformanceFixture(page: Page) {
  const dataByIndicator = Object.fromEntries(
    [
      "compliance_weighted_avg",
      "pop",
      "bar::walk::compliance",
      "bar::walk::min_travel_time",
      "bar::walk::n_total",
    ].map((indicator) => [indicator, createHexPerformanceFixture(indicator)])
  )

  await page.addInitScript(
    ({ indicators, data }) => {
      ;(window as typeof window & {
        __hexPerformanceFixture?: unknown
      }).__hexPerformanceFixture = {
        indicators,
        getHexData: (indicator: string) => data[indicator] ?? data.compliance_weighted_avg,
      }
    },
    { indicators: HEX_FIXTURE_INDICATORS, data: dataByIndicator }
  )
}

function countChangedBytes(before: Buffer, after: Buffer) {
  const length = Math.min(before.length, after.length)
  let changed = 0

  for (let index = 0; index < length; index += 1) {
    if (before[index] !== after[index]) changed += 1
  }

  return changed
}

async function getMapCanvasSnapshot(page: Page) {
  const mapCanvas = page.locator("canvas.maplibregl-canvas").first()
  await expect(mapCanvas).toBeVisible()
  return mapCanvas.screenshot()
}

async function expectMapDataLoaded(page: Page, triggerName: RegExp | string) {
  await expect(page.getByText("Run analysis to load map data.")).toHaveCount(0)
  await expect(page.getByRole("button", { name: triggerName })).toBeVisible()
  await expect(page.getByText("Full area")).toBeVisible()
}

async function openIndicatorMenu(page: Page) {
  await page.getByRole("button", { name: INDICATOR_TRIGGER_NAME }).click()
}

async function selectTopLevelIndicator(page: Page, label: string) {
  await openIndicatorMenu(page)
  await page.getByRole("menuitem", { name: label, exact: true }).click()
}

async function selectBarWalkIndicator(page: Page, label: string) {
  await openIndicatorMenu(page)
  await page.getByRole("menuitem", { name: "Bar", exact: true }).hover()
  await page.getByRole("menuitem", { name: "Walking (4 km/h)", exact: true }).hover()
  await page.getByRole("menuitem", { name: label, exact: true }).click()
}

test("indicator changes update the hex map canvas", async ({ page }) => {
  const consoleErrors: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text())
    }
  })

  await installHexPerformanceFixture(page)
  await page.goto("/?mapPerfFixture=hex")

  const mapCanvas = page.locator("canvas.maplibregl-canvas").first()
  await expect(mapCanvas).toBeVisible()
  await expect(page.getByText("X-Min City Compliance")).toBeVisible()
  await expectMapDataLoaded(page, "X-Min City Compliance")

  const checks: Array<{
    label: string
    triggerName: RegExp | string
    select: () => Promise<void>
  }> = [
    {
      label: "Population",
      triggerName: "Population",
      select: () => selectTopLevelIndicator(page, "Population"),
    },
    {
      label: "Bar Walking Compliance",
      triggerName: /Bar:\s*Walking.*Compliance/,
      select: () => selectBarWalkIndicator(page, "Compliance"),
    },
    {
      label: "Bar Walking Time to Nearest",
      triggerName: /Bar:\s*Walking.*Time to Nearest/,
      select: () => selectBarWalkIndicator(page, "Time to Nearest"),
    },
    {
      label: "Bar Walking Number of Opportunities",
      triggerName: /Bar:\s*Walking.*Number of Opportunities/,
      select: () => selectBarWalkIndicator(page, "Number of Opportunities"),
    },
  ]

  for (const check of checks) {
    const before = await getMapCanvasSnapshot(page)

    await check.select()
    await expectMapDataLoaded(page, check.triggerName)

    const after = await getMapCanvasSnapshot(page)
    const changedBytes = countChangedBytes(before, after)

    expect(changedBytes, `${check.label} should repaint the map canvas`).toBeGreaterThan(500)
  }

  await expect(page.getByText(/24.*30/)).toBeVisible()
  await expect(page.getByText(/20.*50/)).toHaveCount(0)

  expect(
    consoleErrors.filter((message) => message.includes("DuckDB indicator refresh failed"))
  ).toEqual([])
})
