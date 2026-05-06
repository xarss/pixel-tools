// ─── Layout constants (all dimensions in output-image pixels) ─────────────────
export const RECT_W = 29
export const RECT_H = 19
export const HORIZ_GAP = 3
export const VERT_GAP = 3
export const SIDE_MARGIN = 2
export const VERT_MARGIN = 8
export const CHAR_W = 4
export const CHAR_H = 5
export const CHAR_SPACING = 1
export const TEXT_GAP = 1

const TOP_TEXT_Y = VERT_MARGIN - TEXT_GAP - CHAR_H // = 2
const TOP_RECT_Y = VERT_MARGIN // = 8
const BOT_RECT_Y = VERT_MARGIN + RECT_H + VERT_GAP // = 30
const BOT_TEXT_Y = BOT_RECT_Y + RECT_H + TEXT_GAP // = 50

// Characters encoded in every bitmap font PNG (left to right)
export const HEX_CHARS = '0123456789abcdef'

// ─── Glyph table type ─────────────────────────────────────────────────────────
// Each glyph is CHAR_H rows; each row is CHAR_W bits (bit3 = leftmost pixel).
export type GlyphTable = Record<string, number[]>

// ─── Built-in 4×5 fallback glyphs ────────────────────────────────────────────
export const DEFAULT_GLYPHS: GlyphTable = {
  '0': [0b0110, 0b1001, 0b1001, 0b1001, 0b0110],
  '1': [0b0100, 0b1100, 0b0100, 0b0100, 0b1110],
  '2': [0b0110, 0b1001, 0b0010, 0b0100, 0b1111],
  '3': [0b0111, 0b0001, 0b0011, 0b0001, 0b0111],
  '4': [0b1001, 0b1001, 0b1111, 0b0001, 0b0001],
  '5': [0b1111, 0b1000, 0b1110, 0b0001, 0b1110],
  '6': [0b0110, 0b1000, 0b1110, 0b1001, 0b0110],
  '7': [0b1111, 0b0001, 0b0010, 0b0100, 0b0100],
  '8': [0b0110, 0b1001, 0b0110, 0b1001, 0b0110],
  '9': [0b0110, 0b1001, 0b0111, 0b0001, 0b0110],
  a: [0b0110, 0b0001, 0b0111, 0b1001, 0b0111],
  b: [0b1000, 0b1000, 0b1110, 0b1001, 0b1110],
  c: [0b0110, 0b1000, 0b1000, 0b1000, 0b0110],
  d: [0b0001, 0b0111, 0b1001, 0b1001, 0b0111],
  e: [0b0110, 0b1001, 0b1111, 0b1000, 0b0110],
  f: [0b0011, 0b0100, 0b1110, 0b0100, 0b0100],
}

// ─── Bitmap font loading ──────────────────────────────────────────────────────
// Expected PNG: exactly (HEX_CHARS.length * CHAR_W) × CHAR_H pixels.
// Characters in left-to-right order: 0123456789abcdef.
// Bright pixels (R>128 || G>128 || B>128) with alpha>0 are treated as "on".

export async function loadBitmapFontFromBlob(blob: Blob): Promise<GlyphTable> {
  const url = URL.createObjectURL(blob)
  try {
    return await loadBitmapFontFromURL(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function loadBitmapFontFromURL(url: string): Promise<GlyphTable> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Failed to load bitmap font image'))
    el.src = url
  })
  return extractGlyphs(img)
}

function extractGlyphs(img: HTMLImageElement): GlyphTable {
  const expectedW = HEX_CHARS.length * CHAR_W
  if (img.naturalWidth !== expectedW || img.naturalHeight !== CHAR_H) {
    throw new Error(
      `Bitmap font PNG must be exactly ${expectedW}×${CHAR_H}px ` +
        `(${CHAR_W}px per character × ${HEX_CHARS.length} characters, ${CHAR_H}px tall).` +
        ` Got ${img.naturalWidth}×${img.naturalHeight}px.`
    )
  }

  const tmp = document.createElement('canvas')
  tmp.width = img.naturalWidth
  tmp.height = img.naturalHeight
  const ctx = tmp.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, tmp.width, tmp.height)

  const table: GlyphTable = {}
  for (let ci = 0; ci < HEX_CHARS.length; ci++) {
    const rows: number[] = []
    for (let row = 0; row < CHAR_H; row++) {
      let bits = 0
      for (let col = 0; col < CHAR_W; col++) {
        const base = (row * tmp.width + ci * CHAR_W + col) * 4
        const [r, g, b, a] = [data[base], data[base + 1], data[base + 2], data[base + 3]]
        if (a > 0 && (r > 128 || g > 128 || b > 128)) bits |= 0b1000 >> col
      }
      rows.push(bits)
    }
    table[HEX_CHARS[ci]] = rows
  }
  return table
}

// ─── Export the active glyph set as a PNG so users can edit and re-upload ─────
export function glyphTableToPNG(glyphs: GlyphTable): string {
  const canvas = document.createElement('canvas')
  canvas.width = HEX_CHARS.length * CHAR_W
  canvas.height = CHAR_H
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  for (let ci = 0; ci < HEX_CHARS.length; ci++) {
    const rows = glyphs[HEX_CHARS[ci]]
    if (!rows) continue
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < CHAR_W; col++) {
        if (rows[row] & (0b1000 >> col)) ctx.fillRect(ci * CHAR_W + col, row, 1, 1)
      }
    }
  }
  return canvas.toDataURL('image/png')
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  glyphs: GlyphTable
): void {
  const rows = glyphs[char.toLowerCase()] ?? DEFAULT_GLYPHS[char.toLowerCase()]
  if (!rows) return
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < CHAR_W; col++) {
      if (rows[row] & (0b1000 >> col)) ctx.fillRect(x + col, y + row, 1, 1)
    }
  }
}

function drawHexLabel(
  ctx: CanvasRenderingContext2D,
  hex: string,
  x: number,
  y: number,
  color: string,
  glyphs: GlyphTable
): void {
  const clean = hex.replace(/^#/, '').toLowerCase().slice(0, 6)
  ctx.fillStyle = color
  for (let i = 0; i < clean.length; i++) {
    drawGlyph(ctx, clean[i], x + i * (CHAR_W + CHAR_SPACING), y, glyphs)
  }
}

// ─── Main draw function ────────────────────────────────────────────────────────
export function drawPalette(
  canvas: HTMLCanvasElement,
  colors: string[],
  bgColor: string,
  textColor: string,
  glyphs: GlyphTable = DEFAULT_GLYPHS
): void {
  const N = colors.length
  if (N === 0) {
    canvas.width = 1
    canvas.height = 1
    return
  }

  const nTop = Math.ceil(N / 2)
  const nBottom = Math.floor(N / 2)
  const bottomOffset = N % 2 === 1 ? (RECT_W + HORIZ_GAP) / 2 : 0

  canvas.width =
    SIDE_MARGIN * 2 + nTop * RECT_W + Math.max(0, nTop - 1) * HORIZ_GAP
  canvas.height = VERT_MARGIN * 2 + RECT_H * 2 + VERT_GAP

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < nTop; i++) {
    const x = SIDE_MARGIN + i * (RECT_W + HORIZ_GAP)
    drawHexLabel(ctx, colors[i], x, TOP_TEXT_Y, textColor, glyphs)
    ctx.fillStyle = colors[i]
    ctx.fillRect(x, TOP_RECT_Y, RECT_W, RECT_H)
  }

  for (let j = 0; j < nBottom; j++) {
    const x = SIDE_MARGIN + bottomOffset + j * (RECT_W + HORIZ_GAP)
    ctx.fillStyle = colors[nTop + j]
    ctx.fillRect(x, BOT_RECT_Y, RECT_W, RECT_H)
    drawHexLabel(ctx, colors[nTop + j], x, BOT_TEXT_Y, textColor, glyphs)
  }
}
