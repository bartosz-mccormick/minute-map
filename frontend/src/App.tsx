"use client"

import * as React from "react"
import { Settings, Loader2 } from "lucide-react"
import { Map, NavigationControl, useControl } from "react-map-gl/maplibre"
import { H3HexagonLayer } from "deck.gl"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import "maplibre-gl/dist/maplibre-gl.css"
import {colorBins} from "@deck.gl/carto"


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  EditableThresholdsTable,
  type Threshold,
  type TransportMode,
  type Destination,
} from "@/components/editable-thresholds-table"
import {
  EditableWeightsTable,
  type Weight,
} from "@/components/editable-weights-table"

import { NestedDropdownSelect, type NestedOption } from "./components/nested-dropdown-select"

//  import hexes from './assets/data.json'; 

// https://labs.mapbox.com/location-helper/#10.04/48.137/11.5738
const INITIAL_VIEW_STATE = {
  longitude: Number(import.meta.env.VITE_INITIAL_LONGITUDE),
  latitude: Number(import.meta.env.VITE_INITIAL_LATITUDE),
  zoom: Number(import.meta.env.VITE_INITIAL_ZOOM),
  pitch: Number(import.meta.env.VITE_INITIAL_PITCH),
  bearing: Number(import.meta.env.VITE_INITIAL_BEARING),
};


const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"

const MAX_TT = 30

type Color = [number,number,number]
const COMPLIANCE_FILL_BOUNDS = [0, .2, .4, .6, .8, 1]
const COMPLIANCE_FILL_COLORS: Color[] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

//https://colorbrewer2.org/#type=sequential&scheme=Purples&n=7
const TRAVEL_TIME_FILL_BOUNDS = [0, 5, 10, 15, 20, 25, 30]
const TRAVEL_TIME_FILL_COLORS: Color[] = [
  [242, 240, 247],
  [218, 218, 235],
  [188, 189, 220],
  [158, 154, 200],
  [128, 125, 186],
  [106, 81, 163],
  [74, 20, 134],
]




const DESTINATIONS: Destination[] = [
  // Errands & Health
  { value: "grocery", label: "Supermarket", icon: "🛒" },
  { value: "pharmacy", label: "Pharmacy", icon: "💊" },
  { value: "atm_bank", label: "ATM/Bank", icon: "🏧" },
  { value: "post", label: "Post Office", icon: "📦" },
  { value: "gp", label: "General Practitioner", icon: "🩺" },

  // Food & Drink
  { value: "restaurant", label: "Restaurant", icon: "🍽️" },
  { value: "cafe", label: "Cafe", icon: "☕" },
  { value: "bar", label: "Bar", icon: "🍺" },
  { value: "bakery", label: "Bakery", icon: "🥐" },

  // Education & Culture
  { value: "school", label: "School", icon: "🏫" },
  { value: "kindergarten", label: "Kindergarten", icon: "🧸" },
  { value: "library", label: "Library", icon: "📚" },

  // Leisure & Outdoors
  { value: "sport", label: "Sports Facility", icon: "🏃" },
  { value: "park", label: "Park", icon: "🌳" },
  { value: "playground", label: "Playground", icon: "🛝" },
];

const TRANSPORT_MODES: TransportMode[] = [
  { value: "walk", label: "Walking (4 km/h)" },
  { value: "bike", label: "Cycling" },
  //{ value: "public-transport", label: "Public Transport" },
]


const INITIAL_WEIGHTS: Weight[] = [
  {
    id: "weights-entry",
    selectedDestinations: DESTINATIONS.map((d) => d.value),
    weight: 1,
  },
]

const INITIAL_SCENARIO = "current"

const INITIAL_THRESHOLDS: Threshold[] = []


const ALWAYS_AVAILABLE_INDICATORS:  NestedOption[] =
[
  { value: "compliance_weighted_avg", label: "Compliance" }
]

const SINGLE_DESTINATION_INDICATORS = [
  { value: "compliance", label: "Threshold Pass/Fail" },
  { value: "min_travel_time", label: "Time to Nearest" },
  { value: "min_travel_time_X", label: "Time to Nearest X" },

]


function rgb([r, g, b]: Color) {
  return `rgb(${r} ${g} ${b})`
}

function fmt(v: number) {
  return v.toFixed(1).replace(/\.0$/, "")
}

function LegendBands({
  bounds,
  colors,
  formatValue = fmt,
}: {
  bounds: number[]
  colors: Color[]
  formatValue?: (v: number) => string
}) {
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
              <span className="tabular-nums">
                {formatValue(b.from)}–{formatValue(b.to)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}






const getDestinationLabel = (value: string) => {
  return DESTINATIONS.find((d) => d.value === value)?.label || value
}

const getDestinationIcon = (value: string) => {
  return DESTINATIONS.find((d) => d.value === value)?.icon || ""
}

const getModeLabel = (value: string) => {
  return TRANSPORT_MODES.find((d) => d.value === value)?.label || ""
}


function DeckGLOverlay(props: any) {
  const overlay = useControl(() => new DeckOverlay(props))
  overlay.setProps(props)
  return null
}

function HexMap({ hexData, indicator }: { hexData: any[],indicator:string }) {
  // Determine if this is a compliance indicator or travel time indicator
  const isComplianceIndicator = indicator.includes("compliance");
  
  // Helper function to get the value from data based on indicator
  // This needs to be stable for deck.gl to detect changes
  const getIndicatorValue = React.useCallback((d: any): number => {

    // Handle nested indicators like "amenity::mode"
    const parts = indicator.split("::")
    if (parts.length === 1) {
      return d[indicator] ?? 0

    }
    if (parts.length === 3) {
      const [amenity, mode, metric] = parts
      return d.amenities?.[amenity]?.[mode]?.[metric]
    }
    return 0
  }, [indicator, isComplianceIndicator])
  
  const layers = React.useMemo(() => [
    new H3HexagonLayer({
      id: `H3HexagonLayer-${indicator}`,
      data: hexData,
      elevationScale: 1000,
      extruded: false,
      filled: true,
      getElevation: getIndicatorValue,
      getFillColor: colorBins({
        attr: getIndicatorValue,
        domain: isComplianceIndicator 
          ? COMPLIANCE_FILL_BOUNDS.slice(1, -1)
          : TRAVEL_TIME_FILL_BOUNDS.slice(1, -1),
        colors: isComplianceIndicator ? COMPLIANCE_FILL_COLORS : TRAVEL_TIME_FILL_COLORS
      }),
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: .5,
      getHexagon: (d: any) => d.h3_cell,
      wireframe: false,
      pickable: true,
      opacity: .3,
      updateTriggers: {
        getElevation: indicator,
        getFillColor: indicator,
      }
    }),
  ], [hexData, getIndicatorValue, isComplianceIndicator, indicator])


  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle= {MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
<DeckGLOverlay
  layers={layers}
  getTooltip={({ object }: any) => {
    if (!object) return null;

    const amenities = object?.amenities ?? {};
    const lines: string[] = [];
    const lines2: string[] = [];

    // Iterate through amenities
    Object.entries(amenities).forEach(([amenity, amenityData]: [string, any]) => {
      // Check for walk mode (or other modes)
      const walkData = amenityData?.walk;
      if (walkData && typeof walkData === "object") {
        const t = walkData?.min_travel_time;
        const c = walkData?.compliance;
        const display = Number.isFinite(t) ? `${t} min` : `> ${MAX_TT} min`;
        let complies: string;
        if (c === 1) {
          complies = '✅'
        } else if (c === 0) {
          complies = '❌'
        } else {
          complies = '⚠️'
        }
        lines.push(`${getDestinationIcon(amenity)} ${getDestinationLabel(amenity)}: ${display} ${complies}`);
        
        const total_n = walkData?.total_n;
        lines2.push(`${getDestinationIcon(amenity)} ${getDestinationLabel(amenity)}: ${total_n}`);
      }
    });

    //return `Compliance: ${Math.round(object.compliance_weighted_avg*100)}%
    return `Compliance: ${Math.round(object.compliance_weighted_avg * 100)}%
    ${
      indicator !== "compliance_weighted_avg"
        ? isComplianceIndicator
            ? `${Math.round(getIndicatorValue(object) * 100)}%`
            : `${getIndicatorValue(object)} minutes`
        : ""
    }`

  }}
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



export default function app() {
  const [selectedScenario, setSelectedScenario] = React.useState(INITIAL_SCENARIO)
  const [thresholds, setThresholds] = React.useState<Threshold[]>(INITIAL_THRESHOLDS)
  const [weights, setWeights] = React.useState<Weight[]>(INITIAL_WEIGHTS)
  const [configOpen, setConfigOpen] = React.useState(false)
  const [selectedIndicator, setSelectedIndicator] = React.useState("compliance_weighted_avg")
  const [availableIndicators, setAvailableIndicators] = React.useState<NestedOption[]>(
    ALWAYS_AVAILABLE_INDICATORS
  )

  // map data

  const [hexData, setHexData] = React.useState<any[]>([]);


  const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL;

  const [loading, setLoading] = React.useState(false);
  
  const handleAnalyze = async () => {
    setLoading(true);

    // Build amenity_weights from current weights state.
    // If multiple weight entries are ever supported, later ones will override earlier ones per amenity.
    const amenityWeights: Record<string, number> = {};
    for (const entry of weights) {
      for (const amenity of entry.selectedDestinations) {
        amenityWeights[amenity] = entry.weight;
      }
    }





    // Build amenity_thresholds array from thresholds + build mode->amenities
    const amenityToModesSets: Record<string, Set<string>> = {}

    const amenityThresholds = thresholds.map((t) => {
      const mode = t.transportMode

      for (const a of t.selectedDestinations ?? []) {
        const set = (amenityToModesSets[a] ??= new Set<string>())

        if (mode) set.add(mode)
      }

      return {
        mode,
        T: t.travelTime,
        X: t.quantity,
        amenities: t.selectedDestinations,
      }
    })

    // Convert Set -> sorted array
    const amenityToModes: Record<string, string[]> = Object.fromEntries(
      Object.entries(amenityToModesSets).map(([a, set]) => [
        a,
        [...set].sort(),
      ])
    )

    

  
    const payload = {
      amenity_weights: amenityWeights,
      amenity_thresholds: amenityThresholds,
    };

    try {
      const res = await fetch(`${POSTGREST_URL}/rpc/get_compliance_summary_by_amenity_batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Profile': 'api'
        },
        body: JSON.stringify({ _groups: payload }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} – ${text}`);
      }
  
      const data: any[] = await res.json();
      setHexData(data)
  
      console.log('RPC payload:', { scenario: selectedScenario, _groups: payload });
      console.log('RPC response:', data);
      console.log(availableIndicators)

      // calculate weighted average score
      let totalScore = 0; // numerator: total score
      let totalPopulation = 0; // denominator: total population
      
      data.forEach((item) => {
        const pop = item.pop || 0; // population
        const compliance = item.compliance_weighted_avg || 0; // compliance score
        
        // calculate the contribution of each hexagon
        const contribution = pop * compliance;
        
        totalScore += contribution;
        totalPopulation += pop;
      });
      // calculate weighted average score
      const weightedAverage = totalPopulation > 0 ? totalScore / totalPopulation : 0;
      console.log('total score (numerator):', totalScore);
      console.log('total population (denominator):', totalPopulation);
      console.log('weighted average score:', weightedAverage);
  
      setConfigOpen(false);
    } catch (e) {
      console.error('PostgREST RPC failed:', e);
      setAvailableIndicators([])
    } finally{
      setLoading(false);
      

      // update available indicators

      const newIndicatorOptions: NestedOption[] = [
        ...ALWAYS_AVAILABLE_INDICATORS,
        ...Object.entries(amenityToModes).map(([a, modes]) => ({
          value: a ,
          label: getDestinationIcon(a) + getDestinationLabel(a),
          children: modes.map((mode) => ({
            value: a + '::' + mode,
            label: getModeLabel(mode),
            children: SINGLE_DESTINATION_INDICATORS.map((indicator) => ({
              value: a + '::' + mode + '::' + indicator.value,
              label: indicator.label,
            })),
          })),
        })),
      ]

      

      setAvailableIndicators(
        newIndicatorOptions)
    }
  }

  const isFormValid =
    selectedScenario &&
    thresholds.length > 0 &&
    thresholds.every(
      (t) =>
        t.transportMode &&
        t.travelTime > 0 &&
        t.selectedDestinations.length > 0
    )

  const handleReset = () => {
    setSelectedScenario(INITIAL_SCENARIO)
    setThresholds(INITIAL_THRESHOLDS)
    setWeights(INITIAL_WEIGHTS)
  }

  return (
    <div className="h-screen w-full relative bg-gray-50">

      <HexMap hexData={hexData} indicator={selectedIndicator} />


      {/* Config Button */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="fixed top-4 right-4 z-10 shadow-lg">
            <Settings className="h-5 w-5 mr-2" />
            Configure
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
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

            {/* Editable Weights Table */}
            <Card>
              <CardHeader>
                <CardTitle>Weights</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableWeightsTable
                  weights={weights}
                  setWeights={setWeights}
                  destinations={DESTINATIONS}
                />
              </CardContent>
            </Card>

            {/* Editable Thresholds Table */}
            <Card>
              <CardHeader>
                <CardTitle>Compliance Thresholds</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableThresholdsTable
                  thresholds={thresholds}
                  setThresholds={setThresholds}
                  transportModes={TRANSPORT_MODES}
                  destinations={DESTINATIONS}
                  maxTravelTime={MAX_TT}
                />
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-center gap-4 pt-4">
              <Button
                onClick={handleAnalyze}
                disabled={!isFormValid || loading}
                size="lg"
                className="px-8 min-w-[180px]"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait
                  </>
                ) : (
                  "Run Analysis"
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleReset}
              >
                Reset Configuration
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="fixed bottom-4 left-4 z-10 bg-white backdrop-blur-sm shadow-lg p-2">
        <CardContent className="p-3 space-y-3 text-sm">

          <NestedDropdownSelect
            options={availableIndicators}
            value={selectedIndicator}
            onValueChange={setSelectedIndicator}
            placeholder="Select indicator"
            showPathInLabel
            pathSeparator=": "
           />
          <LegendBands
            bounds={selectedIndicator === 'compliance_weighted_avg'?COMPLIANCE_FILL_BOUNDS:TRAVEL_TIME_FILL_BOUNDS}
            colors={selectedIndicator === 'compliance_weighted_avg'?COMPLIANCE_FILL_COLORS:TRAVEL_TIME_FILL_COLORS}
          />
        </CardContent>
        {/* {selectedIndicator.split("::")[0]} */}
      </Card>
    </div>
  )
}
