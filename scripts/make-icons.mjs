// Render the site's SVG mark to PNG sizes + a multi-size favicon.ico.
// Requires Playwright installed globally:
//   npm i -g playwright && playwright install chromium
// Usage: node scripts/make-icons.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(path.join(root, 'scripts/icon-source.svg'), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
await page.setContent(
  `<body style="margin:0"><div style="width:512px;height:512px">${svg
    .replace(/width='[^']*'/, "width='512'")
    .replace(/height='[^']*'/, "height='512'")}</div></body>`,
)
await page.screenshot({ path: path.join(root, 'icon-512.png'), omitBackground: true })
await browser.close()
console.log('wrote icon-512.png')
