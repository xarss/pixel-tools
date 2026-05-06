import { useEffect, useRef, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, GripVerticalIcon, ImageIcon, Link2Icon, PlusIcon, UploadIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MAX_COLORS,
  isLospecUrl,
  fetchLospecColors,
  extractColorsFromBlob,
  extractColorsFromImageUrl,
  parseHexList,
} from '@/lib/color-utils'
import {
  drawPalette,
  loadBitmapFontFromBlob,
  loadBitmapFontFromURL,
  glyphTableToPNG,
  DEFAULT_GLYPHS,
  type GlyphTable,
} from '@/lib/canvas-utils'

const pixelFontModules = import.meta.glob<string>(
  '../assets/pixel-fonts/*.png',
  { eager: true, query: '?url', import: 'default' }
) as Record<string, string>

interface FontEntry {
  name: string
  glyphs: GlyphTable
}

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

function getHue(hex: string): number {
  const { r: ri, g: gi, b: bi } = hexToRgb(hex)
  const r = ri / 255, g = gi / 255, b = bi / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  if (max === r) return (((g - b) / d + (g < b ? 6 : 0)) / 6) * 360
  if (max === g) return (((b - r) / d + 2) / 6) * 360
  return (((r - g) / d + 4) / 6) * 360
}

function getSaturation(hex: string): number {
  const { r: ri, g: gi, b: bi } = hexToRgb(hex)
  const r = ri / 255, g = gi / 255, b = bi / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
}

function getLightness(hex: string): number {
  const { r: ri, g: gi, b: bi } = hexToRgb(hex)
  const r = ri / 255, g = gi / 255, b = bi / 255
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

function getBrightness(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const linear = (v: number) => {
    const n = v / 255
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function getTemperature(hex: string): number {
  const h = getHue(hex)
  return h <= 180 ? h : 360 - h
}

const SORT_FNS: Record<string, (c: string) => number> = {
  hue: getHue,
  saturation: getSaturation,
  lightness: getLightness,
  brightness: getBrightness,
  luminance: getLuminance,
  temperature: getTemperature,
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <Badge variant="outline" className="h-6 gap-1 pl-1 font-mono text-[10px]">
      <span
        className="inline-block size-3 shrink-0 rounded-sm border border-border/40"
        style={{ backgroundColor: color }}
      />
      {color}
    </Badge>
  )
}

function ColorDot({
  color, selected, onClick, title,
}: {
  color: string; selected: boolean; onClick: () => void; title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'size-5 rounded-sm border-2 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        selected ? 'border-foreground' : 'border-transparent hover:border-muted-foreground/50'
      )}
      style={{ backgroundColor: color }}
    />
  )
}

export default function PaletteGenerator() {
  const [colors, setColors] = useState<string[]>([])
  const [manualInput, setManualInput] = useState('')
  const [manualPreview, setManualPreview] = useState<string[]>([])
  const [pasteValue, setPasteValue] = useState('')
  const [pasteLoading, setPasteLoading] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [tooManyOpen, setTooManyOpen] = useState(false)
  const [pasteUrlOpen, setPasteUrlOpen] = useState(false)
  const [addManualOpen, setAddManualOpen] = useState(false)
  const [openSections, setOpenSections] = useState<string[]>(['colors'])
  const [availableFonts, setAvailableFonts] = useState<FontEntry[]>([])
  const [selectedFont, setSelectedFont] = useState('')
  const [activeGlyphs, setActiveGlyphs] = useState<GlyphTable>(DEFAULT_GLYPHS)
  const [fontUploadError, setFontUploadError] = useState<string | null>(null)
  const [bgColor, setBgColor] = useState<string | null>(null)
  const [textColor, setTextColor] = useState<string | null>(null)
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 })
  const [paletteDraggedIndex, setPaletteDraggedIndex] = useState<number | null>(null)
  const [paletteDragOverIndex, setPaletteDragOverIndex] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const entries = Object.entries(pixelFontModules)
    if (entries.length === 0) return
    void Promise.all(
      entries.map(async ([key, url]) => {
        const name = key.split('/').pop()!.replace(/\.png$/i, '')
        try {
          return { name, glyphs: await loadBitmapFontFromURL(url) } as FontEntry
        } catch { return null }
      })
    ).then(results => {
      const loaded = results.filter((r): r is FontEntry => r !== null)
      if (loaded.length > 0) {
        setAvailableFonts(loaded)
        setSelectedFont(loaded[0].name)
        setActiveGlyphs(loaded[0].glyphs)
      }
    })
  }, [])

  useEffect(() => {
    setBgColor(prev => (prev && !colors.includes(prev) ? null : prev))
    setTextColor(prev => (prev && !colors.includes(prev) ? null : prev))
  }, [colors])

  useEffect(() => {
    if (!canvasRef.current || colors.length === 0) return
    const bg = bgColor ?? colors[0]
    const text = textColor ?? colors[colors.length - 1]
    drawPalette(canvasRef.current, colors, bg, text, activeGlyphs)
    setCanvasDims({ width: canvasRef.current.width, height: canvasRef.current.height })
  }, [colors, bgColor, textColor, activeGlyphs])

  useEffect(() => {
    if (colors.length === 0) {
      setOpenSections(prev => prev.filter(s => s !== 'settings'))
    }
  }, [colors])

  function setColorsAndOpenSettings(newColors: string[]) {
    setColors(newColors)
    if (newColors.length >= 2) setOpenSections(['settings'])
  }

  function addColorsFromImage(extracted: string[]) {
    const unique = Array.from(new Set(extracted))
    if (unique.length > MAX_COLORS) {
      setTooManyOpen(true)
      return
    }
    setColorsAndOpenSettings(unique)
  }

  async function processImageBlob(blob: Blob, fromUpload: boolean, onSuccess?: () => void) {
    if (fromUpload) {
      setUploadLoading(true)
      setUploadError(null)
    } else {
      setPasteLoading(true)
      setPasteError(null)
    }
    try {
      const extracted = await extractColorsFromBlob(blob)
      addColorsFromImage(extracted)
      onSuccess?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read image'
      if (fromUpload) setUploadError(msg)
      else setPasteError(msg)
    } finally {
      if (fromUpload) setUploadLoading(false)
      else setPasteLoading(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void processImageBlob(file, true)
    e.target.value = ''
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setFileDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type.startsWith('image/')) {
      void processImageBlob(file, true)
    } else {
      setUploadError('Unsupported file type. Please upload an image file.')
    }
  }

  async function handleLoadUrl() {
    const value = pasteValue.trim()
    if (!value) return
    setPasteLoading(true)
    setPasteError(null)
    try {
      if (isLospecUrl(value)) {
        const loaded = await fetchLospecColors(value)
        setColorsAndOpenSettings(Array.from(new Set(loaded)).slice(0, MAX_COLORS))
      } else if (/^https?:\/\//i.test(value)) {
        addColorsFromImage(await extractColorsFromImageUrl(value))
      } else {
        setPasteError('Enter a Lospec palette URL or an image URL starting with https://')
        return
      }
      setPasteValue('')
      setPasteUrlOpen(false)
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setPasteLoading(false)
    }
  }

  function handleManualInputChange(value: string) {
    setManualInput(value)
    setManualPreview(parseHexList(value))
  }

  function handleAddManual() {
    if (manualPreview.length === 0) return
    setManualInput('')
    setManualPreview([])
    setAddManualOpen(false)
    setColorsAndOpenSettings(Array.from(new Set(manualPreview)).slice(0, MAX_COLORS))
  }

  async function handleFontUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const name = file.name.replace(/\.png$/i, '')
    setFontUploadError(null)
    try {
      const glyphs = await loadBitmapFontFromBlob(file)
      const entry: FontEntry = { name, glyphs }
      setAvailableFonts(prev => [...prev.filter(f => f.name !== name), entry])
      setSelectedFont(name)
      setActiveGlyphs(glyphs)
    } catch (err) {
      setFontUploadError(err instanceof Error ? err.message : 'Failed to load font')
    }
  }

  function handleDownloadFont() {
    const dataUrl = glyphTableToPNG(activeGlyphs)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${selectedFont.toLowerCase().replace(/\s+/g, '-')}.png`
    a.click()
  }

  function handleSelectFont(font: FontEntry) {
    setSelectedFont(font.name)
    setActiveGlyphs(font.glyphs)
  }

  function fallbackDownload(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'palette.png'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadPalette() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      if (navigator.share) {
        const file = new File([blob], 'palette.png', { type: 'image/png' })
        void navigator.share({ files: [file], title: 'Palette' }).catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
          fallbackDownload(blob)
        })
      } else {
        fallbackDownload(blob)
      }
    })
  }

  function handlePaletteReorder(targetIndex: number) {
    if (paletteDraggedIndex === null || paletteDraggedIndex === targetIndex) {
      setPaletteDraggedIndex(null)
      setPaletteDragOverIndex(null)
      return
    }
    const newColors = [...colors]
    const [removed] = newColors.splice(paletteDraggedIndex, 1)
    newColors.splice(targetIndex, 0, removed)
    setColors(newColors)
    setPaletteDraggedIndex(null)
    setPaletteDragOverIndex(null)
  }

  function applySort(fn: (c: string) => number, asc: boolean) {
    setColors(prev => [...prev].sort((a, b) => asc ? fn(a) - fn(b) : fn(b) - fn(a)))
  }

  const effectiveBg = bgColor ?? colors[0] ?? '#000000'
  const effectiveText = textColor ?? colors[colors.length - 1] ?? '#ffffff'
  const nTop = Math.ceil(colors.length / 2)
  const topColors = colors.slice(0, nTop)
  const bottomColors = colors.slice(nTop)

  function renderColorItem(color: string, index: number) {
    return (
      <div
        key={color}
        draggable
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move'
          setPaletteDraggedIndex(index)
        }}
        onDragOver={e => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setPaletteDragOverIndex(index)
        }}
        onDrop={e => {
          e.preventDefault()
          handlePaletteReorder(index)
        }}
        onDragEnd={() => {
          setPaletteDraggedIndex(null)
          setPaletteDragOverIndex(null)
        }}
        className={cn(
          paletteDragOverIndex === index &&
            paletteDraggedIndex !== index &&
            'rounded ring-1 ring-primary ring-offset-1'
        )}
      >
        <Badge
          variant="outline"
          className={cn(
            'h-6 cursor-grab gap-1 pl-1 font-mono text-[10px] active:cursor-grabbing',
            paletteDraggedIndex === index && 'opacity-50'
          )}
        >
          <GripVerticalIcon className="size-2.5 shrink-0 text-muted-foreground/40" />
          <span
            className="inline-block size-3 shrink-0 rounded-sm border border-border/40"
            style={{ backgroundColor: color }}
          />
          <span>{color}</span>
        </Badge>
      </div>
    )
  }

  const controls = (
    <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
      {/* ── Colors: add sources only ── */}
      <AccordionItem value="colors">
        <AccordionTrigger>Colors</AccordionTrigger>
        <AccordionContent className="h-auto">
          <div className="space-y-3">
            <div
              className={cn(
                'grid grid-cols-2 gap-2 rounded border border-dashed p-2 transition-colors',
                fileDragOver ? 'border-primary bg-primary/5' : 'border-border'
              )}
              onDragOver={e => {
                e.preventDefault()
                if (e.dataTransfer.types.includes('Files')) setFileDragOver(true)
              }}
              onDragEnter={e => {
                e.preventDefault()
                if (e.dataTransfer.types.includes('Files')) setFileDragOver(true)
              }}
              onDragLeave={() => setFileDragOver(false)}
              onDrop={handleFileDrop}
            >
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLoading}
              >
                <UploadIcon className="size-3.5" />
                {uploadLoading ? 'Reading…' : 'Upload image'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPasteError(null)
                  setPasteUrlOpen(true)
                }}
              >
                <Link2Icon className="size-3.5" />
                Paste URL
              </Button>
            </div>
            {uploadError && (
              <p className="text-[11px] text-destructive">{uploadError}</p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                setManualInput('')
                setManualPreview([])
                setAddManualOpen(true)
              }}
            >
              <PlusIcon className="size-3.5" />
              Enter hex values
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Settings: palette, bg, text, font ── */}
      <AccordionItem value="settings">
        <AccordionTrigger disabled={colors.length === 0}>
          {colors.length === 0 ? 'Settings — add colors first' : 'Settings'}
        </AccordionTrigger>
        <AccordionContent className="h-auto">
          <div className="space-y-4">
            {/* Palette management */}
            <section className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Palette ({colors.length}/{MAX_COLORS})
              </p>
              {/* Sort row */}
              <div className="flex gap-1">
                <select
                  value={sortBy}
                  onChange={e => {
                    const val = e.target.value
                    setSortBy(val)
                    const fn = SORT_FNS[val]
                    if (fn) applySort(fn, sortAsc)
                  }}
                  className="h-6 flex-1 rounded border border-input bg-background px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Sort by…</option>
                  <option value="hue">Hue</option>
                  <option value="saturation">Saturation</option>
                  <option value="lightness">Lightness</option>
                  <option value="brightness">Brightness</option>
                  <option value="luminance">Luminance</option>
                  <option value="temperature">Temperature</option>
                </select>
                <button
                  onClick={() => {
                    const newAsc = !sortAsc
                    setSortAsc(newAsc)
                    const fn = sortBy ? SORT_FNS[sortBy] : undefined
                    if (fn) applySort(fn, newAsc)
                  }}
                  title={sortAsc ? 'Ascending' : 'Descending'}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-input bg-background text-foreground transition-colors hover:bg-muted focus:outline-none"
                >
                  {sortAsc
                    ? <ArrowUpIcon className="size-3" />
                    : <ArrowDownIcon className="size-3" />
                  }
                </button>
              </div>
              {/* Two-row color grid matching image layout */}
              <div className="overflow-x-auto">
                <div className="inline-flex min-w-full flex-col items-center gap-1 pb-1">
                  <div className="flex gap-1">
                    {topColors.map((color, i) => renderColorItem(color, i))}
                  </div>
                  {bottomColors.length > 0 && (
                    <div className="flex gap-1">
                      {bottomColors.map((color, i) => renderColorItem(color, nTop + i))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Background color */}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Background
                </p>
                <span className="font-mono text-[10px] text-muted-foreground">{effectiveBg}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {colors.map(color => (
                  <ColorDot
                    key={color}
                    color={color}
                    selected={effectiveBg === color}
                    onClick={() => setBgColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </section>

            {/* Text color */}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Text color
                </p>
                <span className="font-mono text-[10px] text-muted-foreground">{effectiveText}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {colors.map(color => (
                  <ColorDot
                    key={color}
                    color={color}
                    selected={effectiveText === color}
                    onClick={() => setTextColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </section>

            {/* Pixel font */}
            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pixel font
              </p>
              {availableFonts.length > 0 && (
                <ScrollArea className="h-28 rounded border border-border">
                  <div className="space-y-0.5 p-1">
                    {availableFonts.map(font => (
                      <button
                        key={font.name}
                        className={cn(
                          'w-full rounded px-2 py-1 text-left text-xs transition-colors',
                          selectedFont === font.name
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground hover:bg-muted'
                        )}
                        onClick={() => handleSelectFont(font)}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Upload a{' '}
                <span className="font-mono">{64}×{5}px</span> PNG — 16 chars in order{' '}
                <span className="font-mono">0–9 a–f</span>, each{' '}
                <span className="font-mono">4×5px</span>.
              </p>
              {fontUploadError && (
                <p className="text-[11px] text-destructive">{fontUploadError}</p>
              )}
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => fontInputRef.current?.click()}
                >
                  Upload (.png)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleDownloadFont}
                >
                  Download template
                </Button>
              </div>
              <input
                ref={fontInputRef}
                type="file"
                accept=".png"
                className="hidden"
                onChange={e => void handleFontUpload(e)}
              />
            </section>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full space-y-6 px-6 py-6">
          <h1 className="text-sm font-medium">Palette Image Generator</h1>
          {controls}
          {colors.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ImageIcon className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Add at least 2 colors to see a preview
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-full justify-center p-4">
                <div className="relative shrink-0">
                  <canvas
                    ref={canvasRef}
                    style={{
                      imageRendering: 'pixelated',
                      width: canvasDims.width * 2,
                      height: canvasDims.height * 2,
                    }}
                  />
                  <button
                    onClick={handleDownloadPalette}
                    title="Save to photos / Download PNG"
                    className="absolute right-2 bottom-2 rounded-sm bg-black/40 p-1.5 text-white hover:bg-black/60 focus:outline-none"
                  >
                    <DownloadIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Too many colors */}
      <Dialog open={tooManyOpen} onOpenChange={setTooManyOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Too many colors</DialogTitle>
            <DialogDescription>
              The maximum palette size is {MAX_COLORS} colors. The image you submitted has more
              than {MAX_COLORS} unique colors. Please try a different image with a limited color
              palette.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setTooManyOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste URL */}
      <Dialog
        open={pasteUrlOpen}
        onOpenChange={open => {
          if (!open) setPasteError(null)
          setPasteUrlOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste URL or image</DialogTitle>
            <DialogDescription>
              Enter an image URL or Lospec palette URL (e.g.{' '}
              <span className="font-mono">lospec.com/palette-list/…</span>). You can also paste
              an image directly from your clipboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              className="h-16 w-full resize-none rounded border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="https://lospec.com/palette-list/..."
              value={pasteValue}
              onChange={e => setPasteValue(e.target.value)}
              onPaste={e => {
                const imageItem = Array.from(e.clipboardData.items).find(item =>
                  item.type.startsWith('image/')
                )
                if (imageItem) {
                  e.preventDefault()
                  const blob = imageItem.getAsFile()
                  if (blob) {
                    void processImageBlob(blob, false, () => {
                      setPasteUrlOpen(false)
                      setPasteValue('')
                    })
                  }
                }
              }}
              autoFocus
            />
            {pasteError && <p className="text-[11px] text-destructive">{pasteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteUrlOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleLoadUrl()}
              disabled={!pasteValue.trim() || pasteLoading}
            >
              {pasteLoading ? 'Loading…' : 'Load'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add colors manually */}
      <Dialog
        open={addManualOpen}
        onOpenChange={open => {
          if (!open) {
            setManualInput('')
            setManualPreview([])
          }
          setAddManualOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter hex values</DialogTitle>
            <DialogDescription>
              Enter hex values separated by <span className="font-mono">,</span> or{' '}
              <span className="font-mono">;</span>. Works with or without{' '}
              <span className="font-mono">#</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              className="h-16 w-full resize-none rounded border border-input bg-background px-2 py-1.5 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="ff0000, 00ff00; #0000ff"
              value={manualInput}
              onChange={e => handleManualInputChange(e.target.value)}
              autoFocus
            />
            {manualPreview.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {manualPreview.map(color => (
                  <ColorSwatch key={color} color={color} />
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddManualOpen(false)}>Cancel</Button>
            <Button onClick={handleAddManual} disabled={manualPreview.length === 0}>
              {manualPreview.length > 0
                ? `Set ${manualPreview.length} color${manualPreview.length !== 1 ? 's' : ''}`
                : 'Set colors'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
