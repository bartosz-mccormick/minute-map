export type MapPerformanceMode = "normal" | "base"
export type HexPerformanceVariant = "smooth" | "no-picking"

export function getMapSearchParam(name: string, search?: string): string | null {
  const query =
    search ??
    (typeof window === "undefined" ? "" : window.location.search)
  return new URLSearchParams(query).get(name)
}

export function getMapPerformanceMode(search?: string): MapPerformanceMode {
  return getMapSearchParam("mapPerfMode", search) === "base" ? "base" : "normal"
}

export function getHexPerformanceVariant(search?: string): HexPerformanceVariant {
  const variant = getMapSearchParam("hexPerfVariant", search)
  if (variant === "no-picking") return "no-picking"
  return "smooth"
}

export function shouldUseHexPerformanceFixture(search?: string): boolean {
  return getMapSearchParam("mapPerfFixture", search) === "hex"
}

export function shouldRenderMapOverlay({
  performanceMode,
  layerCount,
}: {
  performanceMode: MapPerformanceMode
  layerCount: number
}) {
  return performanceMode !== "base" && layerCount > 0
}

export function isHexLayerPickable({
  hexCellCount,
  variant = "smooth",
}: {
  hexCellCount: number
  variant?: HexPerformanceVariant
}) {
  return hexCellCount > 0 && variant !== "no-picking"
}

export function getHexLineWidthMinPixels({
  variant,
}: {
  variant: HexPerformanceVariant
}) {
  if (variant === "no-picking") return 0
  return 0.35
}
