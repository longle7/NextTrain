// Picks each bus stop's landmark: the nearest big, recognizable place (a supermarket, a chain restaurant, a cinema),
// so riders can tell stops apart. Both sides of Harvard St at Beacon St are "Harvard St @ Beacon St"; one is near
// Taco Bell, the other near Trader Joe's. Places are OpenStreetMap elements: { lat, lon, tags }.

export const NEAR_METERS = 75 // a landmark this close is "near"
export const FAR_METERS = 120 // a big (tier 1) place still counts this far, when nothing closer does
export const TWIN_METERS = 150 // same-named stops this close are the two sides of one street
const MAX_NAME = 40 // longer names are usually descriptions, not what's on the sign

const BIG_SHOPS = new Set(['supermarket', 'department_store', 'mall', 'wholesale', 'doityourself', 'hardware', 'electronics', 'furniture'])
const BIG_PLACES = new Set(['cinema', 'theatre', 'library', 'hospital', 'university', 'college', 'townhall', 'arts_centre'])
const FOOD = new Set(['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'ice_cream', 'food_court'])
const CHAIN_SHOPS = new Set(['convenience', 'pharmacy', 'chemist', 'variety_store', 'books', 'bakery'])
const OTHER_PLACES = new Set(['school', 'place_of_worship', 'post_office', 'community_centre', 'fire_station', 'police', 'pharmacy', 'fuel'])

/**
 * 1: big and recognizable (supermarkets, department stores, cinemas, libraries, hospitals, and chains: anything with a
 * brand among food, pharmacies, convenience stores and gas stations). 2: other named restaurants, cafes, schools,
 * churches, post offices. 0: never a landmark (banks, ATMs, phone and clothing stores, salons, offices...), even
 * when OpenStreetMap gives them a brand.
 */
export function tier({ amenity, shop, tourism, leisure, brand }) {
  if (BIG_SHOPS.has(shop) || BIG_PLACES.has(amenity) || tourism === 'museum' || leisure === 'stadium') return 1
  const chainable = FOOD.has(amenity) || CHAIN_SHOPS.has(shop) || amenity === 'pharmacy' || amenity === 'fuel'
  if (chainable && brand) return 1
  if (FOOD.has(amenity) || OTHER_PLACES.has(amenity) || CHAIN_SHOPS.has(shop)) return 2
  return 0
}

/** "Taco Bell" rather than "Taco Bell #1234": a chain's own name when its branch name starts with it. */
export function label({ name, brand }) {
  const shown = brand && name.startsWith(brand) ? brand : name
  return shown.length <= MAX_NAME ? shown.trim() : undefined
}

export function meters(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

// Places bucketed into roughly 110 m cells, so each stop only measures the places around it.
const CELL = 0.001
const cellOf = (lat, lon) => `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`

/** A stop's landmark candidates, best first: within NEAR_METERS by tier then distance, then tier 1 out to FAR_METERS. */
function candidates(stop, grid) {
  const reach = Math.ceil(FAR_METERS / 80) // cells to look across (a cell is at least ~80 m wide at Boston's latitude)
  const [row, col] = [Math.floor(stop.lat / CELL), Math.floor(stop.lon / CELL)]
  const found = []
  for (let r = row - reach; r <= row + reach; r++) {
    for (let c = col - reach; c <= col + reach; c++) {
      for (const place of grid.get(`${r},${c}`) ?? []) {
        const distance = meters(stop, place)
        const near = distance <= NEAR_METERS
        if (near || (place.tier === 1 && distance <= FAR_METERS)) found.push({ ...place, distance, near })
      }
    }
  }
  return found.sort((a, b) => Number(b.near) - Number(a.near) || (a.near ? a.tier - b.tier : 0) || a.distance - b.distance)
}

/**
 * Each stop's landmark name, by stop ID (stops with none are left out).
 * @param stops {{ id: string, name: string, lat: number, lon: number }[]}
 * @param places {{ lat: number, lon: number, tags: Record<string, string> }[]}
 */
export function pickLandmarks(stops, places) {
  const grid = new Map()
  for (const { lat, lon, tags } of places) {
    const name = tags.name && label(tags)
    const t = name ? tier(tags) : 0
    if (!t) continue
    const key = cellOf(lat, lon)
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push({ lat, lon, name, tier: t })
  }

  const ranked = new Map(stops.map((stop) => [stop.id, candidates(stop, grid)]))
  const picks = new Map([...ranked].filter(([, list]) => list.length > 0).map(([id, list]) => [id, list[0]]))

  // Two sides of one street with the same landmark don't tell riders which side is which: the stop farther from it
  // takes its next-best place. With none, it keeps the shared one (its "toward ..." label still tells the sides apart).
  const byName = Map.groupBy(stops, (s) => s.name)
  for (const twins of byName.values()) {
    for (const [i, a] of twins.entries()) {
      for (const b of twins.slice(i + 1)) {
        const [pa, pb] = [picks.get(a.id), picks.get(b.id)]
        if (!pa || !pb || pa.name !== pb.name || meters(a, b) > TWIN_METERS) continue
        const farther = pa.distance > pb.distance ? a : b
        const other = ranked.get(farther.id).find((p) => p.name !== pa.name)
        if (other) picks.set(farther.id, other)
      }
    }
  }
  return Object.fromEntries([...picks].map(([id, p]) => [id, p.name]))
}
