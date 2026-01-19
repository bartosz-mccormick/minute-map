import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type NestedOption = {
  value: string
  label: string
  children?: NestedOption[]
  /** If true, clicking this item selects it even if it has children (default: false) */
  selectableWhenHasChildren?: boolean
  /** Optional: disable an item */
  disabled?: boolean
}

type NestedDropdownSelectProps = {
  options: NestedOption[]
  value: string | null
  onValueChange: (value: string) => void

  placeholder?: string
  className?: string
  contentClassName?: string

  /** Default: true. If false, label shows only the selected node label (no path). */
  showPathInLabel?: boolean
  /** Separator for path display */
  pathSeparator?: string
  /** Width applied to trigger + content */
  widthClassName?: string
}

function findPathByValue(
  options: NestedOption[],
  targetValue: string
): NestedOption[] | null {
  for (const opt of options) {
    if (opt.value === targetValue) return [opt]
    if (opt.children?.length) {
      const childPath = findPathByValue(opt.children, targetValue)
      if (childPath) return [opt, ...childPath]
    }
  }
  return null
}

export function NestedDropdownSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option",
  className,
  contentClassName,
  showPathInLabel = true,
  pathSeparator = " / ",
  widthClassName = "w-[280px]",
}: NestedDropdownSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selectedPath = React.useMemo(() => {
    if (!value) return null
    return findPathByValue(options, value)
  }, [options, value])

  const displayLabel = React.useMemo(() => {
    if (!value || !selectedPath?.length) return placeholder
    if (!showPathInLabel) return selectedPath[selectedPath.length - 1]?.label ?? placeholder
    return selectedPath.map((n) => n.label).join(pathSeparator)
  }, [value, selectedPath, placeholder, showPathInLabel, pathSeparator])

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue)
    setOpen(false)
  }

  const renderOption = (opt: NestedOption) => {
    const hasChildren = !!opt.children?.length
    const canSelect = !hasChildren || opt.selectableWhenHasChildren

    if (hasChildren) {
      return (
        <DropdownMenuSub key={opt.value}>
          <DropdownMenuSubTrigger
            disabled={opt.disabled}
            // If selectableWhenHasChildren is true, allow click to select (and still provide submenu via hover/keyboard)
            onClick={(e) => {
              if (!canSelect) return
              // Prevent the default submenu open/close click behavior from stealing the selection
              e.preventDefault()
              e.stopPropagation()
              handleSelect(opt.value)
            }}
          >
            {opt.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {opt.children!.map((child) => renderOption(child))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }

    return (
      <DropdownMenuItem
        key={opt.value}
        disabled={opt.disabled}
        onClick={() => handleSelect(opt.value)}
      >
        {opt.label}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={[
            widthClassName,
            "justify-between bg-transparent",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {displayLabel}
          <ChevronDown className="ml-2 size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={[
          widthClassName,
          contentClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {options.map((opt) => renderOption(opt))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}