"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Github, Info, Settings, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cellToBoundary } from "h3-js"
import { booleanIntersects } from "@turf/boolean-intersects"
import { polygon as turfPolygon } from "@turf/helpers"
import { EditableThresholdsTable } from "@/components/editable-thresholds-table"
import { EditableWeightsTable } from "@/components/editable-weights-table"
import { NestedDropdownSelect } from "./components/nested-dropdown-select"
import { LocationMapPicker } from "./components/location-map-picker"
import { ComplianceStats } from "@/components/ui/compliance-stats"
import { HexMap } from "./components/hex-map"
import {
  getMapPerformanceMode,
  shouldUseHexPerformanceFixture,
} from "@/components/map-performance"
import { PoiPreview } from "./components/poi_preview"
import { prefetchPois } from "@/components/poi/poiData"
import { useDuckDbClient } from "@/hooks/use-duckdb-client"
import { useMapIndicatorState } from "@/hooks/use-map-indicator-state"
import { useRunAnalysis } from "@/hooks/use-run-analysis"
import { useSelectedCellDetails } from "@/hooks/use-selected-cell-details"
import {
  MAP_OVERLAY_BUTTON_TEXT_CLASS,
  MAP_OVERLAY_BODY_MAIN_CLASS,
  MAP_OVERLAY_BODY_SMALL_CLASS,
  MAP_OVERLAY_DIALOG_TITLE_CLASS,
  MAP_OVERLAY_META_TEXT_CLASS,
  MAP_OVERLAY_PANEL_TITLE_CLASS,
  MAP_OVERLAY_SECTION_TITLE_CLASS,
} from "@/lib/map-overlay-styles"
import {
  fmt,
  INITIAL_SCENARIO,
  DEFAULT_PRESET_ID,
  MAX_TT,
  PRESET_NESTED_OPTIONS,
  PRESETS,
  isMinTravelTimeIndicator,
} from "@/app-config"
import {
  createDefaultThresholds,
  createDefaultWeights,
  getCityDestinations,
  getCityIndicators,
  getCitySingleDestinationIndicators,
  getCityTransportModes,
  loadAppConfigTemplate,
  type ResolvedAppConfig,
} from "@/runtime-app-config"
import type { CityConfig, MapboxDrawApi, Threshold, Weight } from "@/app-types"

const travelScenarios = [
  { value: "current", label: "Current" },
]

function logSelectionTiming(label: string, startedAt: number, details?: Record<string, unknown>) {
  const elapsedMs = performance.now() - startedAt
  console.info(`[selection-timing] ${label}: ${elapsedMs.toFixed(2)}ms`, details ?? {})
}

export default function App() {
  const mapPerformanceMode = getMapPerformanceMode()
  const isBaseMapOnly = mapPerformanceMode === "base"
  const useHexPerformanceFixture = shouldUseHexPerformanceFixture()
  const [appConfig, setAppConfig] = React.useState<ResolvedAppConfig | null>(null)
  const [appConfigError, setAppConfigError] = React.useState<string | null>(null)
  const cityOptions = appConfig?.cities ?? []
  const [selectedCity, setSelectedCity] = React.useState<CityConfig | null>(null)
  const activeDestinations = React.useMemo(
    () => appConfig ? getCityDestinations(selectedCity, appConfig) : [],
    [appConfig, selectedCity]
  )
  const activeTransportModes = React.useMemo(
    () => appConfig ? getCityTransportModes(selectedCity, appConfig) : [],
    [appConfig, selectedCity]
  )
  const activeIndicators = React.useMemo(
    () => appConfig ? getCityIndicators(selectedCity, appConfig) : [],
    [appConfig, selectedCity]
  )
  const activeSingleDestinationIndicators = React.useMemo(
    () => appConfig ? getCitySingleDestinationIndicators(selectedCity, appConfig) : [],
    [appConfig, selectedCity]
  )
  const defaultThresholds = React.useMemo(
    () => createDefaultThresholds(activeDestinations, activeTransportModes),
    [activeDestinations, activeTransportModes]
  )
  const defaultWeights = React.useMemo(
    () => createDefaultWeights(activeDestinations),
    [activeDestinations]
  )
  const [selectedScenario, setSelectedScenario] = React.useState(INITIAL_SCENARIO)
  const [selectedPreset, setSelectedPreset] = React.useState(DEFAULT_PRESET_ID)
  const [thresholds, setThresholds] = React.useState<Threshold[]>([])
  const [weights, setWeights] = React.useState<Weight[]>([])
  const [customThresholds, setCustomThresholds] = React.useState<Threshold[]>([])
  const [customWeights, setCustomWeights] = React.useState<Weight[]>([])
  const [initialLocationSelectionPending, setInitialLocationSelectionPending] = React.useState(true)
  const [autoAnalyzePending, setAutoAnalyzePending] = React.useState(false)
  const [configOpen, setConfigOpen] = React.useState(false)
  const [configScrollControl, setConfigScrollControl] = React.useState<"down" | "up" | null>(null)
  const [mobileBottomPanelOpen, setMobileBottomPanelOpen] = React.useState(true)
  const [gridTransparency, setGridTransparency] = React.useState(65)
  const [poiPrefetchStatus, setPoiPrefetchStatus] = React.useState<"idle" | "loading" | "loaded" | "error">("idle")
  const configDialogRef = React.useRef<HTMLDivElement | null>(null)
  const poiPrefetchTimeoutRef = React.useRef<number | null>(null)
  const selectedCityValueRef = React.useRef<string | null>(null)

  const [drawnPolygons, setDrawnPolygons] = React.useState<GeoJSON.Feature[]>([])
  const drawRef = React.useRef<MapboxDrawApi | null>(null)
  const { ensureDuckDbClient } = useDuckDbClient(useHexPerformanceFixture, selectedCity?.dataBucket)

  React.useEffect(() => {
    let cancelled = false
    loadAppConfigTemplate()
      .then((nextConfig) => {
        if (cancelled) return
        setAppConfig(nextConfig)
        setAppConfigError(null)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("Application config loading failed:", error)
        setAppConfigError(error instanceof Error ? error.message : "Application config could not be loaded.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!selectedCity) return
    const nextCity = cityOptions.find((city) => city.value === selectedCity.value)
    if (nextCity && nextCity !== selectedCity) {
      setSelectedCity(nextCity)
    }
  }, [cityOptions, selectedCity])

  React.useEffect(() => {
    selectedCityValueRef.current = selectedCity?.value ?? null
  }, [selectedCity])
  const {
    selectedCellDetails,
    selectedCellDetailsCellId,
    selectedCellDetailsLoading,
    clearSelectedCellDetails,
    loadSelectedCellDetails,
  } = useSelectedCellDetails(ensureDuckDbClient)
  const {
    selectedIndicator,
    availableIndicators,
    setAvailableIndicators,
    hexData,
    amenityRadarData,
    selectedAmenityRadarData,
    activeBounds,
    activeFillConfig,
    mapDataError,
    setMapDataError,
    clearMapData,
    loadMapData,
    loadAmenityRadarData,
    selectedCellIds,
    setSelectedCellIds,
    selectedCellsData,
    resetSelectedCells,
    handleMapCellClick,
    handleIndicatorChange,
    handleSelectBin,
    handleSelectBins,
    handleSelectRadarBin,
  } = useMapIndicatorState({
    useHexPerformanceFixture,
    ensureDuckDbClient,
    destinations: activeDestinations,
    initialIndicators: activeIndicators,
    drawRef,
    setDrawnPolygons,
    selectedCellDetailsCellId,
    clearSelectedCellDetails,
    loadSelectedCellDetails,
  })

  const resetAnalysisSelection = React.useCallback(() => {
    const draw = drawRef.current
    if (draw) {
      const ids = (draw.getAll().features as Array<{ id?: unknown }>)
        .map((feature) => feature.id)
        .filter((id): id is string => typeof id === "string")
      if (ids.length > 0) {
        draw.delete(ids)
      }
    }

    setDrawnPolygons([])
    resetSelectedCells()
  }, [resetSelectedCells])

  const schedulePoiPrefetch = React.useCallback(() => {
    if (isBaseMapOnly || !selectedCity) return

    const cityValue = selectedCity.value
    const dataBucket = selectedCity.dataBucket
    const delayMs = window.matchMedia("(max-width: 700px)").matches ? 4500 : 2000

    if (poiPrefetchTimeoutRef.current !== null) {
      window.clearTimeout(poiPrefetchTimeoutRef.current)
    }

    setPoiPrefetchStatus("idle")
    poiPrefetchTimeoutRef.current = window.setTimeout(() => {
      const startPrefetch = () => {
        setPoiPrefetchStatus("loading")
        prefetchPois(dataBucket, activeDestinations)
          .then(() => {
            setPoiPrefetchStatus((current) =>
              selectedCityValueRef.current === cityValue && current === "loading" ? "loaded" : current
            )
          })
          .catch(() => {
            setPoiPrefetchStatus((current) =>
              selectedCityValueRef.current === cityValue && current === "loading" ? "error" : current
            )
          })
      }

      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      }

      if (selectedCityValueRef.current !== cityValue) return
      if (idleWindow.requestIdleCallback) {
        idleWindow.requestIdleCallback(startPrefetch, { timeout: 3000 })
      } else {
        startPrefetch()
      }
    }, delayMs)
  }, [activeDestinations, isBaseMapOnly, selectedCity])

  const { loading, handleAnalyze } = useRunAnalysis({
    thresholds,
    weights,
    selectedIndicator,
    ensureDuckDbClient,
    loadMapData,
    loadAmenityRadarData,
    resetSelection: resetAnalysisSelection,
    setAvailableIndicators,
    clearMapData,
    setMapDataError,
    setConfigOpen,
    destinations: activeDestinations,
    transportModes: activeTransportModes,
    baseIndicators: activeIndicators,
    singleDestinationIndicators: activeSingleDestinationIndicators,
    onAnalysisSuccess: schedulePoiPrefetch,
  })

  const polygonSelectedCellIds = React.useMemo(() => {
    if (drawnPolygons.length === 0 || hexData.length === 0) return new Set<string>()
    const drawnFeature = drawnPolygons[0]
    if (!drawnFeature || drawnFeature.geometry.type !== "Polygon") return new Set<string>()

    const startedAt = performance.now()
    const selectedIds = new Set<string>()
    try {
      for (const cell of hexData) {
        try {
          const boundary = cellToBoundary(cell.h3_cell, true) as [number, number][]
          const ring: [number, number][] = [...boundary, boundary[0]]
          const hexPoly = turfPolygon([ring])
          if (booleanIntersects(hexPoly, drawnFeature)) {
            selectedIds.add(cell.h3_cell)
          }
        } catch {
          // Ignore malformed H3 cells.
        }
      }
      return selectedIds
    } finally {
      logSelectionTiming("polygonSelectedCellIds", startedAt, {
        cells_total: hexData.length,
        cells_selected: selectedIds.size,
      })
    }
  }, [drawnPolygons, hexData])

  React.useEffect(() => {
    if (drawnPolygons.length > 0) {
      setSelectedCellIds(polygonSelectedCellIds)
    }
  }, [drawnPolygons, polygonSelectedCellIds])

  const getValue = React.useCallback(
    (d: Record<string, unknown>) => {
      return (d.value as number | null | undefined) ?? null
    },
    []
  )

  const isFormValid =
    selectedScenario &&
    thresholds.length > 0 &&
    thresholds.every(
      (threshold) =>
        threshold.transportMode &&
        threshold.travelTime > 0 &&
        threshold.selectedDestinations.length > 0
    )

  const leftPanelLayoutStyle = {
    "--left-panel-left": "0.75rem",
    "--left-panel-gap": "0.75rem",
    "--left-panel-top": "11.0rem",
    "--grid-transparency-height": "5.75rem",
    "--poi-legend-top": "calc(var(--left-panel-top) + var(--grid-transparency-height) + var(--left-panel-gap))",
    "--bottom-left-panel-reserve": "14.5rem",
  } as React.CSSProperties

  const handleReset = () => {
    setSelectedScenario(INITIAL_SCENARIO)
    setSelectedPreset(DEFAULT_PRESET_ID)
    setThresholds(defaultThresholds)
    setWeights(defaultWeights)
    setCustomThresholds(defaultThresholds)
    setCustomWeights(defaultWeights)
  }

  const applyPreset = React.useCallback((
    presetId: string,
    options: { preserveCustom?: boolean } = {}
  ) => {
    if (presetId === "custom") return false

    const preset = PRESETS[presetId]
    if (!preset) return false

    const nextWeights: Weight[] = activeDestinations.map((destination) => ({
      id: `weight-${destination.value}`,
      selectedDestinations: [destination.value],
      weight: preset.weights[destination.value] ?? 1,
    }))

    const nextThresholds: Threshold[] = activeDestinations.map((destination) => {
      const thresholdPreset =
        preset.thresholds[destination.value] ?? {
          selectedDestinations: [destination.value],
          quantity: 1,
          transportMode: activeTransportModes[0]?.value ?? "walk",
          travelTime: 10,
        }

      return {
        id: crypto.randomUUID(),
        ...thresholdPreset,
      }
    })

    setWeights(nextWeights)
    setThresholds(nextThresholds)
    if (options.preserveCustom === false) {
      setCustomWeights(nextWeights)
      setCustomThresholds(nextThresholds)
    }
    return true
  }, [activeDestinations, activeTransportModes])

  const handleCityChange = (cityValue: string) => {
    if (!appConfig) return
    const nextCity = cityOptions.find((city) => city.value === cityValue)
    if (!nextCity || nextCity.value === selectedCity?.value) return

    const nextDestinations = getCityDestinations(nextCity, appConfig)
    const nextTransportModes = getCityTransportModes(nextCity, appConfig)
    const nextIndicators = getCityIndicators(nextCity, appConfig)
    const nextThresholds = createDefaultThresholds(nextDestinations, nextTransportModes)
    const nextWeights = createDefaultWeights(nextDestinations)

    setSelectedCity(nextCity)
    setSelectedPreset(DEFAULT_PRESET_ID)
    setThresholds(nextThresholds)
    setWeights(nextWeights)
    setCustomThresholds(nextThresholds)
    setCustomWeights(nextWeights)
    setAvailableIndicators(nextIndicators)
    setDrawnPolygons([])
    setPoiPrefetchStatus("idle")
    if (poiPrefetchTimeoutRef.current !== null) {
      window.clearTimeout(poiPrefetchTimeoutRef.current)
      poiPrefetchTimeoutRef.current = null
    }
    resetSelectedCells()
    clearMapData("Run analysis to load map data.")
  }

  React.useEffect(() => {
    return () => {
      if (poiPrefetchTimeoutRef.current !== null) {
        window.clearTimeout(poiPrefetchTimeoutRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    if (!autoAnalyzePending || !selectedCity || loading || !isFormValid) return
    setAutoAnalyzePending(false)
    void handleAnalyze()
  }, [autoAnalyzePending, handleAnalyze, isFormValid, loading, selectedCity])

  const updateConfigScrollControl = React.useCallback(() => {
    const dialog = configDialogRef.current
    if (!dialog) {
      setConfigScrollControl(null)
      return
    }

    const canScroll = dialog.scrollHeight > dialog.clientHeight + 1
    if (!canScroll) {
      setConfigScrollControl(null)
      return
    }

    const isAtBottom = dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 8
    setConfigScrollControl(isAtBottom ? "up" : "down")
  }, [])

  React.useEffect(() => {
    if (!configOpen) return

    const frame = window.requestAnimationFrame(updateConfigScrollControl)
    return () => window.cancelAnimationFrame(frame)
  }, [configOpen, updateConfigScrollControl])

  const handleConfigScrollControlClick = () => {
    const dialog = configDialogRef.current
    if (!dialog || !configScrollControl) return

    dialog.scrollTo({
      top: configScrollControl === "down" ? dialog.scrollHeight : 0,
      behavior: "smooth",
    })
  }

  const renderCitySelectorControl = () => (
    <LocationMapPicker
      cities={cityOptions}
      selectedCity={selectedCity}
      defaultOpen={initialLocationSelectionPending}
      onCityChange={(cityValue) => {
        handleCityChange(cityValue)
        setAutoAnalyzePending(true)
        if (initialLocationSelectionPending) {
          setInitialLocationSelectionPending(false)
        }
      }}
    />
  )

  return (
    <div
      className={`app-shell h-screen w-full relative bg-gray-50 ${
        mobileBottomPanelOpen ? "mobile-bottom-panel-open" : "mobile-bottom-panel-collapsed"
      }`}
      style={leftPanelLayoutStyle}
    >
      <header className="mobile-app-header">
        <img
          className="mobile-app-logo mobile-app-logo-full"
          src="/data/logo/minutemap_logo_text.svg"
          alt="MinuteMap"
        />
        <img
          className="mobile-app-logo mobile-app-logo-mark"
          src="/data/logo/minutemap_logo.svg"
          alt="MinuteMap"
        />
        <nav className="mobile-app-nav" aria-label="Primary navigation">
          <a
            className="mobile-app-icon-button"
            href="https://github.com/bartosz-mccormick/minute-map"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <Github size={18} />
          </a>
        </nav>
        {isBaseMapOnly || !appConfig ? null : (
          <div className="desktop-header-city-control">
            {renderCitySelectorControl()}
          </div>
        )}
      </header>
      {appConfigError ? (
        <div className="main-map-frame">
          <div className="main-map-loading-overlay" role="alert">
            <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Application config failed to load</div>
            <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{appConfigError}</div>
          </div>
        </div>
      ) : !appConfig ? (
        <div className="main-map-frame">
          <div className="main-map-loading-overlay" role="status" aria-live="polite">
            <div className="main-map-loading-spinner" aria-hidden />
            <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Loading application config</div>
          </div>
        </div>
      ) : selectedCity ? (
        <div className="main-map-frame">
          <HexMap
            key={selectedCity.value}
            hexData={hexData}
            indicator={selectedIndicator}
            initialViewState={selectedCity.viewState}
            fillBounds={activeFillConfig.bounds}
            fillColors={activeFillConfig.colors}
            showOverflowBin={isMinTravelTimeIndicator(selectedIndicator)}
            gridOpacity={(100 - gridTransparency) / 100}
            selectedCellIds={selectedCellIds}
            drawnPolygons={drawnPolygons}
            onCellClick={drawnPolygons.length > 0 ? undefined : handleMapCellClick}
            onPolygonsChange={(features) => {
              setDrawnPolygons(features)
              if (features.length === 0) {
                setSelectedCellIds(new Set())
                clearSelectedCellDetails()
              } else {
                clearSelectedCellDetails()
              }
            }}
            drawRef={drawRef}
          >
            {isBaseMapOnly ? null : (
              <PoiPreview
                gridTransparency={gridTransparency}
                onGridTransparencyChange={setGridTransparency}
                dataBucket={selectedCity.dataBucket}
                destinations={activeDestinations}
                prefetchedStatus={poiPrefetchStatus}
              />
            )}
          </HexMap>
          {loading ? (
            <div className="main-map-loading-overlay" role="status" aria-live="polite">
              <div className="main-map-loading-spinner" aria-hidden />
              <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Default calculation running</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mobile-bottom-panel">
      <button
        type="button"
        className="mobile-bottom-panel-handle"
        onClick={() => setMobileBottomPanelOpen((open) => !open)}
        aria-label={mobileBottomPanelOpen ? "Collapse bottom panel" : "Expand bottom panel"}
        aria-expanded={mobileBottomPanelOpen}
      >
        <span className="mobile-bottom-panel-handle-bar" aria-hidden />
        {mobileBottomPanelOpen ? (
          <ChevronDown size={18} aria-hidden />
        ) : (
          <ChevronUp size={18} aria-hidden />
        )}
      </button>
      {isBaseMapOnly ? null : (
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="configure-button fixed top-4 right-4 z-10 shadow-lg">
            <Settings className="h-5 w-5 mr-2" />
            <span className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>Configure</span>
          </Button>
        </DialogTrigger>
        <DialogContent
          className="config-dialog sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto"
        >
          <div
            ref={configDialogRef}
            className="config-dialog-scroll-area overflow-y-auto"
            onScroll={updateConfigScrollControl}
          >
          <DialogHeader>
            <DialogTitle className={MAP_OVERLAY_DIALOG_TITLE_CLASS}>X-Minute City Analysis Configuration</DialogTitle>
            <DialogDescription className="sr-only">
              Configure travel scenario, preference set, weights, and compliance thresholds.
            </DialogDescription>
          </DialogHeader>

          <div className={`space-y-6 py-4 ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>
            <Card>
              <CardHeader>
                <CardTitle className={MAP_OVERLAY_SECTION_TITLE_CLASS}>Travel Time Scenario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Scenario</div>
                    <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                      <SelectTrigger className={MAP_OVERLAY_BODY_MAIN_CLASS}>
                        <SelectValue placeholder="Choose a travel scenario" />
                      </SelectTrigger>
                      <SelectContent>
                        {travelScenarios.map((scenario) => (
                          <SelectItem
                            key={scenario.value}
                            value={scenario.value}
                            className={MAP_OVERLAY_BODY_MAIN_CLASS}
                          >
                            {scenario.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Preference Set</div>
                    <NestedDropdownSelect
                      options={PRESET_NESTED_OPTIONS}
                      value={selectedPreset}
                      className={MAP_OVERLAY_BODY_MAIN_CLASS}
                      textClassName={MAP_OVERLAY_BODY_MAIN_CLASS}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          setSelectedPreset("custom")
                          setThresholds(customThresholds)
                          setWeights(customWeights)
                        } else if (value === DEFAULT_PRESET_ID) {
                          setSelectedPreset(DEFAULT_PRESET_ID)
                          setThresholds(defaultThresholds)
                          setWeights(defaultWeights)
                        } else {
                          setSelectedPreset(value)
                          applyPreset(value)
                        }
                      }}
                      placeholder="Choose a preference set"
                      showPathInLabel={true}
                      pathSeparator=" › "
                    />
                    <div className={MAP_OVERLAY_BODY_MAIN_CLASS}>
                      Selecting a preset will overwrite weights and thresholds.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={MAP_OVERLAY_SECTION_TITLE_CLASS}>Weights</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableWeightsTable
                  weights={weights}
                  setWeights={(next) => {
                    setSelectedPreset("custom")
                    setWeights(next)
                    setCustomWeights(next)
                  }}
                  destinations={activeDestinations}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={MAP_OVERLAY_SECTION_TITLE_CLASS}>Compliance Thresholds</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableThresholdsTable
                  thresholds={thresholds}
                  setThresholds={(next) => {
                    setSelectedPreset("custom")
                    setThresholds(next)
                    setCustomThresholds(next)
                  }}
                  transportModes={activeTransportModes}
                  destinations={activeDestinations}
                  maxTravelTime={MAX_TT}
                />
              </CardContent>
            </Card>

            <div className="config-dialog-actions flex justify-center gap-4 pt-4">
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
                    <span className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>Please wait</span>
                  </>
                ) : (
                  <span className={MAP_OVERLAY_BUTTON_TEXT_CLASS}>Run Analysis</span>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleReset}
              >
                <span className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Reset Configuration</span>
              </Button>
            </div>
          </div>
          </div>
          {configScrollControl ? (
            <button
              type="button"
              className="config-scroll-control"
              onClick={handleConfigScrollControlClick}
              aria-label={
                configScrollControl === "down"
                  ? "Scroll configuration down"
                  : "Scroll configuration up"
              }
            >
              {configScrollControl === "down" ? (
                <ArrowDown size={20} aria-hidden />
              ) : (
                <ArrowUp size={20} aria-hidden />
              )}
            </button>
          ) : null}
        </DialogContent>
      </Dialog>
      )}

      {isBaseMapOnly ? null : (
      <Card
        className={`indicator-panel fixed bottom-4 z-10 bg-white backdrop-blur-sm shadow-lg p-2 ${
          hexData.length > 0 && activeBounds.length > 1 ? "has-chart-data" : ""
        }`}
      >
        <CardContent className="p-3 space-y-3">
          <NestedDropdownSelect
            options={availableIndicators}
            value={selectedIndicator}
            onValueChange={handleIndicatorChange}
            placeholder="Select indicator"
            showPathInLabel
            pathSeparator=": "
            className={MAP_OVERLAY_PANEL_TITLE_CLASS}
            textClassName={MAP_OVERLAY_PANEL_TITLE_CLASS}
          />
          {mapDataError && (
            <div className={`map-data-error ${MAP_OVERLAY_META_TEXT_CLASS}`}>{mapDataError}</div>
          )}
        </CardContent>
      </Card>
      )}

      {((hexData.length > 0 && activeBounds.length > 1) || selectedCellDetailsCellId) && (
        <div className="stats-panel fixed bottom-10 right-4 z-10 w-[380px] space-y-2">
          {hexData.length > 0 && activeBounds.length > 1 && (
            <ComplianceStats
              data={hexData}
              bounds={activeFillConfig.bounds}
              colors={activeFillConfig.colors}
              showOverflowBin={isMinTravelTimeIndicator(selectedIndicator)}
              getValue={getValue}
              amenityRadarData={amenityRadarData}
              selectedAmenityRadarData={selectedAmenityRadarData}
              selectedIndicator={selectedIndicator}
              destinations={activeDestinations}
              onSelectBin={handleSelectBin}
              onSelectBins={handleSelectBins}
              onSelectRadarBin={handleSelectRadarBin}
              selectedCells={selectedCellsData}
              formatValue={fmt}
              indicatorControl={(
                <NestedDropdownSelect
                  options={availableIndicators}
                  value={selectedIndicator}
                  onValueChange={handleIndicatorChange}
                  placeholder="Select indicator"
                  showPathInLabel
                  pathSeparator=": "
                  className={MAP_OVERLAY_PANEL_TITLE_CLASS}
                  textClassName={MAP_OVERLAY_PANEL_TITLE_CLASS}
                  widthClassName="w-full"
                />
              )}
              className="bg-white shadow-lg w-full"
            />
          )}

          {selectedCellDetailsCellId && (
            <Card className="bg-white shadow-lg w-full max-h-48 overflow-y-auto">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className={MAP_OVERLAY_PANEL_TITLE_CLASS}>Selected cell details</div>
                    <div className={`truncate font-mono ${MAP_OVERLAY_META_TEXT_CLASS}`}>
                      {selectedCellDetailsCellId}
                    </div>
                  </div>
                </div>
                {selectedCellDetailsLoading ? (
                  <div className={MAP_OVERLAY_META_TEXT_CLASS}>Loading details...</div>
                ) : selectedCellDetails.length === 0 ? (
                  <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>No details available.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {selectedCellDetails.map((detail) => (
                      <div key={`${detail.amenity}-${detail.mode}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-t pt-2">
                        <div className="min-w-0">
                          <div className={`truncate ${MAP_OVERLAY_BODY_MAIN_CLASS}`}>{detail.amenity}</div>
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>{detail.mode}</div>
                        </div>
                        <div className="text-right">
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>Comp</div>
                          <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{detail.compliance === null ? "No data" : fmt(detail.compliance)}</div>
                        </div>
                        <div className="text-right">
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>Time</div>
                          <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{detail.min_travel_time === null ? "No data" : `${fmt(detail.min_travel_time)}m`}</div>
                        </div>
                        <div className="text-right">
                          <div className={MAP_OVERLAY_META_TEXT_CLASS}>Total</div>
                          <div className={MAP_OVERLAY_BODY_SMALL_CLASS}>{detail.n_total}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
