// node --test tools/landmarks/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { label, pickLandmarks, tier } from './pick.mjs'

// Coolidge Corner, Brookline, from OpenStreetMap (October 2026): the two "Harvard St @ Beacon St" stops on route 66,
// and the named places around them.
const STOPS = [
  { id: '1308', name: 'Harvard St @ Beacon St', lat: 42.342499, lon: -71.121845 },
  { id: '1372', name: 'Harvard St @ Beacon St', lat: 42.341909, lon: -71.121143 },
]
const p = (lat, lon, tags) => ({ lat, lon, tags })
const COOLIDGE_CORNER = [
  p(42.342282, -71.121774, { name: 'Brookline Bank', brand: 'Walgreens', amenity: 'bank' }), // OSM's tags aren't perfect
  p(42.342782, -71.121952, { name: 'Mecha', amenity: 'restaurant' }),
  p(42.342891, -71.122109, { name: 'Otto Pizza', brand: 'Otto Pizza', amenity: 'restaurant' }),
  p(42.342077, -71.122319, { name: 'Eastern Bank', brand: 'Eastern Bank', amenity: 'bank' }),
  p(42.342112, -71.122176, { name: 'Supercuts', brand: 'Supercuts', shop: 'hairdresser' }),
  p(42.342876, -71.12266, { name: 'CVS Pharmacy', brand: 'CVS Pharmacy', amenity: 'pharmacy' }),
  p(42.342441, -71.1227, { name: 'Coolidge Corner Theatre', amenity: 'cinema' }),
  p(42.342657, -71.121739, { name: 'Brookline Booksmith', shop: 'books' }),
  p(42.342531, -71.121511, { name: 'MiniLuxe', shop: 'beauty' }),
  p(42.342414, -71.121863, { name: 'Paris Creperie', amenity: 'cafe' }),
  p(42.341338, -71.120833, { name: "Bruegger's Bagels", brand: "Bruegger's Bagels", amenity: 'fast_food' }),
  p(42.341819, -71.121401, { name: 'AT&T', brand: 'AT&T', shop: 'mobile_phone' }),
  p(42.341743, -71.12168, { name: 'Santander', brand: 'Santander', amenity: 'bank' }),
  p(42.341585, -71.121237, { name: "Michael's Deli", amenity: 'restaurant' }),
  p(42.342441, -71.121064, { name: "Dunkin'", brand: "Dunkin'", amenity: 'fast_food' }),
  p(42.341755, -71.121583, { name: 'Maguro', amenity: 'restaurant' }),
  p(42.342396, -71.121838, { name: 'Taco Bell', brand: 'Taco Bell', amenity: 'fast_food' }),
  p(42.342551, -71.121537, { name: 'Topdrawer', shop: 'clothes' }),
  p(42.342523, -71.12202, { name: 'Bar Lunette', amenity: 'restaurant' }),
  p(42.341901, -71.120501, { name: "Trader Joe's", brand: "Trader Joe's", shop: 'supermarket' }),
  p(42.341858, -71.120892, { name: 'Bank of America', brand: 'Bank of America', amenity: 'bank' }),
]

test('each side of Harvard St at Beacon St gets its own big, recognizable landmark', () => {
  // Taco Bell (12 m, a chain) beats the nearer Paris Creperie (10 m); Trader Joe's (53 m) beats Bank of America (21 m).
  assert.deepEqual(pickLandmarks(STOPS, COOLIDGE_CORNER), { 1308: 'Taco Bell', 1372: "Trader Joe's" })
})

test('banks, phone stores and salons are never landmarks, even with a brand', () => {
  assert.equal(tier({ amenity: 'bank', brand: 'Walgreens' }), 0)
  assert.equal(tier({ shop: 'mobile_phone', brand: 'AT&T' }), 0)
  assert.equal(tier({ shop: 'hairdresser', brand: 'Supercuts' }), 0)
  assert.equal(tier({ amenity: 'fast_food', brand: 'Taco Bell' }), 1)
  assert.equal(tier({ shop: 'supermarket' }), 1)
  assert.equal(tier({ amenity: 'restaurant' }), 2)
})

test('a landmark is near: tier 2 within 75 m, a big place out to 120 m, nothing farther', () => {
  const stop = { id: 's', name: 'Main St @ Elm St', lat: 42.35, lon: -71.06 }
  const north = (m) => 42.35 + m / 111_000
  assert.deepEqual(pickLandmarks([stop], [p(north(90), -71.06, { name: 'Corner Cafe', amenity: 'cafe' })]), {})
  assert.deepEqual(pickLandmarks([stop], [p(north(110), -71.06, { name: 'Star Market', shop: 'supermarket' })]), { s: 'Star Market' })
  assert.deepEqual(pickLandmarks([stop], [p(north(130), -71.06, { name: 'Star Market', shop: 'supermarket' })]), {})
})

test('same-named stops across the street that would share a landmark get different ones', () => {
  const a = { id: 'a', name: 'Elm St @ Oak St', lat: 42.35, lon: -71.06 }
  const b = { id: 'b', name: 'Elm St @ Oak St', lat: 42.35035, lon: -71.06 } // ~40 m north
  const places = [
    p(42.35020, -71.06, { name: 'Target', brand: 'Target', shop: 'department_store' }), // between them: a's and b's first pick, nearer b
    p(42.34965, -71.06, { name: "McDonald's", brand: "McDonald's", amenity: 'fast_food' }), // 39 m south of a
  ]
  assert.deepEqual(pickLandmarks([a, b], places), { a: "McDonald's", b: 'Target' })
})

test('a branch keeps its chain name; long descriptions are dropped', () => {
  assert.equal(label({ name: 'Taco Bell #1234', brand: 'Taco Bell' }), 'Taco Bell')
  assert.equal(label({ name: 'The very long name of a community health and wellness resource center' }), undefined)
})
