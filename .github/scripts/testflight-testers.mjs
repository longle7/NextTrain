// Sends a TestFlight build to testers through the App Store Connect API (Node 24, no dependencies):
//   1. waits for Apple to finish processing the upload,
//   2. sets What to Test (shown to testers in the TestFlight app),
//   3. adds the build to every tester group,
//   4. submits it for Beta App Review when external testers are included. Apple reviews the first build of each
//      version; later builds of that version usually go straight through.
// Run by .github/workflows/testflight.yml, which sets ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID,
// BUILD_NUMBER, NOTES, and TESTERS (all | internal).
import { sign } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const API = 'https://api.appstoreconnect.apple.com'

/** A 15-minute App Store Connect token (Apple allows up to 20), signed with the API key. */
export function token(keyId, issuerId, privateKey, now = Date.now()) {
  const part = (json) => Buffer.from(JSON.stringify(json)).toString('base64url')
  const iat = Math.floor(now / 1000)
  const unsigned = `${part({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${part({ iss: issuerId, iat, exp: iat + 900, aud: 'appstoreconnect-v1' })}`
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}

// Each call gets a fresh token: processing can outlast one. Failures carry Apple's explanation (never the key).
function client(keyId, issuerId, privateKey) {
  return async (method, path, body) => {
    const response = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${token(keyId, issuerId, privateKey)}`, ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
    })
    const json = response.status === 204 ? undefined : await response.json().catch(() => undefined)
    if (!response.ok) {
      throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${json?.errors?.map((e) => e.detail ?? e.title).join('; ') ?? ''}`)
    }
    return json
  }
}

// What external testers can expect, by the build's external state.
const EXTERNAL = {
  WAITING_FOR_BETA_REVIEW: "waiting for Apple's beta review; external testers get it once it's approved (usually within a day)",
  IN_BETA_REVIEW: "in Apple's beta review; external testers get it once it's approved",
  BETA_APPROVED: 'approved; external testers have it',
  IN_BETA_TESTING: 'external testers have it',
  READY_FOR_BETA_TESTING: 'external testers have it',
}

/**
 * `api(method, path, body)` calls App Store Connect. Returns the groups the build went to and where external
 * review stands.
 */
export async function sendToTesters({ api, bundleId, buildNumber, notes, testers, log = console.log, wait = sleep, timeoutMs = 45 * 60_000 }) {
  const app = (await api('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`)).data[0]
  if (!app) throw new Error(`No app with bundle ID ${bundleId} in App Store Connect`)

  // The upload shows up a minute or so after it finishes, then processes for 5-30 minutes.
  let build
  for (const start = Date.now(); ; await wait(30_000)) {
    build = (await api('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${buildNumber}&fields[builds]=processingState`)).data[0]
    const state = build?.attributes.processingState
    if (state === 'VALID') break
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`Apple couldn't process build ${buildNumber} (${state}); App Store Connect -> TestFlight says why`)
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Build ${buildNumber} is still ${state ?? 'not uploaded'} after ${timeoutMs / 60_000} minutes; run the workflow again with build=${buildNumber}`)
    }
    log(`Build ${buildNumber}: ${state ? state.toLowerCase() : 'waiting for the upload to appear'}…`)
  }

  const localizations = (await api('GET', `/v1/builds/${build.id}/betaBuildLocalizations`)).data
  const english = localizations.find((l) => l.attributes.locale === 'en-US')
  if (english) {
    await api('PATCH', `/v1/betaBuildLocalizations/${english.id}`, { data: { type: 'betaBuildLocalizations', id: english.id, attributes: { whatsNew: notes } } })
  } else {
    await api('POST', '/v1/betaBuildLocalizations', {
      data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew: notes }, relationships: { build: { data: { type: 'builds', id: build.id } } } },
    })
  }

  // Internal groups set to get every build already have it.
  const groups = (await api('GET', `/v1/apps/${app.id}/betaGroups?fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds&limit=200`)).data
    .filter((g) => testers === 'all' || g.attributes.isInternalGroup)
  for (const g of groups) {
    if (g.attributes.isInternalGroup && g.attributes.hasAccessToAllBuilds) continue
    await api('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] })
  }
  const sent = groups.map((g) => `${g.attributes.name} (${g.attributes.isInternalGroup ? 'internal' : 'external'})`)

  if (!groups.some((g) => !g.attributes.isInternalGroup)) return { sent, review: 'not needed (no external testers)' }
  const externalState = async () => (await api('GET', `/v1/builds/${build.id}/buildBetaDetail`)).data.attributes.externalBuildState
  if ((await externalState()) === 'READY_FOR_BETA_SUBMISSION') {
    await api('POST', '/v1/betaAppReviewSubmissions', {
      data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } },
    }).catch((error) => {
      throw new Error(`${error.message}\nIf Apple says test information is missing, fill in App Store Connect -> TestFlight -> Test Information, then run the workflow again with build=${buildNumber}.`)
    })
  }
  const state = await externalState()
  return { sent, review: EXTERNAL[state] ?? state }
}

async function main() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID, BUILD_NUMBER = '', NOTES, TESTERS = 'all', GITHUB_STEP_SUMMARY } = process.env
  if (!/^\d+$/.test(BUILD_NUMBER)) throw new Error(`The build number must be digits, not "${BUILD_NUMBER}"`)
  if (!['all', 'internal'].includes(TESTERS)) throw new Error(`testers must be all or internal, not "${TESTERS}"`)
  const { sent, review } = await sendToTesters({
    api: client(ASC_KEY_ID, ASC_ISSUER_ID, readFileSync(ASC_KEY_PATH, 'utf8')),
    bundleId: BUNDLE_ID,
    buildNumber: BUILD_NUMBER,
    notes: NOTES?.trim() || 'Bug fixes and improvements.',
    testers: TESTERS,
  })
  const summary = sent.length
    ? `Build ${BUILD_NUMBER} sent to ${sent.join(', ')}. External testers: ${review}.`
    : `Build ${BUILD_NUMBER} is in TestFlight, but there are no tester groups yet: add one in App Store Connect -> TestFlight, then run the workflow again with build=${BUILD_NUMBER}.`
  console.log(summary)
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${summary}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
