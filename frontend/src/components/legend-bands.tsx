import * as React from "react"
import type { Color, LegendBandsProps } from "@/app-types"
import { fmt, rgb } from "@/app-config"
import { MAP_OVERLAY_BODY_MAIN_CLASS } from "@/lib/map-overlay-styles"

export function LegendBands({
  bounds,
  colors,
  formatValue = fmt,
}: LegendBandsProps) {
  const bands = React.useMemo(() => {
    const out: { from: number; to: number; color: Color }[] = []
    const n = Math.min(colors.length, Math.max(0, bounds.length - 1))
    for (let i = 0; i < n; i++) {
      out.push({ from: bounds[i], to: bounds[i + 1], color: colors[i] })
    }
    return out
  }, [bounds, colors])

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
                {formatValue(b.from)}–{formatValue(b.to)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
