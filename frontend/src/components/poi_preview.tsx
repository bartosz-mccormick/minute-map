import * as React from "react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as duckdb from "@duckdb/duckdb-wasm"
import { IconLayer, ScatterplotLayer } from "@deck.gl/layers"
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox"
import {
  Baby,
  Beer,
  Blocks,
  ChevronDown,
  ChevronUp,
  Coffee,
  Croissant,
  Dumbbell,
  Landmark,
  Library,
  Package,
  Pill,
  School,
  ShoppingCart,
  Stethoscope,
  Trees,
  Utensils,
  type LucideIcon,
} from "lucide-react"
import { useControl, useMap } from "react-map-gl/maplibre"
import {
  MAP_OVERLAY_BUTTON_TEXT_CLASS,
  MAP_OVERLAY_BODY_MAIN_CLASS,
  MAP_OVERLAY_META_TEXT_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
} from "@/lib/map-overlay-styles"

type PoiCategory =
  | "supermarket"
  | "pharmacy"
  | "atm_bank"
  | "post"
  | "gp"
  | "restaurant"
  | "cafe"
  | "bar"
  | "bakery"
  | "school"
  | "kindergarten"
  | "library"
  | "sport"
  | "park"
  | "playground"

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

type RawPoiRow = {
  poi_id?: string
  name?: string
  category?: string
  subtype?: string
  lon?: number
  lat?: number
}

const POI_PARQUET_FILE = "pois_munich_normalized_v5.parquet"
const POI_PARQUET_URL = "/data/pois_munich_normalized_v5.parquet"
const DETAILED_POI_ZOOM = 14
const CLOSE_POI_ZOOM = 17
const MEDIUM_CLUSTER_PIXEL_SIZE = 28
const MAP_CONTROL_HITBOX_WIDTH = 84
const MAP_CONTROL_HITBOX_HEIGHT = 160

const POI_CATEGORIES: Array<{
  value: PoiCategory
  label: string
  Icon: LucideIcon
}> = [
  { value: "supermarket", label: "Supermarket", Icon: ShoppingCart },
  { value: "pharmacy", label: "Pharmacy", Icon: Pill },
  { value: "atm_bank", label: "ATM/Bank", Icon: Landmark },
  { value: "post", label: "Post Office", Icon: Package },
  { value: "gp", label: "General Practitioner", Icon: Stethoscope },
  { value: "restaurant", label: "Restaurant", Icon: Utensils },
  { value: "cafe", label: "Cafe", Icon: Coffee },
  { value: "bar", label: "Bar", Icon: Beer },
  { value: "bakery", label: "Bakery", Icon: Croissant },
  { value: "school", label: "School", Icon: School },
  { value: "kindergarten", label: "Kindergarten", Icon: Baby },
  { value: "library", label: "Library", Icon: Library },
  { value: "sport", label: "Sports Facility", Icon: Dumbbell },
  { value: "park", label: "Park", Icon: Trees },
  { value: "playground", label: "Playground", Icon: Blocks },
]

const categoryConfigByValue = new Map(POI_CATEGORIES.map((category) => [category.value, category]))
const iconUrlByCategory = new Map(
  POI_CATEGORIES.map((category) => {
    const svg = renderToStaticMarkup(
      createElement(category.Icon, {
        color: "#111827",
        size: 24,
        strokeWidth: 1.9,
        absoluteStrokeWidth: true,
      })
    )

    return [category.value, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`]
  })
)

let poiDatabaseIsSetup = false
let poiDatabaseSetupPromise: Promise<void> | null = null
let poiRowsPromise: Promise<PoiRow[]> | null = null

function DeckGLOverlay(props: any) {
  const overlay = useControl(() => new DeckOverlay(props))
  overlay.setProps(props)
  return null
}

function sqlList(values: string[]) {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")
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

function buildMediumZoomMarkers(
  pois: PoiRow[],
  map: unknown,
  revision: number
): PoiMarkerRow[] {
  void revision

  const project = (map as { project?: (lngLat: [number, number]) => { x: number; y: number } })?.project
  if (!project) return pois.map(toMarkerRow)

  const groups = new Map<string, PoiRow[]>()

  for (const poi of pois) {
    const point = project.call(map, [poi.lon, poi.lat])
    const key = `${Math.floor(point.x / MEDIUM_CLUSTER_PIXEL_SIZE)}:${Math.floor(point.y / MEDIUM_CLUSTER_PIXEL_SIZE)}`
    const group = groups.get(key)
    if (group) {
      group.push(poi)
    } else {
      groups.set(key, [poi])
    }
  }

  return [...groups.entries()].map(([key, group]) => {
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

async function setupPoiDatabase() {
  if (poiDatabaseIsSetup) return

  if (!poiDatabaseSetupPromise) {
    poiDatabaseSetupPromise = (async () => {
      const { createDuckDb } = await import("@/db/duckdb/createDuckDb")
      const { db, conn } = await createDuckDb()

      await db.registerFileURL(
        POI_PARQUET_FILE,
        POI_PARQUET_URL,
        duckdb.DuckDBDataProtocol.HTTP,
        false
      )

      await conn.query(`
        CREATE OR REPLACE VIEW poi_src AS
        SELECT *
        FROM read_parquet('${POI_PARQUET_FILE}')
      `)

      poiDatabaseIsSetup = true
    })()
  }

  await poiDatabaseSetupPromise
}

async function loadPois(): Promise<PoiRow[]> {
  if (poiRowsPromise) return poiRowsPromise

  poiRowsPromise = (async () => {
    await setupPoiDatabase()

    const { createDuckDb } = await import("@/db/duckdb/createDuckDb")
    const { conn } = await createDuckDb()

    const result = await conn.query(`
      SELECT
        poi_id,
        COALESCE(name, '') AS name,
        category,
        COALESCE(subtype, '') AS subtype,
        lon,
        lat
      FROM poi_src
      WHERE category IN (${sqlList(POI_CATEGORIES.map((category) => category.value))})
        AND lon IS NOT NULL
        AND lat IS NOT NULL
    `)

    return result
      .toArray()
      .map((row) => row.toJSON() as RawPoiRow)
      .filter((row): row is RawPoiRow & { category: PoiCategory; lon: number; lat: number } => {
        return (
          typeof row.category === "string" &&
          categoryConfigByValue.has(row.category as PoiCategory) &&
          typeof row.lon === "number" &&
          typeof row.lat === "number"
        )
      })
      .map((row) => ({
        poi_id: row.poi_id || `${row.category}-${row.lon}-${row.lat}`,
        name: row.name || "",
        category: row.category,
        subtype: row.subtype || "",
        lon: row.lon,
        lat: row.lat,
      }))
  })()

  return poiRowsPromise
}

export function PoiPreview() {
  const { current: map } = useMap()
  const [pois, setPois] = React.useState<PoiRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [zoom, setZoom] = React.useState(DETAILED_POI_ZOOM)
  const [viewRevision, setViewRevision] = React.useState(0)
  const [legendOpen, setLegendOpen] = React.useState(false)
  const [enabledCategories, setEnabledCategories] = React.useState<Set<PoiCategory>>(() => new Set())
  const [hoveredPoiTooltip, setHoveredPoiTooltip] = React.useState<{
    x: number
    y: number
    title: string
    lines: string[]
  } | null>(null)

  React.useEffect(() => {
    if (!map) return

    const handleMove = () => {
      setZoom(map.getZoom())
    }
    const handleMoveEnd = () => {
      setZoom(map.getZoom())
      setViewRevision((current) => current + 1)
    }

    handleMove()
    map.on("move", handleMove)
    map.on("moveend", handleMoveEnd)

    return () => {
      map.off("move", handleMove)
      map.off("moveend", handleMoveEnd)
    }
  }, [map])

  React.useEffect(() => {
    let cancelled = false

    if (enabledCategories.size === 0 || pois.length > 0) {
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
  }, [enabledCategories.size, pois.length])

  const visiblePois = React.useMemo(
    () => pois.filter((poi) => enabledCategories.has(poi.category)),
    [pois, enabledCategories]
  )
  const renderablePois = React.useMemo(
    () => filterPoisOutsideMapControls(visiblePois, map, viewRevision),
    [map, viewRevision, visiblePois]
  )
  const showDetailedMarkers = zoom >= DETAILED_POI_ZOOM
  const showCloseMarkers = zoom >= CLOSE_POI_ZOOM
  const markerRadius = showCloseMarkers ? 10 : 9
  const markerLineWidth = showCloseMarkers ? 0.35 : 0.9
  const markerIconSize = showCloseMarkers ? 16 : 15
  const markerRows = React.useMemo(() => {
    if (!showDetailedMarkers) return []
    if (showCloseMarkers) return renderablePois.map(toMarkerRow)
    return buildMediumZoomMarkers(renderablePois, map, viewRevision)
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
    if (!showDetailedMarkers) {
      return [
        new ScatterplotLayer<PoiRow>({
          id: "poi-preview-dot-layer",
          data: renderablePois,
          getPosition: (poi) => [poi.lon, poi.lat],
          getFillColor: [0, 0, 0],
          getRadius: 2,
          radiusUnits: "pixels",
          radiusMinPixels: 1.5,
          radiusMaxPixels: 3,
          stroked: false,
          filled: true,
          pickable: true,
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
        pickable: true,
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
        pickable: true,
        opacity: 0.95,
      }),
      new IconLayer<PoiMarkerRow & { category: PoiCategory }>({
        id: "poi-preview-marker-icon",
        data: typedMarkerRows,
        getPosition: (marker) => [marker.lon, marker.lat],
        getIcon: (marker) => ({
          url: iconUrlByCategory.get(marker.category) ?? "",
          width: 24,
          height: 24,
          anchorX: 12,
          anchorY: 12,
        }),
        getSize: markerIconSize,
        sizeUnits: "pixels",
        pickable: true,
      }),
    ]
  }, [
    markerIconSize,
    markerLineWidth,
    markerRadius,
    mixedMarkerRows,
    showDetailedMarkers,
    typedMarkerRows,
    renderablePois,
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
        : object.name || "Unnamed POI"

    return {
      title,
      lines: [label, ...(object.subtype ? [object.subtype] : [])],
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
      <div
        className="fixed z-10 w-60 overflow-hidden rounded-md border bg-white/95 p-3 shadow-lg backdrop-blur"
        style={{
          left: "var(--left-panel-left)",
          top: "var(--poi-legend-top)",
          maxHeight: legendOpen
            ? "min(17rem, calc(100vh - var(--poi-legend-top) - var(--bottom-left-panel-reserve)))"
            : undefined,
        }}
        aria-label="POI legend"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Points of interest</div>
          <div className="flex items-center gap-1">
            {loading ? <div className={MAP_OVERLAY_META_TEXT_CLASS}>Loading</div> : null}
            <button
              type="button"
              onClick={() => setLegendOpen((open) => !open)}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              aria-label={legendOpen ? "Collapse POI legend" : "Expand POI legend"}
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
                          <category.Icon size={13} strokeWidth={1.9} />
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
      </div>
    </>
  )
}
