import * as React from "react"
import * as duckdb from "@duckdb/duckdb-wasm"
import { IconLayer, ScatterplotLayer } from "@deck.gl/layers"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import {
  ChevronDown,
  ChevronUp,
  Layers,
  X,
} from "lucide-react"
import { useControl, useMap } from "react-map-gl/maplibre"
import {
  MAP_OVERLAY_BUTTON_TEXT_CLASS,
  MAP_OVERLAY_BODY_MAIN_CLASS,
  MAP_OVERLAY_META_TEXT_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
} from "@/lib/map-overlay-styles"
import { POI_DESTINATIONS } from "@/app-config"
import { incrementPoiPerfCounter } from "@/components/poi/poiPerfDebug"
import { usePoiViewportSync, type PoiMapLike } from "@/components/poi/usePoiViewportSync"
import { Slider } from "@/components/ui/slider"
import type { Destination } from "@/app-types"

type PoiCategory = Destination["value"]

type PoiRow = {
  poi_id: string
  name: string
  category: PoiCategory
  subtype: string
  lon: number
  lat: number
}

type PoiMarkerRow = {
  marker_id: string
  name: string
  category: PoiCategory | null
  subtype: string
  lon: number
  lat: number
  count: number
  mixed: boolean
}

type PoiPreviewProps = {
  gridTransparency: number
  onGridTransparencyChange: (value: number) => void
  destinationEntrancesEnabled: boolean
}

type RawPoiRow = {
  poi_id?: string
  name?: string
  category?: string
  subtype?: string
  lon?: number
  lat?: number
  geom?: ArrayBuffer | Uint8Array | number[] | string
}

type PoiSource = {
  file: string
  url: string
  query: string
}

const POI_SOURCES: PoiSource[] = [
  {
    file: "entrances.with_names.geoparquet.parquet",
    url: "/data/entrances.with_names.geoparquet.parquet",
    query: `
      SELECT
        CAST(row_number() OVER () AS VARCHAR) AS poi_id,
        __NAME_SELECT__ AS name,
        class_b AS category,
        '' AS subtype,
        geom
      FROM poi_src
      WHERE class_b IN (__CATEGORIES__)
        AND geom IS NOT NULL
    `,
  },
]

const DETAILED_POI_ZOOM = 14
const CLOSE_POI_ZOOM = 17
const LOW_ZOOM_MAX_DOTS = 2500
const MEDIUM_CLUSTER_PIXEL_SIZE = 28
const POI_VIEWPORT_OVERSCAN_RATIO = 0.75
const MAP_CONTROL_HITBOX_WIDTH = 84
const MAP_CONTROL_HITBOX_HEIGHT = 160

const POI_CATEGORIES: Array<{
  value: PoiCategory
  label: string
  icon: string
}> = [
  ...POI_DESTINATIONS,
]


const categoryConfigByValue = new Map(POI_CATEGORIES.map((category) => [category.value, category]))
const iconUrlByCategory = new Map(
  POI_CATEGORIES.map((category) => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <text x="16" y="23" text-anchor="middle" font-size="21">${category.icon}</text>
      </svg>
    `.trim()

    return [category.value, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`]
  })
)
const emptyIconDefinition = {
  url: "",
  width: 32,
  height: 32,
  anchorX: 16,
  anchorY: 16,
}
const iconDefinitionByCategory = new Map(
  POI_CATEGORIES.map((category) => [
    category.value,
    {
      url: iconUrlByCategory.get(category.value) ?? "",
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16,
    },
  ])
)

let poiRowsPromise: Promise<PoiRow[]> | null = null

function DeckGLOverlay(props: ConstructorParameters<typeof DeckOverlay>[0]) {
  const overlay = useControl(() => new DeckOverlay({ interleaved: true, ...props }))
  overlay.setProps({ interleaved: true, ...props })
  return null
}

function sqlList(values: string[]) {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")
}

function getDuckDbFileUrl(url: string) {
  return new URL(url, window.location.href).href
}

function parseWkbPoint(value: RawPoiRow["geom"]): { lon: number; lat: number } | null {
  if (!value) return null

  let bytes: Uint8Array
  if (value instanceof Uint8Array) {
    bytes = value
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value)
  } else if (Array.isArray(value)) {
    bytes = new Uint8Array(value)
  } else if (typeof value === "string") {
    const cleanHex = value.startsWith("\\x") ? value.slice(2) : value
    if (cleanHex.length < 42 || cleanHex.length % 2 !== 0) return null
    bytes = new Uint8Array(cleanHex.length / 2)
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16)
    }
  } else {
    return null
  }

  if (bytes.byteLength < 21) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const littleEndian = view.getUint8(0) === 1
  const geometryType = view.getUint32(1, littleEndian)
  if (geometryType !== 1) return null

  return {
    lon: view.getFloat64(5, littleEndian),
    lat: view.getFloat64(13, littleEndian),
  }
}

function toMarkerRow(poi: PoiRow): PoiMarkerRow {
  return {
    marker_id: poi.poi_id,
    name: poi.name,
    category: poi.category,
    subtype: poi.subtype,
    lon: poi.lon,
    lat: poi.lat,
    count: 1,
    mixed: false,
  }
}

function hashString(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function getPoiStableRank(poi: PoiRow): number {
  return hashString(`${poi.poi_id}:${poi.category}:${poi.lon}:${poi.lat}`) / 0xffffffff
}

function limitPoisForDotLayer(pois: PoiRow[]): PoiRow[] {
  if (pois.length <= LOW_ZOOM_MAX_DOTS) return pois

  const threshold = LOW_ZOOM_MAX_DOTS / pois.length
  return pois.filter((poi) => getPoiStableRank(poi) <= threshold)
}

function buildPixelGridMarkers(
  pois: PoiRow[],
  map: unknown,
  revision: number,
  pixelSize: number
): PoiMarkerRow[] {
  void revision

  const project = (map as { project?: (lngLat: [number, number]) => { x: number; y: number } })?.project
  if (!project) return pois.map(toMarkerRow)

  const groups = new Map<string, PoiRow[]>()
  const ungroupedMarkers: PoiMarkerRow[] = []

  for (const poi of pois) {
    if (poi.category === "park") {
      ungroupedMarkers.push(toMarkerRow(poi))
      continue
    }

    const point = project.call(map, [poi.lon, poi.lat])
    const key = `${Math.floor(point.x / pixelSize)}:${Math.floor(point.y / pixelSize)}`
    const group = groups.get(key)
    if (group) {
      group.push(poi)
    } else {
      groups.set(key, [poi])
    }
  }

  const groupedMarkers = [...groups.entries()].map(([key, group]) => {
    if (group.length === 1) return toMarkerRow(group[0])

    const categories = new Set(group.map((poi) => poi.category))
    const lon = group.reduce((sum, poi) => sum + poi.lon, 0) / group.length
    const lat = group.reduce((sum, poi) => sum + poi.lat, 0) / group.length
    const category = categories.size === 1 ? group[0].category : null

    return {
      marker_id: `cluster-${key}`,
      name: category ? `${group.length} ${categoryConfigByValue.get(category)?.label ?? category}` : `${group.length} POI`,
      category,
      subtype: "",
      lon,
      lat,
      count: group.length,
      mixed: category === null,
    }
  })

  return [...ungroupedMarkers, ...groupedMarkers]
}

function filterPoisOutsideMapControls(
  pois: PoiRow[],
  map: unknown,
  revision: number
): PoiRow[] {
  void revision

  const mapLike = map as {
    project?: (lngLat: [number, number]) => { x: number; y: number }
    getCanvas?: () => HTMLCanvasElement
  }
  if (!mapLike?.project || !mapLike?.getCanvas) return pois

  const canvasWidth = mapLike.getCanvas().clientWidth

  return pois.filter((poi) => {
    const point = mapLike.project?.([poi.lon, poi.lat])
    if (!point) return true

    const isInTopLeftControls =
      point.x <= MAP_CONTROL_HITBOX_WIDTH && point.y <= MAP_CONTROL_HITBOX_HEIGHT
    const isInTopRightControls =
      point.x >= canvasWidth - MAP_CONTROL_HITBOX_WIDTH && point.y <= MAP_CONTROL_HITBOX_HEIGHT

    return !isInTopLeftControls && !isInTopRightControls
  })
}

function filterPoisToViewport(
  pois: PoiRow[],
  map: unknown,
  revision: number
): PoiRow[] {
  void revision

  const getBounds = (map as {
    getBounds?: () => {
      getWest: () => number
      getEast: () => number
      getSouth: () => number
      getNorth: () => number
    }
  })?.getBounds
  if (!getBounds) return pois

  const bounds = getBounds.call(map)
  const west = bounds.getWest()
  const east = bounds.getEast()
  const south = bounds.getSouth()
  const north = bounds.getNorth()
  const lonPadding = (east - west) * POI_VIEWPORT_OVERSCAN_RATIO
  const latPadding = (north - south) * POI_VIEWPORT_OVERSCAN_RATIO

  return pois.filter((poi) => (
    poi.lon >= west - lonPadding &&
    poi.lon <= east + lonPadding &&
    poi.lat >= south - latPadding &&
    poi.lat <= north + latPadding
  ))
}

function toPoiRows(rawRows: RawPoiRow[]): PoiRow[] {
  return rawRows
    .map((row) => {
      const parsedPoint =
        typeof row.lon === "number" && typeof row.lat === "number"
          ? { lon: row.lon, lat: row.lat }
          : parseWkbPoint(row.geom)

      if (
        !parsedPoint ||
        typeof row.category !== "string" ||
        !categoryConfigByValue.has(row.category as PoiCategory)
      ) {
        return null
      }

      return {
        poi_id: row.poi_id || `${row.category}-${parsedPoint.lon}-${parsedPoint.lat}`,
        name: row.name || "",
        category: row.category as PoiCategory,
        subtype: row.subtype || "",
        lon: parsedPoint.lon,
        lat: parsedPoint.lat,
      }
    })
    .filter((row): row is PoiRow => row !== null)
}

async function hasPoiSourceColumn(conn: duckdb.AsyncDuckDBConnection, columnName: string) {
  const result = await conn.query("DESCRIBE poi_src")
  return result
    .toArray()
    .some((row) => {
      const json = row.toJSON() as { column_name?: unknown }
      return String(json.column_name ?? "").toLowerCase() === columnName.toLowerCase()
    })
}

async function loadPois(): Promise<PoiRow[]> {
  if (poiRowsPromise) return poiRowsPromise

  poiRowsPromise = (async () => {
    incrementPoiPerfCounter("loadPois")

    const { createIsolatedDuckDb } = await import("@/db/duckdb/createDuckDb")
    const { db, conn } = await createIsolatedDuckDb()
    const categoryValues = POI_CATEGORIES.map((category) => category.value)
    const poiRows: PoiRow[] = []
    let loadedAnySource = false
    let lastError: unknown = null

    await conn.query("SET enable_geoparquet_conversion = false")

    for (const source of POI_SOURCES) {
      try {
        await db.registerFileURL(
          source.file,
          getDuckDbFileUrl(source.url),
          duckdb.DuckDBDataProtocol.HTTP,
          false
        )

        await conn.query(`
          CREATE OR REPLACE VIEW poi_src AS
          SELECT *
          FROM read_parquet('${source.file}')
        `)

        const nameSelect = await hasPoiSourceColumn(conn, "name")
          ? "COALESCE(CAST(name AS VARCHAR), '')"
          : "''"
        const result = await conn.query(
          source.query
            .replace("__CATEGORIES__", sqlList([...new Set(categoryValues)]))
            .replace("__NAME_SELECT__", nameSelect)
        )
        loadedAnySource = true
        poiRows.push(...toPoiRows(result.toArray().map((row) => row.toJSON() as RawPoiRow)))
      } catch (error) {
        lastError = error
        console.warn(`POI parquet source failed: ${source.file}`, error)
      }
    }

    if (loadedAnySource) return poiRows
    throw lastError
  })()

  return poiRowsPromise
}

export function PoiPreview({
  gridTransparency,
  onGridTransparencyChange,
  destinationEntrancesEnabled,
}: PoiPreviewProps) {
  const { current: map } = useMap()
  const [pois, setPois] = React.useState<PoiRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [viewRevision, setViewRevision] = React.useState(0)
  const [legendOpen, setLegendOpen] = React.useState(false)
  const [desktopLayerOpen, setDesktopLayerOpen] = React.useState(false)
  const [mobileLegendOpen, setMobileLegendOpen] = React.useState(false)
  const [enabledCategories, setEnabledCategories] = React.useState<Set<PoiCategory>>(() => new Set())
  const [hoveredPoiTooltip, setHoveredPoiTooltip] = React.useState<{
    x: number
    y: number
    title: string
    lines: string[]
  } | null>(null)

  const handleViewportSettled = React.useCallback(() => {
    setViewRevision((current) => current + 1)
  }, [])

  const { poiZoomMode, isMapInteracting } = usePoiViewportSync({
    map: map as PoiMapLike | null,
    detailedZoom: DETAILED_POI_ZOOM,
    closeZoom: CLOSE_POI_ZOOM,
    onViewportSettled: handleViewportSettled,
  })

  React.useEffect(() => {
    let cancelled = false

    if (!destinationEntrancesEnabled || enabledCategories.size === 0 || pois.length > 0) {
      setLoading(false)
      return
    }

    setLoading(true)
    loadPois()
      .then((rows) => {
        if (!cancelled) {
          setPois(rows)
          setError(null)
        }
      })
      .catch((reason) => {
        console.error("POI parquet loading failed:", reason)
        if (!cancelled) {
          setError("POI loading failed")
          setPois([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [destinationEntrancesEnabled, enabledCategories.size, pois.length])

  const visiblePois = React.useMemo(
    () => pois.filter((poi) => enabledCategories.has(poi.category)),
    [pois, enabledCategories]
  )
  const viewportPois = React.useMemo(() => {
    incrementPoiPerfCounter("viewportPois")

    return filterPoisToViewport(visiblePois, map, viewRevision)
  }, [map, viewRevision, visiblePois])
  const renderablePois = React.useMemo(
    () => {
      incrementPoiPerfCounter("renderablePois")

      return filterPoisOutsideMapControls(viewportPois, map, viewRevision)
    },
    [map, viewRevision, viewportPois]
  )
  const showDetailedMarkers = poiZoomMode !== "dots"
  const showCloseMarkers = poiZoomMode === "close"
  const enablePoiPicking = !isMapInteracting && showDetailedMarkers
  const markerRadius = showCloseMarkers ? 13 : 12
  const markerLineWidth = showCloseMarkers ? 0.35 : 0.9
  const markerIconSize = showCloseMarkers ? 22 : 20
  const markerRows = React.useMemo(() => {
    incrementPoiPerfCounter("markerRows")

    if (!showDetailedMarkers) {
      return limitPoisForDotLayer(renderablePois).map(toMarkerRow)
    }
    if (showCloseMarkers) return renderablePois.map(toMarkerRow)
    return buildPixelGridMarkers(
      renderablePois,
      map,
      viewRevision,
      MEDIUM_CLUSTER_PIXEL_SIZE
    )
  }, [map, renderablePois, showCloseMarkers, showDetailedMarkers, viewRevision])
  const typedMarkerRows = React.useMemo(
    () => markerRows.filter((marker): marker is PoiMarkerRow & { category: PoiCategory } => !marker.mixed && marker.category !== null),
    [markerRows]
  )
  const mixedMarkerRows = React.useMemo(
    () => markerRows.filter((marker) => marker.mixed),
    [markerRows]
  )

  const poiLayers = React.useMemo(() => {
    incrementPoiPerfCounter("poiLayers")

    if (!destinationEntrancesEnabled) return []

    if (!showDetailedMarkers) {
      return [
        new ScatterplotLayer<PoiMarkerRow>({
          id: "poi-preview-dot-layer",
          data: markerRows,
          getPosition: (marker) => [marker.lon, marker.lat],
          getFillColor: [0, 0, 0],
          getRadius: 2,
          radiusUnits: "pixels",
          radiusMinPixels: 1.5,
          radiusMaxPixels: 3,
          stroked: false,
          filled: true,
          pickable: false,
          opacity: 0.8,
        }),
      ]
    }

    return [
      new ScatterplotLayer<PoiMarkerRow>({
        id: "poi-preview-mixed-cluster-layer",
        data: mixedMarkerRows,
        getPosition: (marker) => [marker.lon, marker.lat],
        getFillColor: [0, 0, 0],
        getRadius: 5,
        radiusUnits: "pixels",
        radiusMinPixels: 5,
        radiusMaxPixels: 5,
        stroked: false,
        filled: true,
        pickable: enablePoiPicking,
        opacity: 0.85,
      }),
      new ScatterplotLayer<PoiMarkerRow>({
        id: "poi-preview-marker-background",
        data: typedMarkerRows,
        getPosition: (marker) => [marker.lon, marker.lat],
        getFillColor: [255, 255, 255],
        getLineColor: [0, 0, 0],
        getLineWidth: markerLineWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: markerLineWidth,
        lineWidthMaxPixels: markerLineWidth,
        getRadius: markerRadius,
        radiusUnits: "pixels",
        radiusMinPixels: markerRadius,
        radiusMaxPixels: markerRadius,
        stroked: true,
        filled: true,
        pickable: enablePoiPicking,
        opacity: 0.95,
      }),
      new IconLayer<PoiMarkerRow & { category: PoiCategory }>({
        id: "poi-preview-marker-icon",
        data: typedMarkerRows,
        getPosition: (marker) => [marker.lon, marker.lat],
        getIcon: (marker) => iconDefinitionByCategory.get(marker.category) ?? emptyIconDefinition,
        getSize: markerIconSize,
        sizeUnits: "pixels",
        pickable: enablePoiPicking,
      }),
    ]
  }, [
    markerIconSize,
    markerLineWidth,
    markerRadius,
    enablePoiPicking,
    mixedMarkerRows,
    markerRows,
    showDetailedMarkers,
    typedMarkerRows,
    destinationEntrancesEnabled,
  ])

  const toggleCategory = React.useCallback((category: PoiCategory) => {
    setEnabledCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  const allCategoriesSelected = enabledCategories.size === POI_CATEGORIES.length
  const handleToggleAllCategories = React.useCallback(() => {
    setEnabledCategories((current) => {
      if (current.size === POI_CATEGORIES.length) return new Set()
      return new Set(POI_CATEGORIES.map((category) => category.value))
    })
  }, [])

  const buildPoiTooltip = React.useCallback((object?: PoiRow | PoiMarkerRow) => {
    if (!object) return null
    if ("mixed" in object && object.mixed) {
      return {
        title: `${object.count} mixed POI`,
        lines: [],
      }
    }
    if (object.category === null) return null

    const config = categoryConfigByValue.get(object.category)
    const label = config ? config.label : object.category
    const title =
      "count" in object && object.count > 1
        ? `${object.count} ${label}`
        : object.name || label

    return {
      title,
      lines: [
        ...(object.name ? [label] : []),
        ...(object.subtype ? [object.subtype] : []),
      ],
    }
  }, [])

  const handlePoiHover = React.useCallback(
    ({ object, x, y }: { object?: PoiRow | PoiMarkerRow; x?: number; y?: number }) => {
      const tooltip = buildPoiTooltip(object)
      if (!tooltip || typeof x !== "number" || typeof y !== "number") {
        setHoveredPoiTooltip(null)
        return
      }

      setHoveredPoiTooltip({
        x,
        y,
        title: tooltip.title,
        lines: tooltip.lines,
      })
    },
    [buildPoiTooltip]
  )

  return (
    <>
      <DeckGLOverlay
        layers={poiLayers}
        onHover={handlePoiHover}
      />
      {hoveredPoiTooltip ? (
        <div
          className="pointer-events-none fixed z-20 rounded-sm bg-slate-800/95 px-3 py-2 shadow-lg"
          style={{
            left: hoveredPoiTooltip.x - 10,
            top: hoveredPoiTooltip.y - 10,
            transform: "translate(-100%, -100%)",
          }}
        >
          <div className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>{hoveredPoiTooltip.title}</div>
          {hoveredPoiTooltip.lines.map((line) => (
            <div key={line} className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setMobileLegendOpen((open) => !open)}
        className="mobile-poi-layer-button maplibregl-ctrl maplibregl-ctrl-group"
        aria-label="Open map layers"
      >
        <Layers size={20} />
      </button>
      <button
        type="button"
        onClick={() => setDesktopLayerOpen((open) => !open)}
        className="desktop-poi-layer-button maplibregl-ctrl maplibregl-ctrl-group"
        aria-label="Open map layers"
      >
        <Layers size={20} />
      </button>
      {mobileLegendOpen ? (
        <button
          type="button"
          className="mobile-poi-backdrop"
          aria-label="Close map layers"
          onClick={() => setMobileLegendOpen(false)}
        />
      ) : null}
      {desktopLayerOpen || mobileLegendOpen ? (
        <div
          className={`poi-legend-panel fixed z-10 w-60 overflow-hidden rounded-md border bg-white/95 p-3 shadow-lg backdrop-blur ${
          mobileLegendOpen ? "is-mobile-open" : ""
        } ${
          desktopLayerOpen ? "is-desktop-open" : ""
        }`}
        style={{
          left: "var(--left-panel-left)",
          top: "var(--poi-legend-top)",
          maxHeight: legendOpen
            ? "min(17rem, calc(100vh - var(--poi-legend-top) - var(--bottom-left-panel-reserve)))"
            : undefined,
        }}
        aria-label="Destination Entrances legend"
      >
        <button
          type="button"
          onClick={() => setMobileLegendOpen(false)}
          className="mobile-poi-close-button mobile-poi-popup-close-button h-6 w-6 items-center justify-center rounded text-black hover:bg-gray-100"
          aria-label="Close map layers"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
        <div className="mobile-layer-grid-slider">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Adjust Grid Transparency</div>
            <div className={`shrink-0 tabular-nums ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>
              {gridTransparency}%
            </div>
          </div>
          <Slider
            value={[gridTransparency]}
            min={0}
            max={100}
            step={1}
            onValueChange={([value]) => onGridTransparencyChange(value)}
            aria-label="Adjust grid transparency"
          />
        </div>
        {destinationEntrancesEnabled ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Destination Entrances</div>
              <div className="flex items-center gap-1">
                {loading ? <div className={MAP_OVERLAY_META_TEXT_CLASS}>Loading</div> : null}
                <button
                  type="button"
                  onClick={() => setLegendOpen((open) => !open)}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
                  aria-label={
                    legendOpen
                      ? "Collapse Destination Entrances legend"
                      : "Expand Destination Entrances legend"
                  }
                >
                  {legendOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
            {error ? (
              <div className={MAP_OVERLAY_META_TEXT_CLASS.replace("text-muted-foreground", "text-red-600")}>{error}</div>
            ) : (
              <div className="grid gap-1">
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={allCategoriesSelected}
                    onChange={handleToggleAllCategories}
                    className="h-3.5 w-3.5"
                  />
                  <span className={MAP_OVERLAY_BODY_MAIN_CLASS}>Select all</span>
                </label>

                {legendOpen ? (
                  <div className="max-h-[12.5rem] overflow-y-auto pb-2 pr-1">
                    <div className="grid gap-1">
                      {POI_CATEGORIES.map((category) => {
                        const enabled = enabledCategories.has(category.value)
                        return (
                          <label
                            key={category.value}
                            className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-100"
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleCategory(category.value)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black bg-white">
                              <span className="text-[11px] leading-none" aria-hidden>
                                {category.icon}
                              </span>
                            </span>
                            <span className={`truncate ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>
                              {category.label}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </>
        ) : null}
        </div>
      ) : null}
    </>
  )
}
