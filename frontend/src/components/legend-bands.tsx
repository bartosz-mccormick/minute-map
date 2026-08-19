import * as React from "react"
import type { Color, LegendBandsProps } from "@/app-types"
import { fmt, rgb } from "@/app-config"
import { MAP_OVERLAY_BODY_MAIN_CLASS } from "@/lib/map-overlay-styles"

export function LegendBands({
  bounds,
  colors,
  showOverflowBin = false,
  formatValue = fmt,
}: LegendBandsProps) {
  const bands = React.useMemo(() => {
    const out: { from: number; to: number; color: Color; label?: string }[] = []
    const n = Math.min(colors.length, Math.max(0, bounds.length - 1))
    for (let i = 0; i < n; i++) {
      out.push({ from: bounds[i], to: bounds[i + 1], color: colors[i] })
    }
    if (showOverflowBin && colors.length > n && bounds.length > 0) {
      const maxBound = bounds[bounds.length - 1]
      out.push({
        from: maxBound,
        to: Number.POSITIVE_INFINITY,
        color: colors[n],
        label: `>${formatValue(maxBound)}`,
      })
    }
    return out
  }, [bounds, colors, formatValue, showOverflowBin])

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {bands.map((b, idx) => (
          <li key={idx} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-[3px] ring-1 ring-black/10"
                style={{ background: rgb(b.color) }}
                aria-hidden
              />
              <span className={`tabular-nums ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>
                {b.label ?? `${formatValue(b.from)}-${formatValue(b.to)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
