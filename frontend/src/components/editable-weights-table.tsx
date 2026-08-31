"use client"

import { useMemo } from "react"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  MAP_OVERLAY_BODY_MAIN_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
} from "@/lib/map-overlay-styles"
import { getDestinationIcon, getDestinationLabel } from "@/app-config"
import type { EditableWeightsTableProps, Weight } from "@/app-types"

export function EditableWeightsTable({
  weights,
  setWeights,
  destinations,
}: EditableWeightsTableProps) {
  // Build amenity -> weight map from the existing weights structure
  const amenityWeights = useMemo(() => {
    const map: Record<string, number> = {}
    for (const entry of weights) {
      for (const amenity of entry.selectedDestinations) {
        map[amenity] = entry.weight
      }
    }
    return map
  }, [weights])

  const handleWeightChange = (destinationValue: string, rawValue: number) => {
    const newValue = Math.max(0, rawValue || 0)

    // Start from current mapping, update this destination
    const updatedMap: Record<string, number> = { ...amenityWeights, [destinationValue]: newValue }

    // Normalize to one row per destination
    const normalizedWeights: Weight[] = destinations.map((destination) => ({
      id: `weight-${destination.value}`,
      selectedDestinations: [destination.value],
      weight: updatedMap[destination.value] ?? 1,
    }))

    setWeights(normalizedWeights)
  }

  return (
    <div className="config-weights-table space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Destination</TableHead>
            <TableHead className={`w-[120px] ${MAP_OVERLAY_PANEL_TITLE_CLASS}`}>Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {destinations.map((destination) => (
            <TableRow key={destination.value}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{getDestinationIcon(destination.value)}</span>
                  <span className={MAP_OVERLAY_BODY_MAIN_CLASS}>
                    {getDestinationLabel(destination.value)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  value={amenityWeights[destination.value] ?? 1}
                  onChange={(e) =>
                    handleWeightChange(destination.value, e.currentTarget.valueAsNumber)
                  }
                  min={0}
                  step={0.1}
                  className={`w-full ${MAP_OVERLAY_BODY_MAIN_CLASS}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
