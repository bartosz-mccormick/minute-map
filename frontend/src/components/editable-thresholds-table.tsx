"use client"

import { useState } from "react"
import { Plus, Trash2, X, ChevronsUpDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export interface Threshold {
  id: string
  selectedDestinations: string[]
  quantity: number
  transportMode: string
  travelTime: number
}

export interface TransportMode {
  value: string
  label: string
}

export interface Destination {
  value: string
  label: string
  icon: string
}

interface EditableThresholdsTableProps {
  thresholds: Threshold[]
  setThresholds: (thresholds: Threshold[]) => void
  transportModes: TransportMode[]
  destinations: Destination[]
  maxTravelTime?: number
}

export function EditableThresholdsTable({
  thresholds,
  setThresholds,
  transportModes,
  destinations,
  maxTravelTime = 60,
}: EditableThresholdsTableProps) {
  const [openDestinationPopover, setOpenDestinationPopover] = useState<string | null>(null)

  const addNewRow = () => {
    const newThreshold: Threshold = {
      id: crypto.randomUUID(),
      selectedDestinations: [],
      quantity: 1,
      transportMode: transportModes[0]?.value || "",
      travelTime: 15,
    }
    setThresholds([...thresholds, newThreshold])
  }

  const updateThreshold = (id: string, field: keyof Threshold, value: string | number | string[]) => {
    setThresholds(
      thresholds.map((t) =>
        t.id === id ? { ...t, [field]: value } : t
      )
    )
  }

  const deleteThreshold = (id: string) => {
    setThresholds(thresholds.filter((t) => t.id !== id))
  }

  const toggleDestination = (thresholdId: string, destinationValue: string) => {
    const threshold = thresholds.find((t) => t.id === thresholdId)
    if (!threshold) return

    const currentDestinations = threshold.selectedDestinations
    const newDestinations = currentDestinations.includes(destinationValue)
      ? currentDestinations.filter((d) => d !== destinationValue)
      : [...currentDestinations, destinationValue]

    updateThreshold(thresholdId, "selectedDestinations", newDestinations)
  }

  const removeDestination = (thresholdId: string, destinationValue: string) => {
    const threshold = thresholds.find((t) => t.id === thresholdId)
    if (!threshold) return

    updateThreshold(
      thresholdId,
      "selectedDestinations",
      threshold.selectedDestinations.filter((d) => d !== destinationValue)
    )
  }

  const getDestinationLabel = (value: string) => {
    return destinations.find((d) => d.value === value)?.label || value
  }

  const getDestinationIcon = (value: string) => {
    return destinations.find((d) => d.value === value)?.icon || ""
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Destinations</TableHead>
            <TableHead className="w-[100px]">Quantity</TableHead>
            <TableHead className="w-[160px]">Mode</TableHead>
            <TableHead className="w-[100px]">Time (min)</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {thresholds.map((threshold) => (
            <TableRow key={threshold.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                <Popover
                    open={openDestinationPopover === threshold.id}
                    onOpenChange={(open) =>
                      setOpenDestinationPopover(open ? threshold.id : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        role="combobox"
                        aria-expanded={openDestinationPopover === threshold.id}
                        className="h-7 px-2 text-xs bg-transparent"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                        <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[220px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search destinations..." />
                        <CommandList>
                          <CommandEmpty>No destinations found.</CommandEmpty>
                          <CommandGroup>
                            {destinations.map((destination) => (
                              <CommandItem
                                key={destination.value}
                                value={destination.value}
                                onSelect={() =>
                                  toggleDestination(threshold.id, destination.value)
                                }
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    threshold.selectedDestinations.includes(
                                      destination.value
                                    )
                                      ? "opacity-100"
                                      : "opacity-0"
                                  }`}
                                />
                                <span className="mr-2">{destination.icon}</span>
                                {destination.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {threshold.selectedDestinations.map((dest) => (

                    <Badge
                      key={dest}
                      variant="secondary"
                      className="text-xs pr-1 flex items-center gap-1"
                    >
                      <span>{getDestinationIcon(dest)}</span>
                      <span>{getDestinationLabel(dest)}</span>
                      <button
                        type="button"
                        onClick={() => removeDestination(threshold.id, dest)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`Remove ${getDestinationLabel(dest)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}

                </div>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  value={threshold.quantity}
                  onChange={(e) =>
                    updateThreshold(
                      threshold.id,
                      "quantity",
                      Math.max(1, Number.parseInt(e.target.value) || 1)
                    )
                  }
                  min={1}
                  className="w-full"
                />
              </TableCell>
              <TableCell>
                <Select
                  value={threshold.transportMode}
                  onValueChange={(value) =>
                    updateThreshold(threshold.id, "transportMode", value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {transportModes.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  value={threshold.travelTime}
                  onChange={(e) =>
                    updateThreshold(
                      threshold.id,
                      "travelTime",
                      Math.max(1, Math.min(maxTravelTime, Number.parseInt(e.target.value) || 1))
                    )
                  }
                  min={1}
                  max={maxTravelTime}
                  className="w-full"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteThreshold(threshold.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {thresholds.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No thresholds configured. Click the button below to add one.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Button
        variant="outline"
        onClick={addNewRow}
        className="w-full bg-transparent"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Threshold
      </Button>
    </div>
  )
}
