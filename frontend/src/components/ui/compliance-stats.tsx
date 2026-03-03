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
  selectedBin: { min: number; max: number } | null
  onSelectBin: React.Dispatch<React.SetStateAction<{ min: number; max: number } | null>>
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

const COLOR_DEFAULT  = "#3b82f6"
const COLOR_SELECTED = "#1d4ed8"

export function ComplianceStats({
  data,
  selectedBin,
  onSelectBin,
  selectedCells,
}: ComplianceStatsProps) {
  // Derive selected bin index from the selectedBin prop (single source of truth)
  const selectedBinIndex = React.useMemo(() => {
    if (!selectedBin) return -1
    return BINS.findIndex(b => b.min === selectedBin.min && b.max === selectedBin.max)
  }, [selectedBin])

  // Stable refs to avoid stale closures in event handlers
  const selectedBinRef = React.useRef(selectedBin)
  const dataRef = React.useRef(data)
  React.useEffect(() => { selectedBinRef.current = selectedBin }, [selectedBin])
  React.useEffect(() => { dataRef.current = data }, [data])

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

    const selectionBinPop = BINS.map(() => 0)
    if (selectedCells && selectedCells.length > 0) {
      selectedCells.forEach((item) => {
        const compliance = item.compliance_weighted_avg || 0
        const pop = item.pop || 0
        const idx = assignBin(compliance)
        if (idx >= 0) selectionBinPop[idx] += pop
      })
    }

    return {
      weightedAvg,
      binPop,
      selectionBinPop,
      min: data.length > 0 ? Math.min(...data.map(d => d.compliance_weighted_avg || 0)) : 0,
      max: data.length > 0 ? Math.max(...data.map(d => d.compliance_weighted_avg || 0)) : 0,
    }
  }, [data, selectedCells])

  const hasSelection = (selectedCells?.length ?? 0) > 0

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
          // Per-item styling: selected bar is darker with a top border
          data: stats.binPop.map((pop, i) => ({
            value: pop,
            itemStyle: {
              color: i === selectedBinIndex ? COLOR_SELECTED : COLOR_DEFAULT,
              borderColor: i === selectedBinIndex ? "#1e3a8a" : "transparent",
              borderWidth: i === selectedBinIndex ? 2 : 0,
            },
          })),
        },
        {
          name: "Selection",
          data: stats.selectionBinPop,
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
  }, [stats, selectedBinIndex, hasSelection])

  const onChartEvents = React.useMemo(
    () => ({
      click: (params: { componentType: string; dataIndex?: number; seriesIndex?: number }) => {
        // Only respond to clicks on the main Population bars (series 0)
        if (
          params.componentType !== "series" ||
          params.dataIndex === undefined ||
          params.seriesIndex !== 0
        ) return

        const bin = BINS[params.dataIndex]
        const cur = selectedBinRef.current

        // Toggle: clicking the already-selected bin deselects it
        const isAlreadySelected = cur !== null && cur.min === bin.min && cur.max === bin.max
        if (isAlreadySelected) {
          onSelectBin(null)
          console.log(`[ComplianceStats] Deselected bin ${bin.range}`)
          return
        }

        onSelectBin({ min: bin.min, max: bin.max })

        // Console output: all cells in the clicked bin
        const cellsInBin = dataRef.current.filter(item => {
          const compliance = item.compliance_weighted_avg || 0
          return assignBin(compliance) === params.dataIndex
        })

        console.group(`[ComplianceStats] Selected bin: ${bin.range}`)
        console.log(`  Cells count: ${cellsInBin.length}`)
        console.log(
          `  Total population: ${Math.round(cellsInBin.reduce((s, c) => s + (c.pop || 0), 0))}`
        )
        console.log("  Cell data:", cellsInBin)
        console.groupEnd()
      },
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
        <div className="flex items-center justify-between text-xs text-gray-500 pb-1 min-h-[20px]">
          {selectedBinIndex >= 0 ? (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: COLOR_SELECTED }}
              />
              <span>
                Selected: <strong>{BINS[selectedBinIndex].range}</strong>
                {" — "}click again to deselect
              </span>
            </span>
          ) : (
            <span className="text-gray-400 italic">Click a bar to select</span>
          )}
          {hasSelection && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-[#ea580c]" />
              <span>{selectedCells!.length} cell{selectedCells!.length === 1 ? "" : "s"}</span>
            </span>
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
