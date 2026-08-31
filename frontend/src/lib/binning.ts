export type BinRange = {
  min: number
  max: number
}

export type BinnedStatsRow = {
  pop?: number
  bin?: number | null
}

export type BinnedStats = {
  weightedAvg: number
  binPop: number[]
  min: number
  max: number
  totalPopulation: number
}

export function buildBins(bounds: readonly number[]): BinRange[] {
  return bounds.slice(0, -1).map((min, index) => ({
    min,
    max: bounds[index + 1],
  }))
}

export function calculateBinnedStats<T extends BinnedStatsRow>(
  rows: readonly T[],
  binCount: number,
  getValue: (row: T) => number | null
): BinnedStats {
  let totalScore = 0
  let totalPopulation = 0
  const binPop = Array.from({ length: binCount }, () => 0)
  const values: number[] = []

  for (const row of rows) {
    const value = getValue(row)
    if (value === null) continue

    const pop = row.pop || 0
    const bin = row.bin ?? -1

    totalScore += pop * value
    totalPopulation += pop
    values.push(value)

    if (bin >= 0 && bin < binPop.length) {
      binPop[bin] += pop
    }
  }

  return {
    weightedAvg: totalPopulation > 0 ? totalScore / totalPopulation : 0,
    binPop,
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    totalPopulation,
  }
}
