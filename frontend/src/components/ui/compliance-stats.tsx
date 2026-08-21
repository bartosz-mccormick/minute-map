import * as React from "react"
import ReactECharts from "echarts-for-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { DESTINATIONS, getIndicatorBinConfig } from "@/app-config"
import {
  MAP_OVERLAY_BODY_SMALL_CLASS,
  MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE,
  MAP_OVERLAY_META_TEXT_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
} from "@/lib/map-overlay-styles"
import { buildBins, calculateBinnedStats, type BinRange } from "@/lib/binning"
import type { AmenityRadarDataResult } from "@/app-types"

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
  /** Whether to append a final >max bin for null min_travel_time values. */
  showOverflowBin?: boolean
  /** Get the indicator value from a hex item (e.g. compliance or travel time). Null = missing, excluded from stats. */
  getValue: (item: HexItem) => number | null
  amenityRadarData?: AmenityRadarDataResult
  selectedAmenityRadarData?: AmenityRadarDataResult
  selectedIndicator?: string
  onSelectBin: (binIndex: number | null) => void
  onSelectRadarBin?: (binIndex: number | null, bounds: readonly number[]) => void
  /** When 1+ cells are selected (click or polygon), show their distribution in the plot */
  selectedCells?: HexItem[]
  /** Format axis labels (default: one decimal, no trailing .0) */
  formatValue?: (v: number) => string
  className?: string
}

type DisplayBin = BinRange & {
  range: string
}

type RadarCoordinateSystem = {
  cx: number
  cy: number
  r: number
}

type EChartsWithModel = {
  getModel: () => {
    getComponent: (mainType: string) => { coordinateSystem?: RadarCoordinateSystem } | undefined
  }
  getDom: () => HTMLElement
}

const COLOR_DEFAULT = "#3b82f6"
const EMPTY_AMENITY_RADAR_DATA: AmenityRadarDataResult = {
  totalPop: 0,
  rows: [],
}
const PLOT_TYPES = [
  { value: "bar-chart", label: "bar chart" },
  { value: "radar-chart", label: "radar chart" },
] as const
const RADAR_TOP_AXIS_LABELS = new Set(["Supermarket", "Pharmacy", "Playground"])
const RADAR_BOTTOM_AXIS_LABELS = new Set(["Cafe", "Bar", "Bakery"])

const defaultFormatValue = (v: number) => v.toFixed(1).replace(/\.0$/, "")

function formatRadarAxisLabel(label: string) {
  const formattedLabel = label.includes(" ") ? label.replace(" ", "\n") : label
  if (RADAR_TOP_AXIS_LABELS.has(label)) return `\n${formattedLabel}`
  if (RADAR_BOTTOM_AXIS_LABELS.has(label)) return `${formattedLabel}\n`
  return formattedLabel
}

function getRadarAxisLabelColor(amenity: string, highlightedAmenity: string | null) {
  return highlightedAmenity === null || highlightedAmenity === amenity
    ? "#111827"
    : "rgba(17, 24, 39, 0.42)"
}

export function ComplianceStats({
  data,
  bounds,
  showOverflowBin = false,
  getValue,
  amenityRadarData = EMPTY_AMENITY_RADAR_DATA,
  selectedAmenityRadarData = EMPTY_AMENITY_RADAR_DATA,
  selectedIndicator,
  onSelectBin,
  onSelectRadarBin,
  selectedCells,
  formatValue = defaultFormatValue,
  className = "fixed bottom-4 right-4 z-10 bg-white shadow-lg w-[380px]",
}: ComplianceStatsProps) {
  const [plotType, setPlotType] = React.useState<(typeof PLOT_TYPES)[number]["value"]>("bar-chart")
  const [selectedRadarBinIndex, setSelectedRadarBinIndex] = React.useState<number | null>(null)
  const chartRef = React.useRef<ReactECharts>(null)
  const bins = React.useMemo<DisplayBin[]>(
    () => {
      const regularBins = buildBins(bounds).map((bin) => ({
        ...bin,
        range: `${formatValue(bin.min)}-${formatValue(bin.max)}`,
      }))
      if (!showOverflowBin || bounds.length === 0) return regularBins

      const maxBound = bounds[bounds.length - 1]
      return [
        ...regularBins,
        {
          min: maxBound,
          max: Number.POSITIVE_INFINITY,
          range: `>${formatValue(maxBound)}`,
        },
      ]
    },
    [bounds, formatValue, showOverflowBin]
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
  const radarValueByAmenity = React.useMemo(() => {
    return new Map(amenityRadarData.rows.map((row) => [row.amenity, row.value]))
  }, [amenityRadarData])
  const selectedRadarValueByAmenity = React.useMemo(() => {
    return new Map(selectedAmenityRadarData.rows.map((row) => [row.amenity, row.value]))
  }, [selectedAmenityRadarData])
  const radarBounds = React.useMemo(() => {
    const config = getIndicatorBinConfig("compliance_weighted_avg")
    if (config.method === "equal_interval" && config.min !== undefined && config.max !== undefined) {
      return { min: config.min, max: config.max }
    }

    return { min: 0, max: 1 }
  }, [])
  const highlightedAmenity = React.useMemo(() => {
    const [amenity] = selectedIndicator?.split("::") ?? []
    return DESTINATIONS.some((destination) => destination.value === amenity) ? amenity : null
  }, [selectedIndicator])
  const hasRadarSelection = hasSelection && selectedAmenityRadarData.rows.length > 0
  const radarRingBounds = React.useMemo(() => {
    const config = getIndicatorBinConfig("compliance_weighted_avg")
    const nBins = config.method === "equal_interval" ? config.nBins : 5
    const step = (radarBounds.max - radarBounds.min) / nBins
    return Array.from({ length: nBins + 1 }, (_, index) => radarBounds.min + step * index)
  }, [radarBounds.max, radarBounds.min])

  React.useEffect(() => {
    if (!hasRadarSelection) {
      setSelectedRadarBinIndex(null)
    }
  }, [hasRadarSelection])

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
        splitNumber: radarRingBounds.length - 1,
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
            color: radarRingBounds.map((_, index) =>
              selectedRadarBinIndex !== null &&
              (index === selectedRadarBinIndex || index === selectedRadarBinIndex + 1)
                ? "#111827"
                : "rgba(17, 24, 39, 0.12)"
            ),
            width: 1,
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
        indicator: DESTINATIONS.map((destination) => ({
          name: destination.label,
          max: radarBounds.max,
          min: radarBounds.min,
          color: getRadarAxisLabelColor(destination.value, highlightedAmenity),
        })),
      },
      series: [
        {
          name: "Budget vs spending",
          type: "radar",
          data: [
            {
              value: DESTINATIONS.map((destination) => radarValueByAmenity.get(destination.value) ?? 0),
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
            ...(hasRadarSelection
              ? [
                  {
                    value: DESTINATIONS.map((destination) => selectedRadarValueByAmenity.get(destination.value) ?? 0),
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
                ]
              : []),
          ],
        },
      ],
      tooltip: {
        trigger: "item",
      },
    }
  }, [
    hasRadarSelection,
    highlightedAmenity,
    radarBounds.max,
    radarBounds.min,
    radarRingBounds.length,
    radarValueByAmenity,
    selectedRadarBinIndex,
    selectedRadarValueByAmenity,
  ])

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

  const handleRadarChartClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (plotType !== "radar-chart" || !onSelectRadarBin) return

      const chart = chartRef.current?.getEchartsInstance() as EChartsWithModel | undefined
      const radar = chart?.getModel().getComponent("radar")?.coordinateSystem
      if (!chart || !radar || radar.r <= 0) return

      const chartRect = chart.getDom().getBoundingClientRect()
      const x = event.clientX - chartRect.left
      const y = event.clientY - chartRect.top
      const distance = Math.hypot(x - radar.cx, y - radar.cy)
      if (distance > radar.r) return

      const normalizedDistance = distance / radar.r
      const binCount = radarRingBounds.length - 1
      const binIndex = Math.min(binCount - 1, Math.max(0, Math.floor(normalizedDistance * binCount)))

      if (binIndex >= 0) {
        setSelectedRadarBinIndex((current) => current === binIndex ? null : binIndex)
        onSelectRadarBin(binIndex, radarRingBounds)
      }
    },
    [onSelectRadarBin, plotType, radarRingBounds]
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
              {hasRadarSelection && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-[#D20C0C]" />
                  <span>Selection</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className={`${plotType === "radar-chart" ? "h-[300px]" : "h-[260px]"} overflow-visible`}>
          <div className="relative h-full w-full" onClick={handleRadarChartClick}>
            <ReactECharts
              ref={chartRef}
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
        </div>
      </CardContent>
    </Card>
  )
}
