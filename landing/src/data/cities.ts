export type City = {
  id: string
  name: string
  description: string
  url: string
  coordinates: {
    lat: number
    lng: number
  }
}

export const cities: City[] = [
  {
    id: 'rakosmente',
    name: 'Rakosmente',
    description:
      'A local deployment focused on accessible route discovery and clear location context.',
    url: 'https://minutemapper-rakosmente.up.railway.app/',
    coordinates: {
      lat: 47.4797,
      lng: 19.2526,
    },
  },
  {
    id: 'geretsried',
    name: 'Geretsried',
    description:
      'A city-specific instance that offers a straightforward starting point for accessible local information.',
    url: 'https://minutemapper-geretsried.up.railway.app/',
    coordinates: {
      lat: 47.8617,
      lng: 11.4802,
    },
  },
  {
    id: 'haren-noh',
    name: 'Haren, Brussels',
    description:
      'A local entry point for accessibility mapping presented here as a lightweight draft deployment.',
    url: 'https://minutemapper-haren-noh.up.railway.app/',
    coordinates: {
      lat: 50.888,
      lng: 4.37,
    },
  },
]
