"use client"

import * as React from "react"
import { Plus, Trash2, Settings } from "lucide-react"

import { Check, ChevronsUpDown } from "lucide-react"
import { Map, NavigationControl, useControl } from "react-map-gl/maplibre"
import { H3HexagonLayer } from "deck.gl"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import "maplibre-gl/dist/maplibre-gl.css"
import {colorBins} from "@deck.gl/carto"


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

//  import hexes from './assets/data.json'; 


const INITIAL_VIEW_STATE = {
  longitude: 5.098107855086862,
  latitude:   52.09641414282321,
  zoom: 11,
  pitch: 0,
  bearing: 0,
}



const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"



function DeckGLOverlay(props: any) {
  const overlay = useControl(() => new DeckOverlay(props))
  overlay.setProps(props)
  return null
}

function HexMap({ hexData }: { hexData: any[] }) {
  const layers = [
    new H3HexagonLayer({
      id: "H3HexagonLayer",
      data: hexData,
      elevationScale: 1000,
      extruded: false,
      filled: true,
      getElevation: (d: any) => d.compliance_avg,
      getFillColor: colorBins({
        attr: (d: any) => d.compliance_avg,
        domain: [.2, .4, .6, .8],
        colors: 'SunsetDark'
      }),
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: .5,
      //getFillColor: (d: any) => [255, (1 - d.compliance) * 255, 0],
      getHexagon: (d: any) => d.h3_cell,
      wireframe: false,
      pickable: true,
      opacity: .3
    }),
  ]


  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle= {MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
      <DeckGLOverlay
        layers={layers}
        getTooltip={({ object }: any) => object && `${object.h3_cell} compliance: ${object.compliance_avg}`}
      />
      <NavigationControl position="top-left" />
    </Map>
  )
}

const travelScenarios = [
  { value: "current", label: "Current" },
  // { value: "bikesharing-a", label: "Bike Sharing System Alternative A" },
  // { value: "bikesharing-b", label: "Bike Sharing System Alternative B" },
]

const transportModes = [
  { value: "walk", label: "Walking" },
  // { value: "bike", label: "Cycling" },
  // { value: "public-transport", label: "Public Transport" },
]

const destinationTypes = [
  { value: "supermarket", label: "Supermarket", icon: "🛒" },
  { value: "park", label: "Park", icon: "🌳" },
  { value: "school", label: "School", icon: "🏫" },
  { value: "doctor", label: "Doctor", icon: "🏥" },
  { value: "restaurant", label: "Restaurant", icon: "🍽️" },
]

interface Threshold {
  id: string
  transportMode: string
  travelTime: string
  selectedDestinations: string[]
}

export default function app() {
  const [selectedScenario, setSelectedScenario] = React.useState("current")
  const [thresholds, setThresholds] = React.useState<Threshold[]>([])
  const [configOpen, setConfigOpen] = React.useState(false)

  // Current form state
  const [currentTransportMode, setCurrentTransportMode] = React.useState("")
  const [currentTravelTime, setCurrentTravelTime] = React.useState("")
  const [currentSelectedDestinations, setCurrentSelectedDestinations] = React.useState<string[]>([])
  const [destinationsOpen, setDestinationsOpen] = React.useState(false)

  // map data

  const [hexData, setHexData] = React.useState<any[]>([]);


  const addThreshold = () => {
    if (currentTransportMode && currentTravelTime && currentSelectedDestinations.length > 0) {
      const newThreshold: Threshold = {
        id: `threshold-${Date.now()}`,
        transportMode: currentTransportMode,
        travelTime: currentTravelTime,
        selectedDestinations: [...currentSelectedDestinations],
      }
      setThresholds([...thresholds, newThreshold])

      // Reset form
      setCurrentTransportMode("")
      setCurrentTravelTime("")
      setCurrentSelectedDestinations([])
    }
  }

  const deleteThreshold = (thresholdId: string) => {
    setThresholds(thresholds.filter((threshold) => threshold.id !== thresholdId))
  }

  const handleDestinationToggle = (destinationValue: string) => {
    setCurrentSelectedDestinations((prev) =>
      prev.includes(destinationValue) ? prev.filter((d) => d !== destinationValue) : [...prev, destinationValue],
    )
  }

  const getDestinationLabel = (value: string) => {
    return destinationTypes.find((d) => d.value === value)?.label || value
  }

  const getDestinationIcon = (value: string) => {
    return destinationTypes.find((d) => d.value === value)?.icon || ""
  }

  const getTransportModeLabel = (value: string) => {
    return transportModes.find((m) => m.value === value)?.label || value
  }

  type ComplianceRow = {
    h3_cell: string;
    compliance_avg: number;
  };
  
  const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL;
  
  const handleAnalyze = async () => {
    const groups = thresholds.map((t) => ({
      mode: t.transportMode,
      T: parseInt(t.travelTime),
      X: 1,       // adjust if you have this in UI
      amenities: t.selectedDestinations,
    }));
  
    try {
      const res = await fetch(`${POSTGREST_URL}/rpc/get_compliance_min_summary_batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Profile': 'api'
        },
        body: JSON.stringify({ _groups: groups }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} – ${text}`);
      }
  
      const data: ComplianceRow[] = await res.json();
      setHexData(data)
  
      // console.log('RPC payload:', { scenario: selectedScenario, groups });
      // console.log('RPC response (h3_cell, compliance_avg):', data);
  
      setConfigOpen(false);
    } catch (e) {
      console.error('PostgREST RPC failed:', e);
    }
  }

  const isFormValid = selectedScenario && thresholds.length > 0
  const canAddThreshold = currentTransportMode && currentTravelTime && currentSelectedDestinations.length > 0

  const applyPreset = (presetType: string) => {
    // Clear existing thresholds
    setThresholds([])

    if (presetType === "15-minute-city") {
      const preset: Threshold = {
        id: `threshold-${Date.now()}`,
        transportMode: "walking",
        travelTime: "15",
        selectedDestinations: ["supermarket", "park", "school", "doctor", "restaurant"],
      }
      setThresholds([preset])
    } else if (presetType === "older-adult") {
      const preset: Threshold = {
        id: `threshold-${Date.now()}`,
        transportMode: "walking",
        travelTime: "10",
        selectedDestinations: ["supermarket", "park", "doctor", "restaurant"],
      }
      setThresholds([preset])
    }
  }

  return (
    <div className="h-screen w-full relative bg-gray-50">

      <HexMap hexData={hexData} />

      {/* Config Button */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="fixed top-4 right-4 z-10 shadow-lg">
            <Settings className="h-5 w-5 mr-2" />
            Configure
          </Button>
        </DialogTrigger>
        <DialogContent className=" sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>X-Minute City Analysis Configuration</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Travel Scenario Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Travel Time Scenario</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a travel scenario" />
                  </SelectTrigger>
                  <SelectContent>
                    {travelScenarios.map((scenario) => (
                      <SelectItem key={scenario.value} value={scenario.value}>
                        {scenario.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Thresholds Configuration and Table */}
            <Card>
              <CardHeader>
                <CardTitle>Compliance Thresholds</CardTitle>
                <div className="flex gap-4 mt-2">
                  <Button variant="outline" size="sm" onClick={() => applyPreset("15-minute-city")} className="text-xs">
                    15-Minute City
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("older-adult")} className="text-xs">
                    Older Adult
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Form for adding thresholds */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2 w-full">
                    <Label>Transport Mode</Label>
                    <Select value={currentTransportMode} onValueChange={setCurrentTransportMode}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {transportModes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Time Limit (min)</Label>
                    <Input
                      type="number"
                      placeholder=""
                      value={currentTravelTime}
                      onChange={(e) => setCurrentTravelTime(e.target.value)}
                      min="1"
                      max="30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destinations</Label>
                    <Popover open={destinationsOpen} onOpenChange={setDestinationsOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={destinationsOpen}
                          className="w-full justify-between bg-transparent"
                        >
                          {currentSelectedDestinations.length === 0
                            ? "Select..."
                            : `${currentSelectedDestinations.length} selected`}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search destinations..." />
                          <CommandList>
                            <CommandEmpty>No destinations found.</CommandEmpty>
                            <CommandGroup>
                              {destinationTypes.map((destination) => (
                                <CommandItem
                                  key={destination.value}
                                  value={destination.value}
                                  onSelect={() => handleDestinationToggle(destination.value)}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      currentSelectedDestinations.includes(destination.value)
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
                  </div>
                  <div>
                    <Button
                      onClick={addThreshold}
                      disabled={!canAddThreshold}
                      className="flex items-center gap-2 w-full"
                    >
                      <Plus className="h-4 w-4" />
                      Add Threshold
                    </Button>
                  </div>
                </div>

                {/* Thresholds Table */}
                {thresholds.length > 0 && (
                  <div className="mt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Transport Mode</TableHead>
                          <TableHead>Time Limit</TableHead>
                          <TableHead>Destinations</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {thresholds.map((threshold) => (
                          <TableRow key={threshold.id}>
                            <TableCell className="font-medium">
                              {getTransportModeLabel(threshold.transportMode)}
                            </TableCell>
                            <TableCell>{threshold.travelTime} min</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {threshold.selectedDestinations.map((destination) => (
                                  <Badge key={destination} variant="outline" className="text-xs">
                                    <span className="mr-1">{getDestinationIcon(destination)}</span>
                                    {getDestinationLabel(destination)}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteThreshold(threshold.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-center space-x-4 pt-4">
              <Button onClick={handleAnalyze} disabled={!isFormValid} size="lg" className="px-8">
                Run Analysis
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setSelectedScenario("")
                  setThresholds([])
                  setCurrentTransportMode("")
                  setCurrentTravelTime("")
                  setCurrentSelectedDestinations([])
                }}
              >
                Reset Configuration
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Bar (optional - shows current config) */}
      {(selectedScenario || thresholds.length > 0) && (
        <div className="fixed bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-sm">
          <div className="space-y-1">
            {selectedScenario && (
              <div>
                <strong>Scenario:</strong> {travelScenarios.find((s) => s.value === selectedScenario)?.label}
              </div>
            )}
            {thresholds.length > 0 && (
              <div>
                <strong>Thresholds:</strong> {thresholds.length} configured
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
