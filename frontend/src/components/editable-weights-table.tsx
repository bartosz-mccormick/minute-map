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

export interface Weight {
  id: string
  selectedDestinations: string[]
  weight: number
}

export interface Destination {
  value: string
  label: string
  icon: string
}

interface EditableThresholdsTableProps {
  weights: Weight[]
  setWeights: (weights: Weight[]) => void
  destinations: Destination[]
}

export function EditableWeightsTable({
  weights,
  setWeights,
  destinations,
}: EditableThresholdsTableProps) {
  const [openDestinationPopover, setOpenDestinationPopover] = useState<string | null>(null)

  const addNewRow = () => {
    const newWeight: Weight = {
      id: crypto.randomUUID(),
      selectedDestinations: [],
      weight: 0
    }
    setWeights([...weights, newWeight])
  }

  const updateWeight = (id: string, field: keyof Weight, value: string | number | string[]) => {
    setWeights(
      weights.map((w) =>
        w.id === id ? { ...w, [field]: value } : w
      )
    )
  }

  const deleteWeight = (id: string) => {
    setWeights(weights.filter((w) => w.id !== id))
  }

  const toggleDestination = (weightId: string, destinationValue: string) => {
    const weight = weights.find((w) => w.id === weightId)
    if (!weight) return

    const currentDestinations = weight.selectedDestinations
    const newDestinations = currentDestinations.includes(destinationValue)
      ? currentDestinations.filter((d) => d !== destinationValue)
      : [...currentDestinations, destinationValue]

      updateWeight(weightId, "selectedDestinations", newDestinations)
  }

  const removeDestination = (weightId: string, destinationValue: string) => {
    const weight = weights.find((w) => w.id === weightId)
    if (!weight) return

    updateWeight(
        weightId,
      "selectedDestinations",
      weight.selectedDestinations.filter((w) => w !== destinationValue)
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
            <TableHead className="w-[100px]">Weight</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {weights.map((weight) => (
            <TableRow key={weight.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                <Popover
                    open={openDestinationPopover === weight.id}
                    onOpenChange={(open) =>
                      setOpenDestinationPopover(open ? weight.id : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        role="combobox"
                        aria-expanded={openDestinationPopover === weight.id}
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
                                  toggleDestination(weight.id, destination.value)
                                }
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    weight.selectedDestinations.includes(
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
                  {weight.selectedDestinations.map((dest) => (

                    <Badge
                      key={dest}
                      variant="secondary"
                      className="text-xs pr-1 flex items-center gap-1"
                    >
                      <span>{getDestinationIcon(dest)}</span>
                      <span>{getDestinationLabel(dest)}</span>
                      <button
                        type="button"
                        onClick={() => removeDestination(weight.id, dest)}
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
                  value={weight.weight}
                  onChange={(e) =>
                    updateWeight(
                      weight.id,
                      "weight",
                      Math.max(0, e.currentTarget.valueAsNumber || 0)
                    )
                  }
                  min={0}
                  step={0.1}
                  className="w-full"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteWeight(weight.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {weights.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No weights configured. Click the button below to add one.
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
        Add Weight
      </Button>
    </div>
  )
}
