import * as React from "react"
import { Check, MapPin } from "lucide-react"
import { Map, Marker, NavigationControl } from "react-map-gl/maplibre"
import type { MapRef } from "react-map-gl/maplibre"
import type { CityConfig } from "@/app-types"
import { MAP_STYLE } from "@/app-config"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  MAP_OVERLAY_DIALOG_TITLE_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
} from "@/lib/map-overlay-styles"

type LocationMapPickerProps = {
  cities: CityConfig[]
  selectedCity: CityConfig
  onCityChange: (cityValue: string) => void
}

const OVERVIEW_VIEW_STATE = {
  longitude: 9.6,
  latitude: 50.4,
  zoom: 4.35,
  pitch: 0,
  bearing: 0,
}

type LabelSide = "left" | "right"

export function LocationMapPicker({
  cities,
  selectedCity,
  onCityChange,
}: LocationMapPickerProps) {
  const [open, setOpen] = React.useState(false)
  const mapRef = React.useRef<MapRef | null>(null)
  const labelRefs = React.useRef<Record<string, HTMLSpanElement | null>>({})
  const [labelSides, setLabelSides] = React.useState<Record<string, LabelSide>>({})

  const handleSelectCity = React.useCallback(
    (cityValue: string) => {
      onCityChange(cityValue)
      setOpen(false)
    },
    [onCityChange]
  )

  const updateLabelSides = React.useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const container = map.getContainer()
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    const pinSize = 26.4
    const labelGap = 33.6
    const rectPadding = 4
    const overlapArea = (
      a: { left: number; right: number; top: number; bottom: number },
      b: { left: number; right: number; top: number; bottom: number }
    ) => {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      return width * height
    }

    const nextSides: Record<string, LabelSide> = {}
    const placed: Array<{ left: number; right: number; top: number; bottom: number }> = []

    for (const city of [...cities].sort((a, b) => {
      const pointA = map.project([a.viewState.longitude, a.viewState.latitude])
      const pointB = map.project([b.viewState.longitude, b.viewState.latitude])
      return pointA.y - pointB.y || pointA.x - pointB.x
    })) {
      const point = map.project([city.viewState.longitude, city.viewState.latitude])
      const label = labelRefs.current[city.value]
      const labelWidth = label?.offsetWidth || 160
      const labelHeight = label?.offsetHeight || 28
      const labelTop = point.y - pinSize / 2 - labelHeight / 2
      const candidates: Record<LabelSide, { left: number; right: number; top: number; bottom: number }> = {
        right: {
          left: point.x - pinSize / 2 + labelGap,
          right: point.x - pinSize / 2 + labelGap + labelWidth,
          top: labelTop,
          bottom: labelTop + labelHeight,
        },
        left: {
          left: point.x - pinSize / 2 - labelGap - labelWidth,
          right: point.x - pinSize / 2 - labelGap,
          top: labelTop,
          bottom: labelTop + labelHeight,
        },
      }

      const score = (rect: typeof candidates.right) => {
        const overlap = placed.reduce((sum, placedRect) => sum + overlapArea(rect, placedRect), 0)
        const overflow =
          Math.max(0, -rect.left) +
          Math.max(0, rect.right - containerWidth) +
          Math.max(0, -rect.top) +
          Math.max(0, rect.bottom - containerHeight)
        return overlap * 100 + overflow
      }

      const side: LabelSide = score(candidates.left) < score(candidates.right) ? "left" : "right"

      nextSides[city.value] = side
      placed.push({
        left: candidates[side].left - rectPadding,
        right: candidates[side].right + rectPadding,
        top: candidates[side].top - rectPadding,
        bottom: candidates[side].bottom + rectPadding,
      })
    }

    setLabelSides(nextSides)
  }, [cities])

  React.useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(updateLabelSides)
    return () => window.cancelAnimationFrame(frame)
  }, [open, updateLabelSides])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="location-map-trigger bg-white shadow-lg"
          aria-label={`Change location, currently ${selectedCity.label}`}
          title="Choose on Map"
        >
          <MapPin className="h-4 w-4" aria-hidden />
          <span className={`${MAP_OVERLAY_PANEL_TITLE_CLASS} location-map-trigger-label`}>
            {selectedCity.label}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="location-map-dialog p-0 overflow-hidden">
        <DialogHeader className="location-map-dialog-header">
          <DialogTitle className={MAP_OVERLAY_DIALOG_TITLE_CLASS}>
            Choose location
          </DialogTitle>
        </DialogHeader>
        <div className="location-map-canvas">
          <Map
            ref={mapRef}
            initialViewState={OVERVIEW_VIEW_STATE}
            mapStyle={MAP_STYLE}
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
            onLoad={updateLabelSides}
            onMove={updateLabelSides}
            onZoom={updateLabelSides}
            onResize={updateLabelSides}
          >
            <NavigationControl position="top-left" showCompass={false} />
            {cities.map((city) => {
              const isSelected = city.value === selectedCity.value

              return (
                <Marker
                  key={city.value}
                  longitude={city.viewState.longitude}
                  latitude={city.viewState.latitude}
                  anchor="bottom"
                >
                  <button
                    type="button"
                    className={`location-map-pin label-${labelSides[city.value] ?? "right"} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => handleSelectCity(city.value)}
                    aria-label={`Choose ${city.label}`}
                  >
                    <span className="location-map-pin-shape">
                      {isSelected ? (
                        <Check className="location-map-pin-check" aria-hidden />
                      ) : (
                        <span className="location-map-pin-core" aria-hidden />
                      )}
                    </span>
                    <span
                      ref={(element) => {
                        labelRefs.current[city.value] = element
                      }}
                      className={`${MAP_OVERLAY_PANEL_TITLE_CLASS} location-map-pin-label`}
                    >
                      {city.label}
                    </span>
                  </button>
                </Marker>
              )
            })}
          </Map>
        </div>
      </DialogContent>
    </Dialog>
  )
}
