import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, ImageIcon, UploadIcon } from 'lucide-react'

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
  const [dragOver, setDragOver] = useState(false)
  const [tooManyOpen, setTooManyOpen] = useState(false)
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

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)

  // Reset bg/text color if the chosen color is removed from palette
  useEffect(() => {
    setBgColor(prev => (prev && !colors.includes(prev) ? null : prev))
    setTextColor(prev => (prev && !colors.includes(prev) ? null : prev))
  }, [colors])

  // Redraw canvas when colors or color settings change
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

  // Collapse Settings when palette drops below 2 colors
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
    setColors(prev =>
      Array.from(new Set([...prev, ...unique])).slice(0, MAX_COLORS)
    )
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

  async function processImageBlob(blob: Blob, fromUpload: boolean) {
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

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type.startsWith('image/')) {
      void processImageBlob(file, true)
    } else {
      setUploadError('Unsupported file type. Please upload an image file.')
    }
  }

  function handlePasteEvent(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find(item =>
      item.type.startsWith('image/')
    )
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (blob) void processImageBlob(blob, false)
    }
  }

  async function handleLoadUrl() {
    const value = pasteValue.trim()
    if (!value) return
    setPasteLoading(true)
    setPasteError(null)
    try {
      if (isLospecUrl(value)) {
        addColors(await fetchLospecColors(value))
      } else if (/^https?:\/\//i.test(value)) {
        addColorsFromImage(await extractColorsFromImageUrl(value))
      } else {
        setPasteError(
          'Enter a Lospec palette URL or an image URL starting with https://'
        )
        return
      }
      setPasteValue('')
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

  function handleDownloadPalette() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'palette.png'
    a.click()
  }

  function handleDownloadDefaultFont() {
    const dataUrl = glyphTableToPNG(activeGlyphs)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${selectedFont.toLowerCase().replace(/\s+/g, '-')}.png`
    a.click()
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
            {/* Upload */}
            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Upload image
              </p>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded border border-dashed p-4 text-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                  uploadLoading && 'pointer-events-none opacity-50'
                )}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ')
                    fileInputRef.current?.click()
                }}
                onDragOver={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragEnter={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <UploadIcon className="size-4 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {uploadLoading
                    ? 'Reading colors…'
                    : 'Drop an image or click to browse'}
                </span>
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

            {/* Paste URL or image */}
            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Paste URL or image
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Accepts an image URL, or a Lospec palette URL (e.g.{' '}
                <span className="font-mono">lospec.com/palette-list/…</span>).
                You can also paste an image directly from your clipboard.
              </p>
              <textarea
                className="h-14 w-full resize-none rounded border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="https://lospec.com/palette-list/..."
                value={pasteValue}
                onChange={e => setPasteValue(e.target.value)}
                onPaste={handlePasteEvent}
              />
              {pasteError && (
                <p className="text-[11px] text-destructive">{pasteError}</p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => void handleLoadUrl()}
                disabled={!pasteValue.trim() || pasteLoading}
              >
                {pasteLoading ? 'Loading…' : 'Load'}
              </Button>
            </section>

            {/* Manual hex input */}
            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Manual hex input
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Enter hex values separated by{' '}
                <span className="font-mono">,</span> or{' '}
                <span className="font-mono">;</span>. Works with or without{' '}
                <span className="font-mono">#</span>.
              </p>
              <textarea
                className="h-14 w-full resize-none rounded border border-input bg-background px-2 py-1.5 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="ff0000, 00ff00; #0000ff"
                value={manualInput}
                onChange={e => handleManualInputChange(e.target.value)}
              />
              {manualPreview.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {manualPreview.map(color => (
                    <ColorSwatch key={color} color={color} />
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleAddManual}
                disabled={newManualCount === 0}
              >
                {newManualCount > 0
                  ? `Add ${newManualCount} color${newManualCount !== 1 ? 's' : ''}`
                  : 'Add colors'}
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
                <div className="flex flex-wrap gap-1">
                  {colors.map(color => (
                    <ColorSwatch
                      key={color}
                      color={color}
                      onRemove={() => removeColor(color)}
                    />
                  ))}
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
                <span
                  className="font-mono text-[10px] text-muted-foreground"
                  style={{ color: undefined }}
                >
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
                title="Download PNG"
                className="absolute right-2 bottom-2 rounded-sm bg-black/40 p-1.5 text-white hover:bg-black/60 focus:outline-none"
              >
                <DownloadIcon className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </ToolLayout>

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
    </>
  )
}
