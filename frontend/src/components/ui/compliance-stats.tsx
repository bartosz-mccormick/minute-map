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
  onSelectBin: (bin: { min: number; max: number } | null) => void
  /** When 1+ cells are selected (click or polygon), show their distribution in the plot */
  selectedCells?: HexItem[]
}

const BINS = [
  { range: "0-0.2",   min: 0,   max: 0.2 },
  { range: "0.2-0.4", min: 0.2, max: 0.4 },
  { range: "0.4-0.6", min: 0.4, max: 0.6 },
  { range: "0.6-0.8", min: 0.6, max: 0.8 },
  { range: "0.8-1",   min: 0.8, max: 1.0 },
]

function assignBin(compliance: number): number {
  for (let i = 0; i < BINS.length; i++) {
    const b = BINS[i]
    if (compliance >= b.min && compliance < b.max) return i
    if (compliance === 1.0 && b.max === 1.0) return i
  }
  return -1
}

const COLOR_DEFAULT = "#3b82f6"

export function ComplianceStats({
  data,
  onSelectBin,
  selectedCells,
}: ComplianceStatsProps) {
  const stats = React.useMemo(() => {
    const computeStats = (items: HexItem[]) => {
      let totalScore = 0
      let totalPopulation = 0
      const binPop = BINS.map(() => 0)

      items.forEach((item) => {
        const compliance = item.compliance_weighted_avg || 0
        const pop = item.pop || 0
        const idx = assignBin(compliance)
        totalScore += pop * compliance
        totalPopulation += pop
        if (idx >= 0) binPop[idx] += pop
      })

      const weightedAvg = totalPopulation > 0 ? totalScore / totalPopulation : 0
      const min = items.length > 0 ? Math.min(...items.map(d => d.compliance_weighted_avg || 0)) : 0
      const max = items.length > 0 ? Math.max(...items.map(d => d.compliance_weighted_avg || 0)) : 0

      return { weightedAvg, binPop, min, max, totalPopulation }
    }

    const all = computeStats(data)
    const selection =
      selectedCells && selectedCells.length > 0 ? computeStats(selectedCells) : null

    return {
      all,
      selection,
      binPop: all.binPop,
      selectionBinPop: selection ? selection.binPop : BINS.map(() => 0),
    }
  }, [data, selectedCells])

  const hasSelection = !!stats.selection

  const chartOption = React.useMemo(() => {
    return {
      grid: { left: 50, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: "category",
        data: BINS.map(b => b.range),
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
  }, [stats, hasSelection])

  const onChartEvents = React.useMemo(
    () => ({
      click: (params: { componentType: string; dataIndex?: number; seriesIndex?: number }) => {
        if (
          params.componentType !== "series" ||
          params.dataIndex === undefined ||
          params.seriesIndex !== 0
        ) return
        const bin = BINS[params.dataIndex]
        onSelectBin({ min: bin.min, max: bin.max })
      },
    }),
    [onSelectBin]
  )

  if (data.length === 0) return null

  return (
    <Card className="fixed bottom-4 right-4 z-10 bg-white shadow-lg w-[380px]">
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
