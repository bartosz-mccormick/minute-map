"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type SliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value"
> & {
  value: number[]
  onValueChange?: (value: number[]) => void
}

function Slider({
  className,
  style,
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  ...props
}: SliderProps) {
  const currentValue = value[0] ?? Number(min)
  const minValue = Number(min)
  const maxValue = Number(max)
  const sliderValue =
    maxValue === minValue
      ? 0
      : ((currentValue - minValue) / (maxValue - minValue)) * 100

  return (
    <input
      type="range"
      value={currentValue}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onValueChange?.([event.currentTarget.valueAsNumber])}
      className={cn("shadcn-slider", className)}
      style={{ "--slider-value": `${sliderValue}%`, ...style } as React.CSSProperties}
      {...props}
    />
  )
}

export { Slider }
