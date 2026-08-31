import { describe, expect, it } from "vitest"
import {
  getHexLineWidthMinPixels,
  getHexPerformanceVariant,
  getMapPerformanceMode,
  isHexLayerPickable,
  shouldRenderMapOverlay,
  shouldUseHexPerformanceFixture,
} from "@/components/map-performance"

describe("getMapPerformanceMode", () => {
  it("uses normal map mode by default", () => {
    expect(getMapPerformanceMode("")).toBe("normal")
    expect(getMapPerformanceMode("?foo=base")).toBe("normal")
  })

  it("enables base map diagnostics mode from the query string", () => {
    expect(getMapPerformanceMode("?mapPerfMode=base")).toBe("base")
  })
})

describe("getHexPerformanceVariant", () => {
  it("uses smooth hex rendering by default", () => {
    expect(getHexPerformanceVariant("")).toBe("smooth")
    expect(getHexPerformanceVariant("?hexPerfVariant=smooth")).toBe("smooth")
  })

  it("enables no-picking diagnostics rendering from the query string", () => {
    expect(getHexPerformanceVariant("?hexPerfVariant=no-picking")).toBe("no-picking")
  })
})

describe("shouldUseHexPerformanceFixture", () => {
  it("only enables the hex fixture explicitly", () => {
    expect(shouldUseHexPerformanceFixture("")).toBe(false)
    expect(shouldUseHexPerformanceFixture("?mapPerfFixture=hex")).toBe(true)
  })
})

describe("shouldRenderMapOverlay", () => {
  it("does not render Deck overlay in base map diagnostics mode", () => {
    expect(shouldRenderMapOverlay({ performanceMode: "base", layerCount: 2 })).toBe(false)
  })

  it("does not render an empty Deck overlay in normal mode", () => {
    expect(shouldRenderMapOverlay({ performanceMode: "normal", layerCount: 0 })).toBe(false)
  })

  it("renders Deck overlay when normal mode has layers", () => {
    expect(shouldRenderMapOverlay({ performanceMode: "normal", layerCount: 1 })).toBe(true)
  })
})

describe("isHexLayerPickable", () => {
  it("requires rendered hex cells", () => {
    expect(isHexLayerPickable({ hexCellCount: 0 })).toBe(false)
    expect(isHexLayerPickable({ hexCellCount: 10 })).toBe(true)
  })

  it("can disable picking for diagnostics", () => {
    expect(
      isHexLayerPickable({
        hexCellCount: 10,
        variant: "no-picking",
      })
    ).toBe(false)
  })
})

describe("hex interaction optimization", () => {
  it("uses lighter outlines for smooth hex rendering", () => {
    expect(getHexLineWidthMinPixels({ variant: "smooth" })).toBe(0.35)
    expect(getHexLineWidthMinPixels({ variant: "no-picking" })).toBe(0)
  })
})
