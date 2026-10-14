// App Store artwork: the search-result card (1920x1080) and the header (1080x1920), drawn from the app icon's look.
// No words: Apple writes its own title and text over both, near the bottom.
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
const out = new URL('.', import.meta.url).pathname.replace(/^/([A-Za-z]:)/, '$1')
mkdirSync(out, { recursive: true })
const RED = '#DA291C', ORANGE = '#ED8B00', BLUE = '#003DA5', GREEN = '#00843D', BUS = '#FFC72C', BG = '#171717'

// The train from the app icon (1024 box), white.
const train = (x, y, size) => `
<g transform="translate(${x} ${y}) scale(${size / 1024})">
  <rect x="248" y="88" width="528" height="640" rx="160" fill="${BG}"/>
  <path d="M400 692 336 796M624 692l64 104" stroke="${BG}" stroke-width="120" stroke-linecap="round"/>
  <path fill="#fff" d="M408 128h208a120 120 0 0 1 120 120v312a128 128 0 0 1-128 128H416a128 128 0 0 1-128-128V248a120 120 0 0 1 120-120z"/>
  <rect x="360" y="208" width="304" height="192" rx="48" fill="${BG}"/>
  <circle cx="408" cy="552" r="41" fill="${BG}"/><circle cx="616" cy="552" r="41" fill="${BG}"/>
  <path d="M400 692 336 796M624 692l64 104" stroke="#fff" stroke-width="56" stroke-linecap="round"/>
</g>`

const station = (x, y, r = 13) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${BG}" stroke-width="6"/>`
const line = (d, color, w = 30) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
// Dots spaced along a path, drawn after the lines.
const stops = (id, n) => `<g data-stops="${id}" data-n="${n}"></g>`

function scene(w, h, hub, lines, trainAt) {
  const paths = lines.map(([id, color, d, n]) => line(d, color) + `<path id="${id}" d="${d}" fill="none" stroke="none"/>` + stops(id, n)).join('')
  return `<!doctype html><html><head><style>html,body{margin:0;background:${BG}}svg{display:block}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.62" stop-color="${BG}" stop-opacity="0"/><stop offset="1" stop-color="${BG}" stop-opacity="0.92"/>
    </linearGradient>
    <radialGradient id="glow" cx="${hub[0] / w}" cy="${hub[1] / h}" r="0.75">
      <stop offset="0" stop-color="#2a2f38"/><stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${paths}
  <circle cx="${hub[0]}" cy="${hub[1]}" r="34" fill="#fff" stroke="${BG}" stroke-width="10"/>
  ${trainAt}
  <rect id="fade-layer" width="${w}" height="${h}" fill="url(#fade)"/>
</svg>
<script>
  for (const g of document.querySelectorAll('[data-stops]')) {
    const p = document.getElementById(g.dataset.stops), n = +g.dataset.n, len = p.getTotalLength()
    for (let i = 1; i < n; i++) {
      const pt = p.getPointAtLength((len * i) / n)
      g.insertAdjacentHTML('beforeend', '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="13" fill="#fff" stroke="${BG}" stroke-width="6"/>')
    }
  }
</script></body></html>`
}

// Card (16:9): the hub left of center, lines running off every edge; the train upper right. Apple's text goes bottom left.
const [cx, cy] = [760, 470]
const card = scene(1920, 1080, [cx, cy], [
  ['r', RED, `M -60 120 C 300 160, 520 300, ${cx} ${cy} S 980 820, 1180 1160`, 7],
  ['o', ORANGE, `M ${cx - 40} -60 C ${cx - 20} 200, ${cx} 320, ${cx} ${cy} S ${cx - 260} 900, ${cx - 420} 1160`, 6],
  ['g', GREEN, `M -60 700 C 240 640, 520 520, ${cx} ${cy} S 1100 260, 1380 -60`, 7],
  ['b', BLUE, `M ${cx} ${cy} C 980 430, 1240 360, 1980 300`, 6],
  ['y', BUS, `M ${cx} ${cy} C 1000 560, 1380 640, 1980 980`, 7],
], train(1290, 150, 520))

// Header (9:16): the hub in the upper middle, the train above it; the lower part stays calm for Apple's text.
const [hx, hy] = [540, 880]
const header = scene(1080, 1920, [hx, hy], [
  ['r', RED, `M -60 520 C 200 600, 380 760, ${hx} ${hy} S 760 1300, 980 1980`, 7],
  ['o', ORANGE, `M ${hx + 60} -60 C ${hx + 40} 300, ${hx} 620, ${hx} ${hy} S ${hx - 120} 1500, ${hx - 300} 1980`, 7],
  ['g', GREEN, `M -60 1240 C 200 1100, 380 980, ${hx} ${hy} S 860 600, 1140 420`, 6],
  ['b', BLUE, `M ${hx} ${hy} C 760 860, 940 980, 1140 1080`, 4],
  ['y', BUS, `M ${hx} ${hy} C 560 1180, 760 1480, 1140 1720`, 6],
], train(330, 140, 420))

const browser = await chromium.launch({ channel: 'msedge' })
for (const [name, html, w, h] of [['search-card-1920x1080', card, 1920, 1080], ['header-1080x1920', header, 1080, 1920]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${name}.png`, omitBackground: false })
  console.log('wrote', name)
  await page.close()
}
await browser.close()
