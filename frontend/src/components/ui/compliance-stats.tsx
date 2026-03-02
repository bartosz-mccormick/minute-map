import * as React from "react"
import ReactECharts from "echarts-for-react"
import { Card, CardContent } from "@/components/ui/card"

interface ComplianceStatsProps {
  data: Array<{
    pop?: number
    compliance_weighted_avg?: number
  }>
  selectedBin: { min: number; max: number } | null
  onSelectBin: (bin: { min: number; max: number } | null) => void
  selectedCellCompliance?: number | null
}

export function ComplianceStats({ data, selectedBin, onSelectBin, selectedCellCompliance }: ComplianceStatsProps) {
  const stats = React.useMemo(() => {
    // calculate weighted average score
    let totalScore = 0
    let totalPopulation = 0
    
    data.forEach((item) => {
      const pop = item.pop || 0
      const compliance = item.compliance_weighted_avg || 0
      totalScore += pop * compliance
      totalPopulation += pop
    })
    
    const weightedAvg = totalPopulation > 0 ? totalScore / totalPopulation : 0
    
    // count the number of hexagons in each bin
    const bins = [
      { range: "0-0.2", min: 0, max: 0.2, count: 0 },
      { range: "0.2-0.4", min: 0.2, max: 0.4, count: 0 },
      { range: "0.4-0.6", min: 0.4, max: 0.6, count: 0 },
      { range: "0.6-0.8", min: 0.6, max: 0.8, count: 0 },
      { range: "0.8-1", min: 0.8, max: 1.0, count: 0 },
    ]
    
    data.forEach((item) => {
      const compliance = item.compliance_weighted_avg || 0
      const pop = item.pop || 0
      for (const bin of bins) {
        if (compliance >= bin.min && compliance < bin.max) {
          bin.count += pop
          break
        }
        // handle compliance === 1.0 case
        if (compliance === 1.0 && bin.max === 1.0) {
          bin.count += pop
          break
        }
      }
    })
    
    return {
      weightedAvg,
      bins,
      min: Math.min(...data.map(d => d.compliance_weighted_avg || 0)),
      max: Math.max(...data.map(d => d.compliance_weighted_avg || 0)),
    }
  }, [data])
  
  const chartOption = React.useMemo(() => {
    // Determine which bin the selected cell belongs to
    let selectedCellBinIndex = -1
    if (selectedCellCompliance !== null && selectedCellCompliance !== undefined) {
      for (let i = 0; i < stats.bins.length; i++) {
        const bin = stats.bins[i]
        if (
          (selectedCellCompliance >= bin.min && selectedCellCompliance < bin.max) ||
          (selectedCellCompliance === 1.0 && bin.max === 1.0)
        ) {
          selectedCellBinIndex = i
          break
        }
      }
    }
    
    // Create data for the selected cell indicator bar (1/10 of the original bar height)
    const overlayBarData = stats.bins.map((bin, index) => 
      index === selectedCellBinIndex ? bin.count / 10 : 0
    )
    
    // Which bar is selected (for map highlight + bar shadow)
    const selectedBinIndex = selectedBin 
      ? stats.bins.findIndex(b => b.min === selectedBin.min && b.max === selectedBin.max)
      : -1
    
    return {
      grid: {
        left: 50,
        right: 20,
        top: 20,
        bottom: 60,
      },
      xAxis: {
        type: "category",
        data: stats.bins.map(b => b.range),
        axisLabel: {
          rotate: 0,
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        name: "Population",
        nameLocation: "middle",
        nameGap: 35,
        nameTextStyle: {
          fontSize: 12,
        },
      },
      series: [
        {
          name: "Population",
          data: stats.bins.map(b => b.count),
          type: "bar",
          itemStyle: {
            color: (params: any) =>
              params.dataIndex === selectedBinIndex ? "#1d4ed8" : "#3b82f6",
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.2)",
            },
          },
          barWidth: "60%",
          z: 1,
        },
        {
          name: "Selected Cell Pop",
          data: overlayBarData,
          type: "bar",
          itemStyle: {
            color: "#1e3a8a", // Dark blue
          },
          barWidth: "60%",
          barGap: "-100%", // Overlap with the main bar
          z: 2,
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: any) => {
          const param = params[0]
          return `${param.name}<br/>Population: ${Math.round(param.value)}`
        },
      },
    }
  }, [stats.bins, selectedCellCompliance, selectedBin])
  
  const onChartEvents = React.useMemo(() => ({
    click: (params: any) => {
      if (params.componentType === "series" && params.seriesIndex === 0 && params.dataIndex !== undefined) {
        const bin = stats.bins[params.dataIndex]
        const newBin = { min: bin.min, max: bin.max }
        // Toggle: if same bin clicked again, deselect
        onSelectBin(
          selectedBin && selectedBin.min === newBin.min && selectedBin.max === newBin.max
            ? null
            : newBin
        )
      }
    },
  }), [stats.bins, selectedBin, onSelectBin])
  
  if (data.length === 0) return null
  
  return (
    <Card className="fixed bottom-4 right-4 z-10 bg-white shadow-lg w-[380px]">
      <CardContent className="p-4 space-y-2">
        <div className="text-center font-semibold text-sm border-b pb-2">
          Avg. = {stats.weightedAvg.toFixed(2)} | min = {stats.min.toFixed(2)} | max = {stats.max.toFixed(2)}
        </div>
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
