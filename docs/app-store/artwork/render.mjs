// App Store artwork at the two sizes App Store Connect takes: 5244x2950 (16:9) and 3840x1646 (21:9), drawn from the
// app icon's look. Each scene is drawn in its own units and scaled to the exact pixel size.
// No words: Apple writes its own title and text over both, near the bottom.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const out = fileURLToPath(new URL('.', import.meta.url)) // this folder
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

function scene([w, h], [outW, outH], hub, lines, trainAt) {
  const paths = lines.map(([id, color, d, n]) => line(d, color) + `<path id="${id}" d="${d}" fill="none" stroke="none"/>` + stops(id, n)).join('')
  return `<!doctype html><html><head><style>html,body{margin:0;background:${BG}}svg{display:block}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
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

// 16:9 (5244x2950): the hub left of center, lines running off every edge; the train upper right. Apple's text goes
// at the bottom.
const [cx, cy] = [760, 470]
const wide169 = scene([1920, 1080], [5244, 2950], [cx, cy], [
  ['r', RED, `M -60 120 C 300 160, 520 300, ${cx} ${cy} S 980 820, 1180 1160`, 7],
  ['o', ORANGE, `M ${cx - 40} -60 C ${cx - 20} 200, ${cx} 320, ${cx} ${cy} S ${cx - 260} 900, ${cx - 420} 1160`, 6],
  ['g', GREEN, `M -60 700 C 240 640, 520 520, ${cx} ${cy} S 1100 260, 1380 -60`, 7],
  ['b', BLUE, `M ${cx} ${cy} C 980 430, 1240 360, 1980 300`, 6],
  ['y', BUS, `M ${cx} ${cy} C 1000 560, 1380 640, 1980 980`, 7],
], train(1290, 150, 520))

// 21:9 (3840x1646): the same scene stretched out: lines reach further, the train sits on the Blue Line to the right.
const [wx, wy] = [900, 420]
const wide219 = scene([2240, 960], [3840, 1646], [wx, wy], [
  ['r', RED, `M -60 100 C 400 140, 680 260, ${wx} ${wy} S 1160 760, 1360 1020`, 8],
  ['o', ORANGE, `M ${wx - 40} -60 C ${wx - 20} 160, ${wx} 300, ${wx} ${wy} S ${wx - 260} 820, ${wx - 420} 1020`, 6],
  ['g', GREEN, `M -60 640 C 300 590, 640 500, ${wx} ${wy} S 1260 240, 1540 -60`, 8],
  ['b', BLUE, `M ${wx} ${wy} C 1140 400, 1400 340, 2300 300`, 8],
  ['y', BUS, `M ${wx} ${wy} C 1180 520, 1600 600, 2300 900`, 9],
], train(1640, 110, 520))

const browser = await chromium.launch({ channel: 'msedge' })
for (const [name, html, w, h] of [['artwork-5244x2950', wide169, 5244, 2950], ['artwork-3840x1646', wide219, 3840, 1646]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${name}.png`, omitBackground: false })
  console.log('wrote', name)
  await page.close()
}
await browser.close()
