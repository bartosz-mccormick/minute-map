import * as React from "react"
import ReactECharts from "echarts-for-react"
import { Card, CardContent } from "@/components/ui/card"

interface ComplianceStatsProps {
  data: Array<{
    pop?: number
    compliance_weighted_avg?: number
  }>
  onHoverBin?: (bin: { min: number; max: number } | null) => void
  hoveredCellCompliance?: number | null
}

export function ComplianceStats({ data, onHoverBin, hoveredCellCompliance }: ComplianceStatsProps) {
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
      for (const bin of bins) {
        if (compliance >= bin.min && compliance < bin.max) {
          bin.count++
          break
        }
        // handle compliance === 1.0 case
        if (compliance === 1.0 && bin.max === 1.0) {
          bin.count++
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
    // Determine which bin the hovered cell belongs to
    let hoveredBinIndex = -1
    if (hoveredCellCompliance !== null && hoveredCellCompliance !== undefined) {
      for (let i = 0; i < stats.bins.length; i++) {
        const bin = stats.bins[i]
        if (
          (hoveredCellCompliance >= bin.min && hoveredCellCompliance < bin.max) ||
          (hoveredCellCompliance === 1.0 && bin.max === 1.0)
        ) {
          hoveredBinIndex = i
          break
        }
      }
    }
    
    // Create data for the hovered cell indicator bar (1/10 of the original bar height)
    const hoveredBarData = stats.bins.map((bin, index) => 
      index === hoveredBinIndex ? bin.count / 10 : 0
    )
    
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
        name: "Count",
        nameLocation: "middle",
        nameGap: 35,
        nameTextStyle: {
          fontSize: 12,
        },
      },
      series: [
        {
          name: "Count",
          data: stats.bins.map(b => b.count),
          type: "bar",
          itemStyle: {
            color: "#3b82f6",
          },
          barWidth: "60%",
          z: 1,
        },
        {
          name: "Hovered Cell",
          data: hoveredBarData,
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
          return `${param.name}<br/>Count: ${param.value}`
        },
      },
    }
  }, [stats.bins, hoveredCellCompliance])
  
  const onChartEvents = React.useMemo(() => ({
    mouseover: (params: any) => {
      if (params.componentType === 'series' && params.dataIndex !== undefined) {
        const bin = stats.bins[params.dataIndex]
        onHoverBin?.({ min: bin.min, max: bin.max })
      }
    },
    mouseout: () => {
      onHoverBin?.(null)
    },
  }), [stats.bins, onHoverBin])
  
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
