import {
  DEFAULT_PRESET_ID,
  R2_BUCKET,
  getDataFileUrl,
} from "@/app-config"
import type { CityConfig, Destination, NestedOption, Threshold, TransportMode, Weight } from "@/app-types"

export type ResolvedAppConfig = {
  cities: CityConfig[]
  destinations: Destination[]
  transportModes: TransportMode[]
  indicators: NestedOption[]
  singleDestinationIndicators: NestedOption[]
}

type RuntimeCityConfig = Partial<CityConfig> & {
  id?: string
  name?: string
  dataBucket?: string | null
  dataPath?: string
  bucket?: string
  amenities?: unknown
  destinations?: unknown
  modes?: unknown
  transportModes?: unknown
  indicators?: unknown
  singleDestinationIndicators?: unknown
}

type RuntimeAppConfig = {
  cities?: unknown
  amenities?: unknown
  destinations?: unknown
  modes?: unknown
  transportModes?: unknown
  indicators?: unknown
  singleDestinationIndicators?: unknown
}

const APP_CONFIG_FILE = import.meta.env.VITE_APP_CONFIG_FILE?.trim() || "app-config.json"

export class AppConfigLoadError extends Error {
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = "AppConfigLoadError"
    this.details = details
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeModeValue(labelOrValue: string) {
  const base = labelOrValue.toLowerCase().replace(/\([^)]*\)/g, "").trim()
  if (base === "walking" || base === "walk") return "walk"
  if (base === "cycling" || base === "bike" || base === "biking") return "bike"
  return base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function toTitleLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeDestination(value: unknown): Destination | null {
  const record = asRecord(value)
  if (!record) {
    const stringValue = asString(value)
    return stringValue ? { value: stringValue, label: toTitleLabel(stringValue), icon: "" } : null
  }

  const destinationValue = asString(record.value) ?? asString(record.id) ?? asString(record.key)
  if (!destinationValue) return null

  return {
    value: destinationValue,
    label: asString(record.label) ?? asString(record.name) ?? toTitleLabel(destinationValue),
    icon: asString(record.icon) ?? "",
  }
}

function normalizeMode(value: unknown): TransportMode | null {
  const record = asRecord(value)
  if (!record) {
    const label = asString(value)
    return label ? { value: normalizeModeValue(label), label: toTitleLabel(label) } : null
  }

  const rawValue = asString(record.value) ?? asString(record.id) ?? asString(record.mode)
  const label = asString(record.label) ?? asString(record.name) ?? rawValue
  if (!rawValue && !label) return null

  return {
    value: normalizeModeValue(rawValue ?? label ?? ""),
    label: label ?? toTitleLabel(rawValue ?? ""),
  }
}

function normalizeIndicator(value: unknown): NestedOption | null {
  const record = asRecord(value)
  if (!record) {
    const stringValue = asString(value)
    return stringValue ? { value: stringValue, label: toTitleLabel(stringValue) } : null
  }

  const indicatorValue = asString(record.value) ?? asString(record.id) ?? asString(record.key)
  if (!indicatorValue) return null

  return {
    value: indicatorValue,
    label: asString(record.label) ?? asString(record.name) ?? toTitleLabel(indicatorValue),
  }
}

function normalizeArray<T>(value: unknown, normalize: (entry: unknown) => T | null) {
  if (!Array.isArray(value)) return []
  const normalized = value.map(normalize).filter((entry): entry is T => entry !== null)
  return normalized
}

function getIndicatorGroup(value: unknown, key: "overall" | "perAmenity") {
  const record = asRecord(value)
  return record ? record[key] : value
}

function normalizeDataBucket(city: RuntimeCityConfig) {
  const explicit = asString(city.dataBucket) ?? asString(city.bucket)
  if (explicit) return explicit.replace(/\/+$/, "")
  const path = asString(city.dataPath)
  if (!path) return null
  return R2_BUCKET ? `${R2_BUCKET.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}` : `/data/${path.replace(/^\/+/, "")}`
}

function normalizeCity(value: unknown): CityConfig | null {
  const city = asRecord(value) as RuntimeCityConfig | null
  if (!city) return null

  const cityValue = asString(city.value) ?? asString(city.id)
  const viewState = asRecord(city.viewState)
  if (!cityValue || !viewState) return null

  const longitude = Number(viewState.longitude)
  const latitude = Number(viewState.latitude)
  const zoom = Number(viewState.zoom)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(zoom)) return null

  return {
    value: cityValue,
    label: asString(city.label) ?? asString(city.name) ?? toTitleLabel(cityValue),
    dataBucket: normalizeDataBucket(city),
    defaultPresetId: asString(city.defaultPresetId) ?? DEFAULT_PRESET_ID,
    viewState: {
      longitude,
      latitude,
      zoom,
      pitch: Number(viewState.pitch ?? 0),
      bearing: Number(viewState.bearing ?? 0),
    },
    amenities: normalizeArray(city.amenities ?? city.destinations, normalizeDestination),
    transportModes: normalizeArray(city.modes ?? city.transportModes, normalizeMode),
    indicators: normalizeArray(getIndicatorGroup(city.indicators, "overall"), normalizeIndicator),
    singleDestinationIndicators: normalizeArray(
      city.singleDestinationIndicators ?? getIndicatorGroup(city.indicators, "perAmenity"),
      normalizeIndicator
    ),
  }
}

function normalizeConfig(rawConfig: RuntimeAppConfig): ResolvedAppConfig {
  const destinations = normalizeArray(
    rawConfig.amenities ?? rawConfig.destinations,
    normalizeDestination
  )
  const transportModes = normalizeArray(
    rawConfig.modes ?? rawConfig.transportModes,
    normalizeMode
  )
  const indicators = normalizeArray(
    getIndicatorGroup(rawConfig.indicators, "overall"),
    normalizeIndicator
  )
  const singleDestinationIndicators = normalizeArray(
    rawConfig.singleDestinationIndicators ?? getIndicatorGroup(rawConfig.indicators, "perAmenity"),
    normalizeIndicator
  )
  const baseConfig = { destinations, transportModes, indicators, singleDestinationIndicators }
  const cities = normalizeArray(
    rawConfig.cities,
    normalizeCity
  )

  if (cities.length === 0) {
    throw new AppConfigLoadError("Application config must define at least one city.")
  }

  for (const city of cities) {
    if (!city.amenities?.length) {
      throw new AppConfigLoadError(`City "${city.value}" must define amenities.`)
    }
    if (!city.transportModes?.length) {
      throw new AppConfigLoadError(`City "${city.value}" must define modes.`)
    }
    if (!city.indicators?.length) {
      throw new AppConfigLoadError(`City "${city.value}" must define indicators.overall.`)
    }
    if (!city.singleDestinationIndicators?.length) {
      throw new AppConfigLoadError(`City "${city.value}" must define indicators.perAmenity.`)
    }
  }

  return { cities, ...baseConfig }
}

export function getRuntimeAppConfigUrls() {
  const urls: string[] = []

  if (APP_CONFIG_FILE) {
    urls.push(getDataFileUrl(APP_CONFIG_FILE))
    urls.push(`/data/${APP_CONFIG_FILE.replace(/^\/+/, "")}`)
  }

  return [...new Set(urls)]
}

export async function loadAppConfigTemplate(): Promise<ResolvedAppConfig> {
  const configUrls = getRuntimeAppConfigUrls()
  const errors: unknown[] = []

  for (const configUrl of configUrls) {
    try {
      const response = await fetch(configUrl, { cache: "no-cache" })
      if (!response.ok) throw new Error(`Config request failed with ${response.status}`)
      return normalizeConfig(await response.json() as RuntimeAppConfig)
    } catch (error) {
      errors.push({ configUrl, error })
    }
  }

  throw new AppConfigLoadError("Application config could not be loaded.", errors)
}

export function getCityDestinations(city: CityConfig | null, config: ResolvedAppConfig) {
  return city?.amenities?.length ? city.amenities : config.destinations
}

export function getCityTransportModes(city: CityConfig | null, config: ResolvedAppConfig) {
  return city?.transportModes?.length ? city.transportModes : config.transportModes
}

export function getCityIndicators(city: CityConfig | null, config: ResolvedAppConfig) {
  return city?.indicators?.length ? city.indicators : config.indicators
}

export function getCitySingleDestinationIndicators(city: CityConfig | null, config: ResolvedAppConfig) {
  return city?.singleDestinationIndicators?.length
    ? city.singleDestinationIndicators
    : config.singleDestinationIndicators
}

export function createDefaultWeights(destinations: Destination[]): Weight[] {
  return destinations.map((destination) => ({
    id: `weight-${destination.value}`,
    selectedDestinations: [destination.value],
    weight: 1,
  }))
}

export function createDefaultThresholds(
  destinations: Destination[],
  transportModes: TransportMode[]
): Threshold[] {
  const transportMode =
    transportModes.find((mode) => mode.value === "walk")?.value ??
    transportModes[0]?.value ??
    "walk"
  return [{
    id: "default-15-minute-city",
    selectedDestinations: destinations.map((destination) => destination.value),
    quantity: 1,
    transportMode,
    travelTime: 15,
  }]
}
