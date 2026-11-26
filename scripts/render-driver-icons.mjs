// Renders the driver cabinet Home Screen icons and the notification badge (Phase 94, plan 94-08).
// Sources: scripts/driver-icons/icon.svg and badge.svg. Run from the repo root:
//   node scripts/render-driver-icons.mjs
// Local only (headless Chrome + sharp); no external service other than Google Fonts for the Fraunces glyph.
// Override the browser path with the CHROME env var.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR = 'public/driver/icons'

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}; set the CHROME env var`)
  process.exit(1)
}

const iconSvg = readFileSync('scripts/driver-icons/icon.svg', 'utf8')
const badgeSvg = readFileSync('scripts/driver-icons/badge.svg', 'utf8')

// name, source svg, size, art scale (the maskable icon keeps the P well inside the safe zone)
const jobs = [
  { name: 'icon-192.png', svg: iconSvg, size: 192, scale: 1 },
  { name: 'icon-512.png', svg: iconSvg, size: 512, scale: 1 },
  { name: 'icon-maskable-512.png', svg: iconSvg, size: 512, scale: 0.7 },
  { name: 'apple-touch-icon.png', svg: iconSvg, size: 180, scale: 1 },
  { name: 'badge-72.png', svg: badgeSvg, size: 72, scale: 1 },
]

mkdirSync(OUT_DIR, { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'driver-icons-'))

try {
  for (const job of jobs) {
    const { name, svg, size, scale } = job
    const sized = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500&display=block" rel="stylesheet">
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
svg{display:block}
#art{transform-box:view-box;transform-origin:center;transform:scale(${scale})}
</style></head><body>${sized}</body></html>`
    const htmlPath = join(work, `${name}.html`)
    const shotPath = join(work, `${name}.shot.png`)
    writeFileSync(htmlPath, html)
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      '--virtual-time-budget=8000',
      `--window-size=${size},${size}`,
      `--user-data-dir=${mkdtempSync(join(work, 'profile-'))}`,
      `--screenshot=${shotPath}`,
      `file://${htmlPath}`,
    ], { stdio: 'ignore' })
    // The headless window can be a few px larger than requested: crop to the exact square, keep alpha.
    await sharp(shotPath)
      .extract({ left: 0, top: 0, width: size, height: size })
      .ensureAlpha()
      .png()
      .toFile(join(OUT_DIR, name))
    console.log(`wrote ${OUT_DIR}/${name} (${size}x${size})`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
