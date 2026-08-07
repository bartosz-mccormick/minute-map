import { expect, type Page, test } from "@playwright/test"

type ZoomPerformanceMetrics = {
  durationMs: number
  frameCount: number
  averageFrameGapMs: number
  p95FrameGapMs: number
  maxFrameGapMs: number
  droppedFrameCount: number
  longTaskCount: number
  longTaskDurationMs: number
}

declare global {
  interface Window {
    __mapZoomPerf?: {
      start: () => void
      stop: () => ZoomPerformanceMetrics
    }
  }
}

test.describe.configure({ mode: "serial" })
test.setTimeout(90_000)

async function installZoomPerfProbe(page: Page) {
  await page.evaluate(() => {
    window.__mapZoomPerf = {
      start: () => {
        const frameGaps: number[] = []
        const longTasks: number[] = []
        const startedAt = performance.now()
        let lastFrameAt = startedAt
        let rafId = 0
        let observer: PerformanceObserver | null = null

        const tick = (timestamp: number) => {
          frameGaps.push(timestamp - lastFrameAt)
          lastFrameAt = timestamp
          rafId = window.requestAnimationFrame(tick)
        }

        try {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              longTasks.push(entry.duration)
            }
          })
          observer.observe({ entryTypes: ["longtask"] })
        } catch {
          observer = null
        }

        rafId = window.requestAnimationFrame(tick)

        window.__mapZoomPerf = {
          start: window.__mapZoomPerf?.start ?? (() => {}),
          stop: () => {
            window.cancelAnimationFrame(rafId)
            observer?.disconnect()

            const durationMs = performance.now() - startedAt
            const measuredFrameGaps = frameGaps.slice(1)
            const averageFrameGapMs =
              measuredFrameGaps.reduce((sum, gap) => sum + gap, 0) /
              Math.max(1, measuredFrameGaps.length)
            const sortedFrameGaps = [...measuredFrameGaps].sort((a, b) => a - b)
            const p95Index = Math.min(
              sortedFrameGaps.length - 1,
              Math.max(0, Math.ceil(0.95 * sortedFrameGaps.length) - 1)
            )

            return {
              durationMs,
              frameCount: measuredFrameGaps.length,
              averageFrameGapMs,
              p95FrameGapMs: sortedFrameGaps[p95Index] ?? 0,
              maxFrameGapMs: Math.max(0, ...measuredFrameGaps),
              droppedFrameCount: measuredFrameGaps.filter((gap) => gap > 50).length,
              longTaskCount: longTasks.length,
              longTaskDurationMs: longTasks.reduce((sum, duration) => sum + duration, 0),
            }
          },
        }
      },
      stop: () => ({
        durationMs: 0,
        frameCount: 0,
        averageFrameGapMs: 0,
        p95FrameGapMs: 0,
        maxFrameGapMs: 0,
        droppedFrameCount: 0,
        longTaskCount: 0,
        longTaskDurationMs: 0,
      }),
    }
  })
}

async function measureZoomOutScenario(
  page: Page,
  url: string
): Promise<ZoomPerformanceMetrics> {
  await page.goto(url)
  const mapCanvas = page.locator("canvas.maplibregl-canvas").first()
  await expect(mapCanvas).toBeVisible()
  await page.waitForTimeout(2500)

  await installZoomPerfProbe(page)
  await page.evaluate(() => window.__mapZoomPerf?.start())
  await mapCanvas.hover()

  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(40)
  }

  await page.waitForTimeout(1200)

  const metrics = await page.evaluate(() => window.__mapZoomPerf?.stop())
  if (!metrics) throw new Error("Map zoom performance probe did not return metrics")
  return metrics
}

test("map zoom-out performance stays inside smoothness budget", async ({ page }, testInfo) => {
  const scenarios = [
    { name: "base", url: "/?mapPerfMode=base" },
    { name: "empty-normal", url: "/" },
    { name: "hex-smooth", url: "/?mapPerfFixture=hex" },
    { name: "hex-no-picking", url: "/?mapPerfFixture=hex&hexPerfVariant=no-picking" },
  ]
  const results: Record<string, ZoomPerformanceMetrics> = {}

  for (const scenario of scenarios) {
    results[scenario.name] = await measureZoomOutScenario(page, scenario.url)
  }

  await testInfo.attach("map-zoom-performance.json", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  })

  const smooth = results["hex-smooth"]
  const base = results.base
  const emptyNormal = results["empty-normal"]
  const noPicking = results["hex-no-picking"]
  if (!smooth || !base || !emptyNormal || !noPicking) {
    throw new Error("Missing map zoom performance scenario result")
  }

  console.info("map zoom performance", results)

  expect(smooth.p95FrameGapMs).toBeLessThanOrEqual(260)
  expect(smooth.p95FrameGapMs).toBeLessThanOrEqual(noPicking.p95FrameGapMs * 1.5 + 16)
  expect(emptyNormal.p95FrameGapMs).toBeLessThanOrEqual(base.p95FrameGapMs * 1.5 + 16)
})
