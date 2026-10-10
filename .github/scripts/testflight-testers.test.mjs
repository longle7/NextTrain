// node --test ".github/scripts/*.test.mjs" (CI runs it). A fake App Store Connect; no key or network needed.
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { test } from 'node:test'
import { sendToTesters, token } from './testflight-testers.mjs'

test('the token is an ES256 JWT for App Store Connect that verifies with the key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwt = token('KEY123', 'issuer-1', privateKey, Date.UTC(2026, 9, 10))
  const [header, payload, signature] = jwt.split('.')
  const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString())
  assert.deepEqual(json(header), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' })
  const claims = json(payload)
  assert.equal(claims.iss, 'issuer-1')
  assert.equal(claims.aud, 'appstoreconnect-v1')
  assert.equal(claims.exp - claims.iat, 900)
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')))
})

// Answers like App Store Connect: the build appears, processes, then is valid; review state changes once submitted.
function fakeApi({ states = [undefined, 'PROCESSING', 'VALID'], localizations = [], groups, external = 'READY_FOR_BETA_SUBMISSION' }) {
  const calls = []
  let submitted = false
  const api = async (method, path, body) => {
    calls.push(`${method} ${path.split('?')[0]}`)
    if (path.startsWith('/v1/apps?')) return { data: [{ id: 'app1' }] }
    if (path.startsWith('/v1/builds?')) {
      const state = states.length > 1 ? states.shift() : states[0]
      return { data: state ? [{ id: 'build6', attributes: { processingState: state } }] : [] }
    }
    if (path.endsWith('/betaBuildLocalizations')) return { data: localizations }
    if (path.includes('/betaGroups?')) return { data: groups }
    if (path.endsWith('/buildBetaDetail')) return { data: { attributes: { externalBuildState: submitted ? 'WAITING_FOR_BETA_REVIEW' : external } } }
    if (path === '/v1/betaAppReviewSubmissions') submitted = true
    if (method === 'POST' && path === '/v1/betaBuildLocalizations') assert.equal(body.data.attributes.whatsNew, 'Buses are here')
    return undefined
  }
  return { api, calls }
}
const group = (id, name, isInternalGroup, hasAccessToAllBuilds = false) => ({ id, attributes: { name, isInternalGroup, hasAccessToAllBuilds } })
const groups = [group('g1', 'Team', true, true), group('g2', 'Family', true), group('g3', 'Friends', false)]
const run = (fake, testers = 'all') => sendToTesters({ ...fake, bundleId: 'com.longledev.nexttrain', buildNumber: '6', notes: 'Buses are here', testers, log: () => {}, wait: async () => {} })

test('all testers: waits for processing, sets What to Test, adds to every group that needs it, submits for review', async () => {
  const fake = fakeApi({ groups })
  const result = await run(fake)
  assert.deepEqual(result.sent, ['Team (internal)', 'Family (internal)', 'Friends (external)'])
  assert.match(result.review, /waiting for Apple's beta review/)
  const posts = fake.calls.filter((c) => c.startsWith('POST'))
  assert.deepEqual(posts, [
    'POST /v1/betaBuildLocalizations',
    'POST /v1/betaGroups/g2/relationships/builds', // Team already gets every build
    'POST /v1/betaGroups/g3/relationships/builds',
    'POST /v1/betaAppReviewSubmissions',
  ])
  assert.equal(fake.calls.filter((c) => c === 'GET /v1/builds').length, 3) // not there yet, processing, valid
})

test('internal only: no external groups and no review', async () => {
  const fake = fakeApi({ groups, states: ['VALID'] })
  const result = await run(fake, 'internal')
  assert.deepEqual(result.sent, ['Team (internal)', 'Family (internal)'])
  assert.ok(!fake.calls.some((c) => c.includes('g3') || c.includes('betaAppReviewSubmissions')))
})

test('a build already approved for external testing is not submitted again, and What to Test is updated in place', async () => {
  const fake = fakeApi({ groups, states: ['VALID'], external: 'BETA_APPROVED', localizations: [{ id: 'loc1', attributes: { locale: 'en-US' } }] })
  const result = await run(fake)
  assert.equal(result.review, 'approved; external testers have it')
  assert.ok(fake.calls.includes('PATCH /v1/betaBuildLocalizations/loc1'))
  assert.ok(!fake.calls.includes('POST /v1/betaAppReviewSubmissions'))
})

test('a build Apple could not process stops with a reason', async () => {
  await assert.rejects(run(fakeApi({ groups, states: ['FAILED'] })), /couldn't process build 6 \(FAILED\)/)
})

test('a build still processing after the time limit says how to finish later', async () => {
  const fake = fakeApi({ groups, states: ['PROCESSING'] })
  await assert.rejects(
    sendToTesters({ ...fake, bundleId: 'x', buildNumber: '6', notes: 'n', testers: 'all', log: () => {}, wait: async () => {}, timeoutMs: -1 }),
    /still PROCESSING .* run the workflow again with build=6/,
  )
})
