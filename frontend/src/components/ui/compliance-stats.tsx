import * as React from "react"
import ReactECharts from "echarts-for-react"
import { Card, CardContent } from "@/components/ui/card"

type HexItem = {
  pop?: number
  compliance_weighted_avg?: number
}

interface ComplianceStatsProps {
  data: HexItem[]
  selectedBin: { min: number; max: number } | null
  onSelectBin: React.Dispatch<React.SetStateAction<{ min: number; max: number } | null>>
  selectedCellCompliance?: number
  polygonSelectedCells?: HexItem[]
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

export function ComplianceStats({
  data,
  onSelectBin,
  selectedCellCompliance,
  polygonSelectedCells,
}: ComplianceStatsProps) {
  const stats = React.useMemo(() => {
    let totalScore = 0
    let totalPopulation = 0
    const binPop = BINS.map(() => 0)

    data.forEach((item) => {
      const pop = item.pop || 0
      const compliance = item.compliance_weighted_avg || 0
      totalScore += pop * compliance
      totalPopulation += pop
      const idx = assignBin(compliance)
      if (idx >= 0) binPop[idx] += pop
    })

    const weightedAvg = totalPopulation > 0 ? totalScore / totalPopulation : 0

    // Per-bin polygon population (overlay bar heights)
    const polygonBinPop = BINS.map(() => 0)
    if (polygonSelectedCells && polygonSelectedCells.length > 0) {
      polygonSelectedCells.forEach((item) => {
        const compliance = item.compliance_weighted_avg || 0
        const pop = item.pop || 0
        const idx = assignBin(compliance)
        if (idx >= 0) polygonBinPop[idx] += pop
      })
    }

    return {
      weightedAvg,
      binPop,
      polygonBinPop,
      min: data.length > 0 ? Math.min(...data.map(d => d.compliance_weighted_avg || 0)) : 0,
      max: data.length > 0 ? Math.max(...data.map(d => d.compliance_weighted_avg || 0)) : 0,
    }
  }, [data, polygonSelectedCells])

  const hasPolygon = (polygonSelectedCells?.length ?? 0) > 0

  const chartOption = React.useMemo(() => {
    // Single-cell indicator: a thin overlay on the matching bin
    let hoveredBinIndex = -1
    if (!hasPolygon && selectedCellCompliance != null) {
      hoveredBinIndex = assignBin(selectedCellCompliance)
    }
    const hoveredBarData = stats.binPop.map((pop, i) =>
      i === hoveredBinIndex ? pop / 10 : 0
    )

    // Polygon overlay: actual polygon-cell population per bin
    const polygonBarData = stats.polygonBinPop

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
          data: stats.binPop,
          type: "bar",
          itemStyle: { color: "#3b82f6" },
          barWidth: "60%",
          z: 1,
        },
        {
          name: "Selected Cell",
          data: hoveredBarData,
          type: "bar",
          itemStyle: { color: "#1e3a8a" },
          barWidth: "60%",
          barGap: "-100%",
          z: 2,
        },
        {
          name: "Polygon Selection",
          data: polygonBarData,
          type: "bar",
          itemStyle: { color: "#ea580c" },
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
          const poly = params.find(p => p.seriesName === "Polygon Selection")
          const mainVal = main?.value ?? 0
          const polyVal = poly?.value ?? 0
          const pct = mainVal > 0 ? ((polyVal / mainVal) * 100).toFixed(1) : "0.0"
          let text = `${params[0]?.name ?? ""}<br/>Total: ${Math.round(mainVal)}`
          if (hasPolygon) {
            text += `<br/>In polygon: ${Math.round(polyVal)} (${pct}%)`
          }
          return text
        },
      },
    }
  }, [stats, selectedCellCompliance, hasPolygon])

  const onChartEvents = React.useMemo(
    () => ({
      mouseover: (params: { componentType: string; dataIndex?: number }) => {
        if (params.componentType === "series" && params.dataIndex !== undefined) {
          const bin = BINS[params.dataIndex]
          onSelectBin({ min: bin.min, max: bin.max })
        }
      },
      mouseout: () => onSelectBin(null),
    }),
    [onSelectBin]
  )

  if (data.length === 0) return null

  return (
    <Card className="fixed bottom-4 right-4 z-10 bg-white shadow-lg w-[380px]">
      <CardContent className="p-4 space-y-2">
        <div className="text-center font-semibold text-sm border-b pb-2">
          Avg. = {stats.weightedAvg.toFixed(2)} | min = {stats.min.toFixed(2)} | max = {stats.max.toFixed(2)}
        </div>
        {hasPolygon && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pb-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#ea580c]" />
            <span>Polygon selection ({polygonSelectedCells!.length} cells)</span>
          </div>
        )}
        <ReactECharts
          option={chartOption}
          style={{ height: "280px", width: "100%" }}
          opts={{ renderer: "canvas" }}
          onEvents={onChartEvents}
        />
      </CardContent>
    </Card>
  )
}
