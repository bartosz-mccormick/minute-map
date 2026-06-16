import { useEffect, useRef } from 'react'
import maplibregl, {
  type ExpressionSpecification,
  type LayerSpecification,
  type StyleSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { City } from '../data/cities'

type MapSectionProps = {
  cities: City[]
}

const mapStyleUrl = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
const englishLabelField: ExpressionSpecification = [
  'coalesce',
  ['get', 'name_en'],
  ['get', 'name:latin'],
  ['get', 'name'],
]
const waterLabelLayerIds = new Set([
  'waterway_label',
  'watername_ocean',
  'watername_sea',
  'watername_lake',
  'watername_lake_line',
])

function tuneMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer): LayerSpecification => {
      if (layer.id === 'background') {
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'background-color': '#f7f5f0',
          },
        } as LayerSpecification
      }

      if (layer.id === 'water') {
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'fill-color': '#c6dfe7',
          },
        } as LayerSpecification
      }

      if (layer.type !== 'symbol') {
        return layer
      }

      const symbolLayer = layer as SymbolLayerSpecification

      if (waterLabelLayerIds.has(symbolLayer.id)) {
        return {
          ...symbolLayer,
          layout: {
            ...symbolLayer.layout,
            visibility: 'none',
          },
        }
      }

      return {
        ...symbolLayer,
        layout: {
          ...symbolLayer.layout,
          'text-field': englishLabelField,
        },
      }
    }),
  }
}

function createPopupContent(city: City) {
  const popupContent = document.createElement('article')
  popupContent.className = 'map-popup'

  const label = document.createElement('p')
  label.className = 'map-popup__label'
  label.textContent = 'City deployment'

  const title = document.createElement('h3')
  title.textContent = city.name

  const description = document.createElement('p')
  description.textContent = city.description

  const link = document.createElement('a')
  link.className = 'map-popup__action'
  link.href = city.url
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = 'Open tool'

  popupContent.append(label, title, description, link)

  return popupContent
}

function MapSection({ cities }: MapSectionProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let map: maplibregl.Map | null = null
    let cancelled = false

    async function createMap() {
      const response = await fetch(mapStyleUrl)
      const style = tuneMapStyle((await response.json()) as StyleSpecification)

      if (!mapContainerRef.current || cancelled) {
        return
      }

      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style,
        center: [9.6, 50.6],
        zoom: 5,
        minZoom: 4,
        attributionControl: false,
      })

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      cities.forEach((city) => {
        const markerElement = document.createElement('button')
        markerElement.type = 'button'
        markerElement.className = 'map-pin'
        markerElement.setAttribute('aria-label', `Open details for ${city.name}`)
        markerElement.innerHTML =
          '<span class="map-pin__shape"><span class="map-pin__core"></span></span>'

        new maplibregl.Marker({ element: markerElement, anchor: 'bottom' })
          .setLngLat([city.coordinates.lng, city.coordinates.lat])
          .setPopup(
            new maplibregl.Popup({
              offset: 28,
              closeButton: true,
              maxWidth: '280px',
            }).setDOMContent(createPopupContent(city)),
          )
          .addTo(map!)
      })
    }

    void createMap()

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [cities])

  return (
    <section className="map-section" id="cities" aria-labelledby="map-title">
      <h2 id="map-title" className="map-section__title">
        Available cities
      </h2>
      <div
        ref={mapContainerRef}
        className="map-frame map-canvas"
        role="application"
        aria-label="Map of available city locations"
      />
    </section>
  )
}

export default MapSection
