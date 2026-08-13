import * as React from "react"
import ReactECharts from "echarts-for-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import {
  MAP_OVERLAY_BODY_SMALL_CLASS,
  MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE,
  MAP_OVERLAY_META_TEXT_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
} from "@/lib/map-overlay-styles"
import { buildBins, calculateBinnedStats, type BinRange } from "@/lib/binning"

type HexItem = {
  pop?: number
  bin?: number | null
  compliance_weighted_avg?: number | null
  h3_cell?: string
  [key: string]: unknown
}

interface ComplianceStatsProps {
  data: HexItem[]
  /** Bounds for bins (e.g. [0, 0.2, 0.4, 0.6, 0.8, 1] or [0, 5, 10, 15, 20, 25, 30]). Bins are [bounds[i], bounds[i+1]). */
  bounds: number[]
  /** Get the indicator value from a hex item (e.g. compliance or travel time). Null = missing, excluded from stats. */
  getValue: (item: HexItem) => number | null
  onSelectBin: (binIndex: number | null) => void
  /** When 1+ cells are selected (click or polygon), show their distribution in the plot */
  selectedCells?: HexItem[]
  /** Format axis labels (default: one decimal, no trailing .0) */
  formatValue?: (v: number) => string
  className?: string
}

type DisplayBin = BinRange & {
  range: string
}

const COLOR_DEFAULT = "#3b82f6"
const PLOT_TYPES = [
  { value: "bar-chart", label: "bar chart" },
  { value: "radar-chart", label: "radar chart" },
] as const
const RADAR_AXES = [
  "Supermarket",
  "Pharmacy",
  "ATM/Bank",
  "Post Office",
  "General Practitioner",
  "Restaurant",
  "Cafe",
  "Bar",
  "Bakery",
  "School",
  "Kindergarten",
  "Library",
  "Sports Facility",
  "Park",
  "Playground",
]
const RADAR_FULL_VALUES = [78, 64, 72, 58, 81, 69, 55, 62, 67, 73, 61, 70, 76, 80, 57]
const RADAR_SELECTION_VALUES = [52, 47, 55, 40, 63, 50, 42, 45, 48, 54, 46, 51, 58, 60, 44]
const RADAR_TOP_AXIS_LABELS = new Set(["Supermarket", "Pharmacy", "Playground"])
const RADAR_BOTTOM_AXIS_LABELS = new Set(["Cafe", "Bar", "Bakery"])

const defaultFormatValue = (v: number) => v.toFixed(1).replace(/\.0$/, "")

function formatRadarAxisLabel(label: string) {
  const formattedLabel = label.includes(" ") ? label.replace(" ", "\n") : label
  if (RADAR_TOP_AXIS_LABELS.has(label)) return `\n${formattedLabel}`
  if (RADAR_BOTTOM_AXIS_LABELS.has(label)) return `${formattedLabel}\n`
  return formattedLabel
}

export function ComplianceStats({
  data,
  bounds,
  getValue,
  onSelectBin,
  selectedCells,
  formatValue = defaultFormatValue,
  className = "fixed bottom-4 right-4 z-10 bg-white shadow-lg w-[380px]",
}: ComplianceStatsProps) {
  const [plotType, setPlotType] = React.useState<(typeof PLOT_TYPES)[number]["value"]>("bar-chart")
  const bins = React.useMemo<DisplayBin[]>(
    () => buildBins(bounds).map((bin) => ({
      ...bin,
      range: `${formatValue(bin.min)}–${formatValue(bin.max)}`,
    })),
    [bounds, formatValue]
  )

  const stats = React.useMemo(() => {
    const all = calculateBinnedStats(data, bins.length, getValue)
    const selection =
      selectedCells && selectedCells.length > 0
        ? calculateBinnedStats(selectedCells, bins.length, getValue)
        : null

    return {
      all,
      selection,
      binPop: all.binPop,
      selectionBinPop: selection ? selection.binPop : bins.map(() => 0),
    }
  }, [data, selectedCells, bins, getValue])

  const hasSelection = !!stats.selection
  const showSummary = plotType === "bar-chart"

  const barChartOption = React.useMemo(() => {
    return {
      grid: { left: 50, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: "category",
        data: bins.map((b) => b.range),
        axisLabel: {
          rotate: 0,
          ...MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE,
        },
      },
      yAxis: {
        type: "value",
        name: "Population",
        nameLocation: "middle",
        nameGap: 35,
        nameTextStyle: MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE,
        axisLabel: {
          ...MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE,
        },
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

  const radarChartOption = React.useMemo(() => {
    return {
      animation: false,
      legend: { show: false },
      radar: {
        center: ["50%", "51%"],
        radius: "78%",
        nameGap: 30,
        splitNumber: 4,
        shape: "circle",
        axisName: {
          formatter: formatRadarAxisLabel,
          color: "#111827",
          fontFamily: MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE.fontFamily,
          fontSize: 11,
          fontWeight: 400,
          align: "center",
          verticalAlign: "middle",
          lineHeight: 12,
        },
        splitLine: {
          lineStyle: {
            color: "rgba(17, 24, 39, 0.12)",
          },
        },
        splitArea: {
          areaStyle: {
            color: ["rgba(255,255,255,0.0)", "rgba(255,255,255,0.03)"],
          },
        },
        axisLine: {
          lineStyle: {
            color: "rgba(17, 24, 39, 0.18)",
          },
        },
        indicator: RADAR_AXES.map((name) => ({
          name,
          max: 100,
        })),
      },
      series: [
        {
          name: "Budget vs spending",
          type: "radar",
          data: [
            {
              value: RADAR_FULL_VALUES,
              name: "Full area",
              areaStyle: {
                color: "rgba(59, 130, 246, 0.18)",
              },
              lineStyle: {
                color: COLOR_DEFAULT,
              },
              itemStyle: {
                color: COLOR_DEFAULT,
              },
            },
            {
              value: RADAR_SELECTION_VALUES,
              name: "Selection",
              areaStyle: {
                color: "rgba(220, 38, 38, 0.16)",
              },
              lineStyle: {
                color: "#D20C0C",
              },
              itemStyle: {
                color: "#D20C0C",
              },
            },
          ],
        },
      ],
      tooltip: {
        trigger: "item",
      },
    }
  }, [])

  const chartOption = plotType === "radar-chart" ? radarChartOption : barChartOption

  const onChartEvents = React.useMemo(
    () => ({
      click: (params: { componentType: string; dataIndex?: number; seriesIndex?: number }) => {
        if (
          params.componentType !== "series" ||
          params.dataIndex === undefined ||
          params.seriesIndex !== 0
        ) return
        onSelectBin(params.dataIndex)
      },
    }),
    [onSelectBin]
  )

  if (data.length === 0) return null

  return (
    <Card className={`${className} py-2`}>
      <CardContent className="px-4 pt-2 pb-3 space-y-2">
        <div className="flex items-start">
          <Select value={plotType} onValueChange={(value) => setPlotType(value as typeof plotType)}>
            <SelectTrigger
              size="sm"
              className="h-9 w-[168px] rounded-sm border-2 border-slate-900 bg-white px-3 shadow-none"
            >
              <SelectValue placeholder="selection for plot type" />
            </SelectTrigger>
            <SelectContent>
              {PLOT_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value} className={MAP_OVERLAY_BODY_SMALL_CLASS}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={`h-[44px] border-b pb-2 ${showSummary ? "" : "border-transparent"}`}>
          {showSummary ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Full area</span>
                <span className={MAP_OVERLAY_BODY_SMALL_CLASS}>
                  Avg = {stats.all.weightedAvg.toFixed(2)} | min = {stats.all.min.toFixed(2)} | max = {stats.all.max.toFixed(2)}
                </span>
              </div>
              {hasSelection && stats.selection && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[#D20C0C]" />
                    <span className={MAP_OVERLAY_META_TEXT_CLASS}>Selection ({selectedCells!.length} cell{selectedCells!.length === 1 ? "" : "s"})</span>
                  </span>
                  <span className={MAP_OVERLAY_BODY_SMALL_CLASS}>
                    Avg = {stats.selection.weightedAvg.toFixed(2)} | min = {stats.selection.min.toFixed(2)} | max = {stats.selection.max.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className={`flex items-start justify-center gap-5 ${MAP_OVERLAY_BODY_SMALL_CLASS}`}>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-[#3b82f6]" />
                <span>Full area</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-[#D20C0C]" />
                <span>Selection</span>
              </span>
            </div>
          )}
        </div>
        <div className={`${plotType === "radar-chart" ? "h-[300px]" : "h-[260px]"} overflow-visible`}>
          <ReactECharts
            key={plotType}
            option={chartOption}
            style={
              plotType === "radar-chart"
                ? { height: "300px", width: "calc(100% + 64px)", margin: "-20px -32px", transform: "translateY(-14px)" }
                : { height: "260px", width: "100%" }
            }
            opts={{ renderer: "canvas" }}
            onEvents={plotType === "bar-chart" ? onChartEvents : undefined}
          />
        </div>
      </CardContent>
    </Card>
  )
}
