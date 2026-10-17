// Builds NextTrain.Api/Data/landmarks.json: every MBTA bus stop's landmark ("Taco Bell"), picked by pick.mjs from
// OpenStreetMap. The API copies them into the Stations table when it imports stops.
//   node tools/landmarks/build.mjs            (MBTA_API_KEY optional: without one MBTA allows 20 requests a minute)
// ponytail: run by hand every few months and commit the result; automate it if stores churn faster than that.
import { writeFile } from 'node:fs/promises'
import { pickLandmarks } from './pick.mjs'

const OUT = new URL('../../NextTrain.Api/Data/landmarks.json', import.meta.url)
const OVERPASS = process.env.OVERPASS ?? 'https://overpass-api.de/api/interpreter' // or https://overpass.kumi.systems/api/interpreter when busy
const AGENT = 'NextTrain-landmarks/1.0 (https://github.com/longle7/NextTrain; privacy@longledev.com)'
const TILE = 0.1 // degrees: about 11 by 8 km, a few thousand places per query
const MARGIN = 0.002 // degrees around the stops, so a stop at the edge still sees the places across the street

async function get(url, init = {}, tries = 8) {
  for (let attempt = 1; ; attempt++) {
    // A hung request counts as a 504: without a timeout, fetch waits forever.
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000), headers: { 'User-Agent': AGENT, Accept: 'application/json', ...init.headers } })
      .catch((error) => { if (error.name === 'TimeoutError') return { status: 504 }; throw error })
    if (response.ok) return response.json()
    // Overpass answers 429/504 when busy: wait and try again, as its usage policy asks.
    if (attempt === tries || ![429, 502, 503, 504].includes(response.status)) throw new Error(`${url}: ${response.status}`)
    console.log(`${response.status}, retrying (${attempt}/${tries - 1})`)
    await new Promise((resolve) => setTimeout(resolve, attempt * 15_000))
  }
}

// Every stop a bus serves (MBTA's stop IDs, as the API stores them).
const key = process.env.MBTA_API_KEY ? { 'x-api-key': process.env.MBTA_API_KEY } : {}
const { data } = await get('https://api-v3.mbta.com/stops?filter[route_type]=3&fields[stop]=name,latitude,longitude', { headers: key })
const stops = data
  .filter((s) => s.attributes.latitude != null)
  .map((s) => ({ id: s.id, name: s.attributes.name, lat: s.attributes.latitude, lon: s.attributes.longitude }))
console.log(`${stops.length} bus stops`)

// Named places around them, one tile at a time, skipping tiles with no stops.
const lats = stops.map((s) => s.lat), lons = stops.map((s) => s.lon)
const [south, west] = [Math.min(...lats) - MARGIN, Math.min(...lons) - MARGIN]
const [north, east] = [Math.max(...lats) + MARGIN, Math.max(...lons) + MARGIN]
const places = new Map() // by OSM type and ID: an element on a tile edge comes back twice
for (let s = south; s < north; s += TILE) {
  for (let w = west; w < east; w += TILE) {
    const box = [s - MARGIN, w - MARGIN, Math.min(s + TILE, north) + MARGIN, Math.min(w + TILE, east) + MARGIN]
    if (!stops.some((p) => p.lat >= box[0] && p.lat <= box[2] && p.lon >= box[1] && p.lon <= box[3])) continue
    const bbox = box.map((n) => n.toFixed(5)).join(',')
    console.log(`tile ${bbox}...`)
    const query = `[out:json][timeout:120];(
      nwr["name"]["shop"](${bbox});
      nwr["name"]["amenity"](${bbox});
      nwr["name"]["tourism"="museum"](${bbox});
      nwr["name"]["leisure"="stadium"](${bbox});
    );out center tags;`
    const { elements } = await get(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query }) })
    for (const e of elements) {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon
      if (lat != null) places.set(`${e.type}/${e.id}`, { lat, lon, tags: e.tags })
    }
    console.log(`  ${elements.length} places`)
    await new Promise((resolve) => setTimeout(resolve, 2_000)) // be gentle with a shared, free server
  }
}

const landmarks = pickLandmarks(stops, [...places.values()])
const sorted = Object.fromEntries(Object.entries(landmarks).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(OUT, JSON.stringify({
  source: 'Landmark names © OpenStreetMap contributors, available under the Open Database License (https://www.openstreetmap.org/copyright)',
  generated: new Date().toISOString().slice(0, 10),
  landmarks: sorted,
}, null, 1) + '\n')
console.log(`${Object.keys(sorted).length} of ${stops.length} stops have a landmark -> ${OUT.pathname}`)
