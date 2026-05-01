import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, GripVerticalIcon, ImageIcon, Link2Icon, PlusIcon, UploadIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import ToolLayout from '@/layouts/tool-layout'
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
  glyphTableToPNG,
  DEFAULT_GLYPHS,
  type GlyphTable,
} from '@/lib/canvas-utils'

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

function ColorSwatch({
  color,
  onRemove,
}: {
  color: string
  onRemove?: () => void
}) {
  return (
    <Badge variant="outline" className="h-6 gap-1 pl-1 font-mono text-[10px]">
      <span
        className="inline-block size-3 shrink-0 rounded-sm border border-border/40"
        style={{ backgroundColor: color }}
      />
      {color}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 leading-none opacity-40 hover:opacity-80 focus:outline-none"
          aria-label={`Remove ${color}`}
        >
          ×
        </button>
      )}
    </Badge>
  )
}

function ColorDot({
  color,
  selected,
  onClick,
  title,
}: {
  color: string
  selected: boolean
  onClick: () => void
  title: string
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
  const [availableFonts, setAvailableFonts] = useState<FontEntry[]>([
    { name: 'Built-in', glyphs: DEFAULT_GLYPHS },
  ])
  const [selectedFont, setSelectedFont] = useState('Built-in')
  const [activeGlyphs, setActiveGlyphs] = useState<GlyphTable>(DEFAULT_GLYPHS)
  const [fontUploadError, setFontUploadError] = useState<string | null>(null)
  const [bgColor, setBgColor] = useState<string | null>(null)
  const [textColor, setTextColor] = useState<string | null>(null)
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 })
  const [previewScale, setPreviewScale] = useState(8)
  const [paletteDraggedIndex, setPaletteDraggedIndex] = useState<number | null>(null)
  const [paletteDragOverIndex, setPaletteDragOverIndex] = useState<number | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setBgColor(prev => (prev && !colors.includes(prev) ? null : prev))
    setTextColor(prev => (prev && !colors.includes(prev) ? null : prev))
  }, [colors])

  useEffect(() => {
    if (!canvasRef.current || colors.length === 0) return
    const bg = bgColor ?? colors[0]
    const text = textColor ?? colors[colors.length - 1]
    drawPalette(canvasRef.current, colors, bg, text, activeGlyphs)
    const cw = canvasRef.current.width
    const ch = canvasRef.current.height
    setCanvasDims({ width: cw, height: ch })
    const containerW = containerRef.current?.clientWidth ?? 600
    setPreviewScale(Math.max(2, Math.min(12, Math.floor(containerW / cw))))
  }, [colors, bgColor, textColor, activeGlyphs])

  useEffect(() => {
    if (colors.length < 2) {
      setOpenSections(prev => prev.filter(s => s !== 'settings'))
    }
  }, [colors])

  function addColorsFromImage(extracted: string[]) {
    const unique = Array.from(new Set(extracted))
    if (unique.length > MAX_COLORS) {
      setTooManyOpen(true)
      return
    }
    setColors(prev => Array.from(new Set([...prev, ...unique])).slice(0, MAX_COLORS))
    const next = Array.from(new Set([...colors, ...unique])).slice(0, MAX_COLORS)
    if (next.length >= 2) setOpenSections(['settings'])
  }

  function addColors(newColors: string[]) {
    setColors(prev =>
      Array.from(new Set([...prev, ...newColors])).slice(0, MAX_COLORS)
    )
  }

  function removeColor(hex: string) {
    setColors(prev => prev.filter(c => c !== hex))
  }

  function clearColors() {
    setColors([])
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
        const next = Array.from(new Set([...colors, ...loaded])).slice(0, MAX_COLORS)
        setColors(next)
        if (next.length >= 2) setOpenSections(['settings'])
      } else if (/^https?:\/\//i.test(value)) {
        addColorsFromImage(await extractColorsFromImageUrl(value))
      } else {
        setPasteError(
          'Enter a Lospec palette URL or an image URL starting with https://'
        )
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
    addColors(manualPreview)
    setManualInput('')
    setManualPreview([])
    setAddManualOpen(false)
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

  function handleDownloadDefaultFont() {
    const dataUrl = glyphTableToPNG(activeGlyphs)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${selectedFont.toLowerCase().replace(/\s+/g, '-')}.png`
    a.click()
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

  const effectiveBg = bgColor ?? colors[0] ?? '#000000'
  const effectiveText = textColor ?? colors[colors.length - 1] ?? '#ffffff'
  const newManualCount = manualPreview.filter(c => !colors.includes(c)).length

  const controls = (
    <Accordion
      type="multiple"
      value={openSections}
      onValueChange={setOpenSections}
    >
      {/* ── Step 1: Colors ── */}
      <AccordionItem value="colors">
        <AccordionTrigger>
          Colors{colors.length > 0 ? ` (${colors.length})` : ''}
        </AccordionTrigger>
        <AccordionContent className="h-auto">
          <div className="space-y-5">
            {/* Add from image — upload + paste URL */}
            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Add from image or link
              </p>
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
                  {uploadLoading ? 'Reading…' : 'Upload'}
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
                  Clipboard
                </Button>
              </div>
              {uploadError && (
                <p className="text-[11px] text-destructive">{uploadError}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </section>

            {/* Add manually */}
            <section>
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
                Add colors manually
              </Button>
            </section>

            {/* Current palette */}
            {colors.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Palette ({colors.length}/{MAX_COLORS})
                  </p>
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={clearColors}
                  >
                    Clear all
                  </button>
                </div>
                {/* Sort buttons */}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 px-2 text-[10px]"
                    onClick={() =>
                      setColors(prev => [...prev].sort((a, b) => getHue(a) - getHue(b)))
                    }
                  >
                    Hue
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 px-2 text-[10px]"
                    onClick={() =>
                      setColors(prev =>
                        [...prev].sort((a, b) => getBrightness(a) - getBrightness(b))
                      )
                    }
                  >
                    Brightness
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 px-2 text-[10px]"
                    onClick={() =>
                      setColors(prev =>
                        [...prev].sort((a, b) => getLuminance(a) - getLuminance(b))
                      )
                    }
                  >
                    Luminance
                  </Button>
                </div>
                {/* Draggable color grid */}
                <div className="grid grid-cols-2 gap-1">
                  {colors.map((color, index) => {
                    const isOddLast =
                      index === colors.length - 1 && colors.length % 2 === 1
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
                          'flex',
                          isOddLast && 'col-span-2 justify-center',
                          paletteDragOverIndex === index &&
                            paletteDraggedIndex !== index &&
                            'rounded ring-1 ring-primary ring-offset-1'
                        )}
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-6 cursor-grab gap-1 pl-1 font-mono text-[10px] active:cursor-grabbing',
                            !isOddLast && 'w-full',
                            paletteDraggedIndex === index && 'opacity-50'
                          )}
                        >
                          <GripVerticalIcon className="size-2.5 shrink-0 text-muted-foreground/40" />
                          <span
                            className="inline-block size-3 shrink-0 rounded-sm border border-border/40"
                            style={{ backgroundColor: color }}
                          />
                          <span className="flex-1">{color}</span>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              removeColor(color)
                            }}
                            className="ml-0.5 leading-none opacity-40 hover:opacity-80 focus:outline-none"
                            aria-label={`Remove ${color}`}
                          >
                            ×
                          </button>
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Step 2: Settings ── */}
      <AccordionItem value="settings">
        <AccordionTrigger disabled={colors.length < 2}>
          {colors.length < 2 ? 'Settings — add 2+ colors first' : 'Settings'}
        </AccordionTrigger>
        <AccordionContent className="h-auto">
          <div className="space-y-4">
            {/* Background color */}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Background
                </p>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {effectiveBg}
                </span>
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
                <span className="font-mono text-[10px] text-muted-foreground">
                  {effectiveText}
                </span>
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
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Upload a{' '}
                <span className="font-mono">
                  {64}×{5}px
                </span>{' '}
                PNG — 16 chars in order{' '}
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
                  onClick={handleDownloadDefaultFont}
                >
                  Download Template
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
      <ToolLayout title="Palette Image Generator" controls={controls}>
        <div ref={containerRef} className="flex items-center justify-center">
          {colors.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <ImageIcon className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Add at least 2 colors to see a preview
              </p>
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                style={{
                  imageRendering: 'pixelated',
                  width: canvasDims.width * previewScale,
                  height: canvasDims.height * previewScale,
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
          )}
        </div>
      </ToolLayout>

      {/* Too many colors */}
      <Dialog open={tooManyOpen} onOpenChange={setTooManyOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Too many colors</DialogTitle>
            <DialogDescription>
              The maximum palette size is {MAX_COLORS} colors. The image you
              submitted has more than {MAX_COLORS} unique colors. Please try a
              different image with a limited color palette.
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
              <span className="font-mono">lospec.com/palette-list/…</span>).
              You can also paste an image directly from your clipboard.
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
            {pasteError && (
              <p className="text-[11px] text-destructive">{pasteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteUrlOpen(false)}>
              Cancel
            </Button>
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
            <DialogTitle>Add colors manually</DialogTitle>
            <DialogDescription>
              Enter hex values separated by{' '}
              <span className="font-mono">,</span> or{' '}
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
            <Button variant="outline" onClick={() => setAddManualOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddManual} disabled={newManualCount === 0}>
              {newManualCount > 0
                ? `Add ${newManualCount} color${newManualCount !== 1 ? 's' : ''}`
                : 'Add colors'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
