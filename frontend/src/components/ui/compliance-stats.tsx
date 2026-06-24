import * as React from "react"
import ReactECharts from "echarts-for-react"
import { Card, CardContent } from "@/components/ui/card"

type HexItem = {
  pop?: number
  compliance_weighted_avg?: number
  h3_cell?: string
  [key: string]: unknown
}

interface ComplianceStatsProps {
  data: HexItem[]
  /** Bounds for bins (e.g. [0, 0.2, 0.4, 0.6, 0.8, 1] or [0, 5, 10, 15, 20, 25, 30]). Bins are [bounds[i], bounds[i+1]). */
  bounds: number[]
  /** Get the indicator value from a hex item (e.g. compliance or travel time). Null = missing, excluded from stats. */
  getValue: (item: HexItem) => number | null
  onSelectBin: (bin: { min: number; max: number } | null) => void
  /** When 1+ cells are selected (click or polygon), show their distribution in the plot */
  selectedCells?: HexItem[]
  /** Format axis labels (default: one decimal, no trailing .0) */
  formatValue?: (v: number) => string
  className?: string
}

function buildBins(bounds: number[], formatValue: (v: number) => string): { range: string; min: number; max: number }[] {
  return bounds.slice(0, -1).map((min, i) => {
    const max = bounds[i + 1]
    return { range: `${formatValue(min)}–${formatValue(max)}`, min, max }
  })
}

function assignBin(value: number, bins: { min: number; max: number }[]): number {
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i]
    const isLast = i === bins.length - 1
    if (value >= b.min && (value < b.max || (isLast && value === b.max))) return i
  }
  return -1
}

const COLOR_DEFAULT = "#3b82f6"

const defaultFormatValue = (v: number) => v.toFixed(1).replace(/\.0$/, "")

export function ComplianceStats({
  data,
  bounds,
  getValue,
  onSelectBin,
  selectedCells,
  formatValue = defaultFormatValue,
  className = "fixed bottom-4 right-4 z-10 bg-white shadow-lg w-[380px]",
}: ComplianceStatsProps) {
  const bins = React.useMemo(() => buildBins(bounds, formatValue), [bounds, formatValue])

  const stats = React.useMemo(() => {
    const computeStats = (items: HexItem[]) => {
      let totalScore = 0
      let totalPopulation = 0
      const binPop = bins.map(() => 0)
      const values: number[] = []

      items.forEach((item) => {
        const value = getValue(item)
        if (value === null) return
        const pop = item.pop || 0
        const idx = assignBin(value, bins)
        totalScore += pop * value
        totalPopulation += pop
        values.push(value)
        if (idx >= 0) binPop[idx] += pop
      })

      const weightedAvg = totalPopulation > 0 ? totalScore / totalPopulation : 0
      const min = values.length > 0 ? Math.min(...values) : 0
      const max = values.length > 0 ? Math.max(...values) : 0

      return { weightedAvg, binPop, min, max, totalPopulation }
    }

    const all = computeStats(data)
    const selection =
      selectedCells && selectedCells.length > 0 ? computeStats(selectedCells) : null

    return {
      all,
      selection,
      binPop: all.binPop,
      selectionBinPop: selection ? selection.binPop : bins.map(() => 0),
    }
  }, [data, selectedCells, bins, getValue])

  const hasSelection = !!stats.selection

  const chartOption = React.useMemo(() => {
    return {
      grid: { left: 50, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: "category",
        data: bins.map((b) => b.range),
        axisLabel: { rotate: 0, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        name: "Population",
        nameLocation: "middle",
        nameGap: 35,
        nameTextStyle: { fontSize: 12 },
      },
      series: [
        {
          name: "Population",
          type: "bar",
          barWidth: "60%",
          z: 1,
          data: stats.binPop.map((pop) => ({
            value: pop,
            itemStyle: { color: COLOR_DEFAULT },
          })),
        },
        {
          name: "Selection",
          data: stats.selectionBinPop,
          type: "bar",
          itemStyle: { color: "#D20C0C" },
          barWidth: "60%",
          barGap: "-100%",
          z: 2,
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: Array<{ seriesName: string; value: number; name: string }>) => {
          const main = params.find(p => p.seriesName === "Population")
          const sel = params.find(p => p.seriesName === "Selection")
          const mainVal = main?.value ?? 0
          const selVal = sel?.value ?? 0
          const pct = mainVal > 0 ? ((selVal / mainVal) * 100).toFixed(1) : "0.0"
          let text = `${params[0]?.name ?? ""}<br/>Total pop: ${Math.round(mainVal)}`
          if (hasSelection) {
            text += `<br/>Selection: ${Math.round(selVal)} (${pct}%)`
          }
          return text
        },
      },
    }
  }, [stats, hasSelection, bins])

  const onChartEvents = React.useMemo(
    () => ({
      click: (params: { componentType: string; dataIndex?: number; seriesIndex?: number }) => {
        if (
          params.componentType !== "series" ||
          params.dataIndex === undefined ||
          params.seriesIndex !== 0
        ) return
        const bin = bins[params.dataIndex]
        onSelectBin({ min: bin.min, max: bin.max })
      },
    }),
    [onSelectBin, bins]
  )

  if (data.length === 0) return null

  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-2">
        <div className="space-y-1 text-xs text-gray-700 border-b pb-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Full area</span>
            <span>
              Avg = {stats.all.weightedAvg.toFixed(2)} | min = {stats.all.min.toFixed(2)} | max = {stats.all.max.toFixed(2)}
            </span>
          </div>
          {hasSelection && stats.selection && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#D20C0C]" />
                <span className="font-semibold">Selection ({selectedCells!.length} cell{selectedCells!.length === 1 ? "" : "s"})</span>
              </span>
              <span>
                Avg = {stats.selection.weightedAvg.toFixed(2)} | min = {stats.selection.min.toFixed(2)} | max = {stats.selection.max.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <ReactECharts
          option={chartOption}
          style={{ height: "260px", width: "100%" }}
          opts={{ renderer: "canvas" }}
          onEvents={onChartEvents}
        />
      </CardContent>
    </Card>
  )
}
