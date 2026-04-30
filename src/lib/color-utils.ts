export const MAX_COLORS = 64

export function normalizeHex(hex: string): string {
  const clean = hex.replace(/^#/, '').trim().toLowerCase()
  if (/^[0-9a-f]{6}$/.test(clean)) return '#' + clean
  if (/^[0-9a-f]{3}$/.test(clean))
    return '#' + clean.split('').map(c => c + c).join('')
  return ''
}

export function parseHexList(input: string): string[] {
  return input
    .split(/[,;\s]+/)
    .map(s => normalizeHex(s.trim()))
    .filter(h => h !== '')
}

export function isLospecUrl(text: string): boolean {
  return /lospec\.com\/palette-list\//i.test(text)
}

export async function fetchLospecColors(url: string): Promise<string[]> {
  const base = url.replace(/\/$/, '').replace(/\.json$/, '')
  const res = await fetch(base + '.json')
  if (!res.ok) throw new Error(`Failed to fetch Lospec palette (${res.status})`)
  const data = (await res.json()) as { colors?: unknown }
  if (!Array.isArray(data.colors)) throw new Error('No colors found in palette')
  return (data.colors as string[]).map(c => '#' + c.replace(/^#/, ''))
}

export async function extractColorsFromBlob(blob: Blob): Promise<string[]> {
  const url = URL.createObjectURL(blob)
  try {
    return await extractColorsFromImageUrl(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function extractColorsFromImageUrl(url: string): Promise<string[]> {
  const img = await loadImage(url)
  return extractColorsFromImageElement(img)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () =>
      reject(
        new Error(
          'Failed to load image. The URL may be incorrect or the server may not allow cross-origin requests.'
        )
      )
    img.src = src
  })
}

function extractColorsFromImageElement(img: HTMLImageElement): string[] {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const colorSet = new Set<string>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const hex =
      '#' +
      [data[i], data[i + 1], data[i + 2]]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('')
    colorSet.add(hex)
  }
  return Array.from(colorSet)
}
