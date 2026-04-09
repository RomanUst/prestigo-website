import sharp from 'sharp'
import { statSync } from 'node:fs'

const files = [
  { src: 'public/photohero.png', widths: [1920, 1280, 828, 640] },
  { src: 'public/e-class-photo.png', widths: [1200, 828, 640] },
  { src: 'public/s-class-photo.png', widths: [1200, 828, 640] },
  { src: 'public/v-class-photo.png', widths: [1200, 828, 640] },
]

for (const f of files) {
  const origBytes = statSync(f.src).size
  console.log(`\n=== ${f.src} (${(origBytes/1024).toFixed(0)} KB) ===`)
  const base = f.src.replace(/\.png$/, '')
  // Single full-size AVIF + WebP (replaces the PNG in references)
  const avifPath = `${base}.avif`
  const webpPath = `${base}.webp`
  await sharp(f.src).avif({ quality: 55, effort: 6 }).toFile(avifPath)
  await sharp(f.src).webp({ quality: 80, effort: 6 }).toFile(webpPath)
  console.log(`  ${avifPath} ${(statSync(avifPath).size/1024).toFixed(0)} KB`)
  console.log(`  ${webpPath} ${(statSync(webpPath).size/1024).toFixed(0)} KB`)
}
