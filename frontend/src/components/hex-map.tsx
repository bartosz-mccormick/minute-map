import * as React from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Map, NavigationControl, useControl, useMap } from "react-map-gl/maplibre"
import { H3HexagonLayer } from "@deck.gl/geo-layers"
import { PolygonLayer } from "@deck.gl/layers"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import { cellToBoundary } from "h3-js"
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
import {
  getHexLineWidthMinPixels,
  getHexPerformanceVariant,
  getMapPerformanceMode,
  isHexLayerPickable,
  shouldRenderMapOverlay,
} from "@/components/map-performance"
import {
  HEX_FILL_LAYER_ID,
  removeHexMapLayer,
  removeSelectedHexMapLayer,
  syncSelectedHexMapLayer,
  syncHexMapLayer,
} from "@/components/maplibre-hex-layer"
import type { HexFeatureCollection } from "@/app-types"

const NO_DATA_COLOR: [number, number, number, number] = [200, 200, 200, 60]

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
type MapProps = React.ComponentProps<typeof Map>

function DeckGLOverlay(props: DeckGLOverlayProps) {
  const overlay = useControl(() => new DeckOverlay(props))
  overlay.setProps(props)
  return null
}

function toRgbaString(color: ArrayLike<number>, alpha = 1) {
  const red = color[0] ?? 0
  const green = color[1] ?? 0
  const blue = color[2] ?? 0
  const sourceAlpha = color[3] ?? 255
  const opacity = Math.max(0, Math.min(1, alpha * (sourceAlpha / 255)))
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`
}

function toNullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function createHexFeatureCollection({
  hexData,
  getColorFunction,
  fillColorOverride,
}: {
  hexData: HexMapCell[]
  getColorFunction: (row: HexMapCell, info: never) => ArrayLike<number>
  fillColorOverride?: string
}): HexFeatureCollection {
  return {
    type: "FeatureCollection",
    features: hexData.map((row) => {
      const value = toNullableFiniteNumber(row.value)
      const bin = toNullableFiniteNumber(row.bin)
      const complianceWeightedAvg = toNullableFiniteNumber(row.compliance_weighted_avg)
      const pop = toNullableFiniteNumber(row.pop)
      const renderRow: HexMapCell = {
        h3_cell: String(row.h3_cell),
        value,
        bin,
        compliance_weighted_avg: complianceWeightedAvg,
        pop,
      }
      const boundary = cellToBoundary(renderRow.h3_cell, true) as [number, number][]
      const ring = [...boundary, boundary[0]]
      const baseColor =
        value === null
          ? NO_DATA_COLOR
          : getColorFunction(renderRow, undefined as never)

      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
        properties: {
          h3_cell: renderRow.h3_cell,
          value,
          bin,
          compliance_weighted_avg: complianceWeightedAvg,
          pop,
          fillColor: fillColorOverride ?? toRgbaString(baseColor, 1),
        },
      }
    }),
  }
}

function getMapLike(map: unknown): Parameters<typeof syncHexMapLayer>[0] {
  const rawMap =
    map && typeof map === "object" && "getMap" in map
      ? (map as { getMap: () => unknown }).getMap()
      : map
  return rawMap as Parameters<typeof syncHexMapLayer>[0]
}

function MapLibreHexLayer({
  data,
  opacity,
  lineWidth,
}: {
  data: HexFeatureCollection
  opacity: number
  lineWidth: number
}) {
  const { current: map } = useMap()
  const mapLikeRef = React.useRef<Parameters<typeof syncHexMapLayer>[0] | null>(null)
  const dataRef = React.useRef(data)
  const opacityRef = React.useRef(opacity)
  const lineWidthRef = React.useRef(lineWidth)

  React.useEffect(() => {
    dataRef.current = data
    opacityRef.current = opacity
    lineWidthRef.current = lineWidth
  }, [data, lineWidth, opacity])

  const syncCurrentLayer = React.useCallback(() => {
    if (!mapLikeRef.current) return
    syncHexMapLayer(
      mapLikeRef.current,
      dataRef.current,
      opacityRef.current,
      lineWidthRef.current
    )
  }, [])

  React.useEffect(() => {
    if (!map) return

    const mapLike = getMapLike(map)
    mapLikeRef.current = mapLike

    const syncLayer = () => {
      syncCurrentLayer()
    }

    if (mapLike.isStyleLoaded()) {
      syncLayer()
    } else {
      mapLike.on("load", syncLayer)
    }

    return () => {
      mapLike.off("load", syncLayer)
      removeHexMapLayer(mapLike)
      if (mapLikeRef.current === mapLike) {
        mapLikeRef.current = null
      }
    }
  }, [map, syncCurrentLayer])

  React.useEffect(() => {
    syncCurrentLayer()
  }, [data, lineWidth, opacity, syncCurrentLayer])

  return null
}

function MapLibreSelectedHexLayer({
  data,
}: {
  data: HexFeatureCollection
}) {
  const { current: map } = useMap()
  const mapLikeRef = React.useRef<Parameters<typeof syncSelectedHexMapLayer>[0] | null>(null)
  const dataRef = React.useRef(data)

  React.useEffect(() => {
    dataRef.current = data
  }, [data])

  const syncCurrentLayer = React.useCallback(() => {
    if (!mapLikeRef.current) return
    syncSelectedHexMapLayer(mapLikeRef.current, dataRef.current)
  }, [])

  React.useEffect(() => {
    if (!map) return

    const mapLike = getMapLike(map)
    mapLikeRef.current = mapLike

    const syncLayer = () => {
      syncCurrentLayer()
    }

    if (mapLike.isStyleLoaded()) {
      syncLayer()
    } else {
      mapLike.on("load", syncLayer)
    }

    return () => {
      mapLike.off("load", syncLayer)
      removeSelectedHexMapLayer(mapLike)
      if (mapLikeRef.current === mapLike) {
        mapLikeRef.current = null
      }
    }
  }, [map, syncCurrentLayer])

  React.useEffect(() => {
    syncCurrentLayer()
  }, [data, syncCurrentLayer])

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
      const ids = (all.features as Array<{ id?: unknown }>)
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
    const ids = (all.features as Array<{ id?: unknown }>)
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
  const performanceMode = getMapPerformanceMode()
  const hexPerformanceVariant = getHexPerformanceVariant()
  const renderNativeHexLayer =
    performanceMode !== "base" &&
    hexData.length > 0
  const getColorFunction = React.useMemo(
    () =>
      colorBins({
        attr: (row: HexMapCell) => row.value ?? 0,
        domain: fillBounds.slice(1, -1),
        colors: fillColors,
      }),
    [fillBounds, fillColors]
  )
  const hexFeatureCollection = React.useMemo(
    () => createHexFeatureCollection({ hexData, getColorFunction }),
    [getColorFunction, hexData]
  )
  const selectedHexFeatureCollection = React.useMemo(
    () =>
      createHexFeatureCollection({
        hexData: hexData.filter((row) => selectedCellIds.has(row.h3_cell)),
        getColorFunction,
        fillColorOverride: "rgba(210, 12, 12, 0.18)",
      }),
    [getColorFunction, hexData, selectedCellIds]
  )
  const nativeHexLineWidth = getHexLineWidthMinPixels({ variant: hexPerformanceVariant })

  const layers = React.useMemo(() => {
    if (performanceMode === "base") return []

    const polygonFeatures = (drawnPolygons ?? []).filter(
      (feature: GeoJSON.Feature) => feature.geometry?.type === "Polygon"
    ) as GeoJSON.Feature<GeoJSON.Polygon>[]
    const mapLayers = []

    if (hexData.length > 0 && !renderNativeHexLayer) {
      mapLayers.push(new H3HexagonLayer({
        id: "H3HexagonLayer",
        data: hexData,
        elevationScale: 1000,
        extruded: false,
        filled: true,
        getElevation: (row: HexMapCell) => row.value ?? 0,
        getFillColor: (row: HexMapCell, info: unknown) => {
          if (row.value === null || row.value === undefined) return NO_DATA_COLOR
          const baseColor = getColorFunction(row, info as never)
          if (selectedCellIds.size > 0 && !selectedCellIds.has(row.h3_cell)) {
            return [...baseColor.slice(0, 3), 50] as [number, number, number, number]
          }
          return baseColor
        },
        getLineColor: () => [255, 255, 255, 255] as [number, number, number, number],
        lineWidthMinPixels: nativeHexLineWidth,
        getHexagon: (row: HexMapCell) => row.h3_cell,
        wireframe: false,
        pickable: isHexLayerPickable({
          hexCellCount: hexData.length,
          variant: hexPerformanceVariant,
        }),
        opacity: gridOpacity,
        updateTriggers: {
          getElevation: indicator,
          getFillColor: [indicator, selectedCellIds],
          getLineColor: [selectedCellIds],
        },
      }))
    }

    if (polygonFeatures.length > 0) {
      mapLayers.push(new PolygonLayer({
        id: "DrawnPolygonLayer",
        data: polygonFeatures,
        getPolygon: (feature) => feature.geometry.coordinates,
        getFillColor: [210, 12, 12, 0],
        getLineColor: [210, 12, 12, 255],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        pickable: false,
      }))
    }

    return mapLayers
  }, [
    hexData,
    indicator,
    selectedCellIds,
    getColorFunction,
    drawnPolygons,
    gridOpacity,
    hexPerformanceVariant,
    nativeHexLineWidth,
    performanceMode,
    renderNativeHexLayer,
  ])
  const renderMapOverlay = shouldRenderMapOverlay({
    performanceMode,
    layerCount: layers.length,
  })
  const handleNativeHexClick = React.useCallback<NonNullable<MapProps["onClick"]>>(
    (event) => {
      if (!renderNativeHexLayer) return
      const mapTarget = event.target as unknown as {
        queryRenderedFeatures?: (
          point: unknown,
          options: { layers: string[] }
        ) => Array<{ properties?: unknown }>
      }
      const feature = mapTarget.queryRenderedFeatures?.(event.point, {
        layers: [HEX_FILL_LAYER_ID],
      })[0]
      const properties = feature?.properties as Partial<HexMapDeckObject> | undefined
      if (!properties || typeof properties.h3_cell !== "string") {
        onCellClick?.(null)
        return
      }

      onCellClick?.(properties as HexMapDeckObject)
    },
    [onCellClick, renderNativeHexLayer]
  )

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
      onClick={renderNativeHexLayer ? handleNativeHexClick : undefined}
      style={{ width: "100%", height: "100%" }}
    >
      {renderNativeHexLayer ? (
        <>
          <MapLibreHexLayer
            data={hexFeatureCollection}
            opacity={gridOpacity}
            lineWidth={nativeHexLineWidth}
          />
          <MapLibreSelectedHexLayer data={selectedHexFeatureCollection} />
        </>
      ) : null}
      {renderMapOverlay ? (
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
      ) : null}
      <NavigationControl position="top-left" />
      {performanceMode === "normal" ? children : null}
      {performanceMode === "normal" ? (
        <>
          <DrawControl
            drawRef={drawRef}
            onUpdate={handlePolygonUpdate}
            onDelete={handlePolygonDelete}
          />
          <DrawToolbar
            drawRef={drawRef}
            onClearPolygons={() => onPolygonsChange?.([])}
          />
        </>
      ) : null}
    </Map>
  )
}
