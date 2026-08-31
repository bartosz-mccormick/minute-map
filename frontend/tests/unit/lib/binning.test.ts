import { describe, expect, it } from "vitest"
import { buildBins, calculateBinnedStats } from "@/lib/binning"

describe("binning", () => {
  it("builds adjacent bin ranges from bounds", () => {
    expect(buildBins([0, 10, 20, 30])).toEqual([
      { min: 0, max: 10 },
      { min: 10, max: 20 },
      { min: 20, max: 30 },
    ])
  })

  it("calculates population-weighted summaries and population per assigned bin", () => {
    const rows = [
      { value: 10, pop: 2, bin: 0 },
      { value: 20, pop: 3, bin: 1 },
      { value: 30, pop: 0, bin: 1 },
      { value: null, pop: 10, bin: null },
      { value: 40, pop: 5, bin: -1 },
    ]

    expect(calculateBinnedStats(rows, 2, (row) => row.value)).toEqual({
      weightedAvg: 28,
      binPop: [2, 3],
      min: 10,
      max: 40,
      totalPopulation: 10,
    })
  })
})
