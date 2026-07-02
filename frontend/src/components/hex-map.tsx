import * as React from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Map, NavigationControl, useControl, useMap } from "react-map-gl/maplibre"
import { H3HexagonLayer } from "deck.gl"
import { PolygonLayer } from "@deck.gl/layers"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import "maplibre-gl/dist/maplibre-gl.css"
import { colorBins } from "@deck.gl/carto"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import FreehandMode from "mapbox-gl-draw-freehand-mode"
import type {
  DrawEvent,
  HexMapCell,
  HexMapDeckObject,
  HexMapProps,
  MapWithEvents,
  MapboxDrawRef,
} from "@/app-types"
import { INITIAL_VIEW_STATE, MAP_STYLE } from "@/app-config"

const DRAW_STYLES = [
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#D20C0C",
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#D20C0C",
      "fill-outline-color": "#D20C0C",
      "fill-opacity": 0,
    },
  },
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "midpoint"],
    ],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#D20C0C",
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-halo-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#FFF",
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#D20C0C",
    },
  },
] as unknown as MapboxDraw.MapboxDrawOptions["styles"]

type DeckGLOverlayProps = ConstructorParameters<typeof DeckOverlay>[0]

function DeckGLOverlay(props: DeckGLOverlayProps) {
  const overlay = useControl(() => new DeckOverlay(props))
  overlay.setProps(props)
  return null
}

function DrawControl({
  drawRef,
  onUpdate,
  onDelete,
}: {
  drawRef?: MapboxDrawRef
  onUpdate: (event: DrawEvent) => void
  onDelete: (event: DrawEvent) => void
}) {
  const onUpdateRef = React.useRef(onUpdate)
  const onDeleteRef = React.useRef(onDelete)

  React.useEffect(() => {
    onUpdateRef.current = onUpdate
    onDeleteRef.current = onDelete
  })

  const stableOnUpdate = React.useCallback(
    (event: unknown) => onUpdateRef.current(event as DrawEvent),
    []
  )
  const stableOnDelete = React.useCallback(
    (event: unknown) => onDeleteRef.current(event as DrawEvent),
    []
  )

  const draw = (useControl as (...args: unknown[]) => MapboxDraw)(
    () => new MapboxDraw({
      displayControlsDefault: false,
      defaultMode: "simple_select",
      styles: DRAW_STYLES,
      modes: {
        ...MapboxDraw.modes,
        draw_polygon: FreehandMode,
      },
    }),
    ({ map }: { map: MapWithEvents }) => {
      map.on("draw.create", stableOnUpdate)
      map.on("draw.update", stableOnUpdate)
      map.on("draw.delete", stableOnDelete)
    },
    ({ map }: { map: MapWithEvents }) => {
      map.off("draw.create", stableOnUpdate)
      map.off("draw.update", stableOnUpdate)
      map.off("draw.delete", stableOnDelete)
    },
  )

  React.useEffect(() => {
    if (drawRef) drawRef.current = draw
    return () => {
      if (drawRef) drawRef.current = null
    }
  }, [draw, drawRef])

  return null
}

function DrawToolbar({
  drawRef,
  onClearPolygons,
}: {
  drawRef?: MapboxDrawRef
  onClearPolygons?: () => void
}) {
  const [isDrawing, setIsDrawing] = React.useState(false)
  const { current: map } = useMap()

  React.useEffect(() => {
    if (!map) return
    const handleModeChange = (event: unknown) => {
      setIsDrawing((event as { mode: string }).mode === "draw_polygon")
    }
    map.on("draw.modechange", handleModeChange as (...args: unknown[]) => void)
    return () => {
      map.off("draw.modechange", handleModeChange as (...args: unknown[]) => void)
    }
  }, [map])

  const handleToggleDraw = React.useCallback(() => {
    const draw = drawRef?.current
    if (!draw) return

    if (draw.getMode() === "draw_polygon") {
      draw.changeMode("simple_select")
    } else {
      const all = draw.getAll()
      const ids = (all.features as any[])
        .map((feature) => feature.id)
        .filter((id): id is string => typeof id === "string")
      if (ids.length > 0) {
        draw.delete(ids)
      }
      onClearPolygons?.()

      draw.changeMode("draw_polygon")
    }
  }, [drawRef, onClearPolygons])

  const handleDelete = React.useCallback(() => {
    const draw = drawRef?.current
    if (!draw) return
    const all = draw.getAll()
    const ids = (all.features as any[])
      .map((feature) => feature.id)
      .filter((id): id is string => typeof id === "string")
    if (ids.length > 0) {
      draw.delete(ids)
    }
    onClearPolygons?.()
  }, [drawRef, onClearPolygons])

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 29,
    height: 29,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  }

  return (
    <div
      className="maplibregl-ctrl maplibregl-ctrl-group"
      style={{ position: "fixed", top: 107, left: 10, zIndex: 10 }}
    >
      <button
        title={isDrawing ? "Cancel" : "Make selection"}
        onClick={handleToggleDraw}
        style={{ ...btnStyle, backgroundColor: isDrawing ? "#dbeafe" : undefined }}
      >
        <Pencil size={15} color={isDrawing ? "#2563eb" : "#333"} />
      </button>
      <button
        title="Clear selection"
        onClick={handleDelete}
        style={btnStyle}
      >
        <Trash2 size={15} color="#333" />
      </button>
    </div>
  )
}

export function HexMap({
  hexData,
  indicator,
  fillBounds,
  fillColors,
  gridOpacity = 0.3,
  selectedCellIds,
  drawnPolygons,
  onCellClick,
  onPolygonsChange,
  drawRef,
  children,
}: HexMapProps) {
  const getColorFunction = React.useMemo(
    () =>
      colorBins({
        attr: (row: HexMapCell) => row.value ?? 0,
        domain: fillBounds.slice(1, -1),
        colors: fillColors,
      }),
    [fillBounds, fillColors]
  )

  const noDataColor: [number, number, number, number] = [200, 200, 200, 60]

  const layers = React.useMemo(() => {
    const hexLayer = new H3HexagonLayer({
      id: `H3HexagonLayer-${indicator}`,
      data: hexData,
      elevationScale: 1000,
      extruded: false,
      filled: true,
      getElevation: (row: HexMapCell) => row.value ?? 0,
      getFillColor: (row: HexMapCell, info: unknown) => {
        if (row.value === null || row.value === undefined) return noDataColor
        const baseColor = getColorFunction(row, info as never)
        if (selectedCellIds.size > 0 && !selectedCellIds.has(row.h3_cell)) {
          return [...baseColor.slice(0, 3), 50] as [number, number, number, number]
        }
        return baseColor
      },
      getLineColor: () => [255, 255, 255, 255] as [number, number, number, number],
      lineWidthMinPixels: 1,
      getHexagon: (row: HexMapCell) => row.h3_cell,
      wireframe: false,
      pickable: true,
      opacity: gridOpacity,
      updateTriggers: {
        getElevation: indicator,
        getFillColor: [indicator, selectedCellIds],
        getLineColor: [selectedCellIds],
      },
    })

    const polygonFeatures = (drawnPolygons ?? []).filter(
      (feature: GeoJSON.Feature) => feature.geometry?.type === "Polygon"
    ) as GeoJSON.Feature<GeoJSON.Polygon>[]

    const polygonLayer =
      polygonFeatures.length > 0
        ? new PolygonLayer({
            id: "DrawnPolygonLayer",
            data: polygonFeatures,
            getPolygon: (feature) => feature.geometry.coordinates,
            getFillColor: [210, 12, 12, 0],
            getLineColor: [210, 12, 12, 255],
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            pickable: false,
          })
        : null

    return polygonLayer ? [hexLayer, polygonLayer] : [hexLayer]
  }, [hexData, indicator, selectedCellIds, getColorFunction, drawnPolygons, gridOpacity])

  const handlePolygonUpdate = React.useCallback(
    (event: DrawEvent) => {
      if (!onPolygonsChange) return
      const draw = drawRef?.current

      if (draw) {
        const all = draw.getAll()
        const features = all.features as GeoJSON.Feature[]

        if (features.length > 1) {
          const idsToDelete = features
            .slice(0, -1)
            .map((feature) => feature.id)
            .filter((id): id is string => typeof id === "string")
          if (idsToDelete.length > 0) {
            draw.delete(idsToDelete)
          }
        }

        onPolygonsChange(draw.getAll().features as GeoJSON.Feature[])
      } else {
        const features = event.features
        const last = features[features.length - 1]
        onPolygonsChange(last ? [last] : [])
      }
    },
    [onPolygonsChange, drawRef]
  )

  const handlePolygonDelete = React.useCallback(
    (event: DrawEvent) => {
      if (!onPolygonsChange) return
      const draw = drawRef?.current
      onPolygonsChange(draw ? (draw.getAll().features as GeoJSON.Feature[]) : event.features)
    },
    [onPolygonsChange, drawRef]
  )

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
      <DeckGLOverlay
        layers={layers}
        onClick={(info) => {
          const object = (info as { object?: HexMapDeckObject | null }).object ?? null
          onCellClick?.(object)
        }}
        getTooltip={(info) => {
          const object = (info as { object?: HexMapDeckObject | null }).object ?? null
          if (!object) return null
          const value = object.value ?? null
          if (value === null) return "No data"

          const isCompliance = indicator.includes("compliance")
          const compliance = object.compliance_weighted_avg ?? null
          const indicatorValue =
            indicator === "compliance_weighted_avg"
              ? ""
              : isCompliance
                ? `\nValue: ${Math.round(value * 100)}%`
                : `\nValue: ${value} minutes`

          return `Compliance: ${compliance === null ? "No data" : `${Math.round(compliance * 100)}%`}${indicatorValue}`
        }}
      />
      <NavigationControl position="top-left" />
      {children}
      <DrawControl
        drawRef={drawRef}
        onUpdate={handlePolygonUpdate}
        onDelete={handlePolygonDelete}
      />
      <DrawToolbar
        drawRef={drawRef}
        onClearPolygons={() => onPolygonsChange?.([])}
      />
    </Map>
  )
}
