import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { NestedOption } from "@/app-types"
import { MAP_OVERLAY_PANEL_TITLE_CLASS } from "@/lib/map-overlay-styles"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type { NestedOption } from "@/app-types"

type NestedDropdownSelectProps = {
  options: NestedOption[]
  value: string | null
  onValueChange: (value: string) => void

  placeholder?: string
  className?: string
  contentClassName?: string
  textClassName?: string

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
  textClassName = MAP_OVERLAY_PANEL_TITLE_CLASS,
  showPathInLabel = true,
  pathSeparator = " / ",
  widthClassName = "w-[280px]",
}: NestedDropdownSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 700px)")
    const updateIsMobile = () => setIsMobile(mobileQuery.matches)

    updateIsMobile()
    mobileQuery.addEventListener("change", updateIsMobile)

    return () => mobileQuery.removeEventListener("change", updateIsMobile)
  }, [])

  const selectedPath = React.useMemo(() => {
    if (!value) return null
    return findPathByValue(options, value)
  }, [options, value])

  const displayLabelElement = React.useMemo(() => {
    if (!value || !selectedPath?.length) return <span className={textClassName}>{placeholder}</span>
    if (!showPathInLabel) {
      return <span className={textClassName}>{selectedPath[selectedPath.length - 1]?.label ?? placeholder}</span>
    }
    const labels = selectedPath.map((n) => n.label)
    // If pathSeparator contains ":", wrap after each colon
    if (pathSeparator.includes(":")) {
      return (
        <span className={`whitespace-pre-line text-left ${textClassName}`}>
          {labels.map((label, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && ":\n"}
              {label}
            </React.Fragment>
          ))}
        </span>
      )
    }
    return <span className={textClassName}>{labels.join(pathSeparator)}</span>
  }, [value, selectedPath, placeholder, showPathInLabel, pathSeparator, textClassName])

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
            className={textClassName}
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
          <DropdownMenuSubContent
            collisionPadding={12}
            className="nested-dropdown-sub-content"
          >
            {opt.children!.map((child) => renderOption(child))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }

    return (
      <DropdownMenuItem
        key={opt.value}
        className={textClassName}
        disabled={opt.disabled}
        onClick={() => handleSelect(opt.value)}
      >
        {opt.label}
      </DropdownMenuItem>
    )
  }

  const renderMobileOption = (opt: NestedOption, depth = 0) => {
    const hasChildren = !!opt.children?.length
    const canSelect = !hasChildren || opt.selectableWhenHasChildren
    const isSelected = opt.value === value
    const itemClassName = [
      "nested-dropdown-tree-item",
      textClassName,
      isSelected ? "is-selected" : "",
    ]
      .filter(Boolean)
      .join(" ")

    return (
      <div
        key={opt.value}
        className="nested-dropdown-tree-node"
        style={{ "--tree-depth": depth } as React.CSSProperties}
      >
        {canSelect ? (
          <button
            type="button"
            className={itemClassName}
            disabled={opt.disabled}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </button>
        ) : (
          <div className={itemClassName} aria-disabled={opt.disabled}>
            {opt.label}
          </div>
        )}
        {hasChildren ? (
          <div className="nested-dropdown-tree-children">
            {opt.children!.map((child) => renderMobileOption(child, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={[
            widthClassName,
            "justify-between bg-transparent h-auto min-h-[2.5rem] items-start py-2",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="flex-1 text-left">{displayLabelElement}</span>
          <ChevronDown className="ml-2 size-4 opacity-50 shrink-0 mt-0.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        collisionPadding={12}
        className={[
          "nested-dropdown-content",
          widthClassName,
          contentClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isMobile ? options.map((opt) => renderMobileOption(opt)) : options.map((opt) => renderOption(opt))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
