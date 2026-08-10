/**
 * Editing model.
 *
 * Geometry (rotation, flips) is applied live at draw time. Cropping is
 * destructive: it bakes the current geometry into a new source canvas and
 * pushes the previous one onto the undo stack. Adjustments always stay live,
 * so sliders can be moved back and forth without losing quality.
 */

export const DEFAULT_FILTERS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
}

export const SLIDERS = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'saturate', label: 'Saturation', min: 0, max: 300, step: 1, unit: '%' },
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, unit: '°' },
  { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.1, unit: 'px' },
  { key: 'grayscale', label: 'Greyscale', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'invert', label: 'Invert', min: 0, max: 100, step: 1, unit: '%' },
]

export const PRESETS = {
  Original: {},
  Mono: { grayscale: 100, contrast: 110 },
  Vintage: { sepia: 45, saturate: 80, contrast: 95, brightness: 105 },
  Punch: { saturate: 150, contrast: 120 },
  Cool: { hue: -15, saturate: 110, brightness: 103 },
  Warm: { hue: 12, saturate: 115, brightness: 104 },
  Faded: { contrast: 85, saturate: 75, brightness: 110 },
  Negative: { invert: 100 },
}

export function createState(source, name) {
  const state = {
    name,
    source,
    original: source,
    rotation: 0,
    flipH: false,
    flipV: false,
    filters: { ...DEFAULT_FILTERS },
    preset: 'Original', // which chip is highlighted; cleared by hand-tuning
    width: 0,
    height: 0,
    history: [],
  }
  resetSize(state)
  return state
}

/** Natural output size for the current geometry, before any manual resize. */
export function naturalSize(state) {
  const { width, height } = sourceSize(state)
  return state.rotation % 180 === 0 ? { width, height } : { width: height, height: width }
}

export function sourceSize(state) {
  const source = state.source
  return {
    width: source.naturalWidth ?? source.width,
    height: source.naturalHeight ?? source.height,
  }
}

export function resetSize(state) {
  const size = naturalSize(state)
  state.width = size.width
  state.height = size.height
}

export function filterString(filters) {
  return [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    `saturate(${filters.saturate}%)`,
    `hue-rotate(${filters.hue}deg)`,
    `blur(${filters.blur}px)`,
    `grayscale(${filters.grayscale}%)`,
    `sepia(${filters.sepia}%)`,
    `invert(${filters.invert}%)`,
  ].join(' ')
}

export function isDefaultFilters(filters) {
  return Object.entries(DEFAULT_FILTERS).every(([key, value]) => filters[key] === value)
}

/**
 * Draws the image into `canvas` at the requested size.
 * `withFilters: false` gives a geometry-only render (used when baking a crop).
 */
export function render(state, canvas, { width, height, withFilters = true, background = null } = {}) {
  const outWidth = Math.max(1, Math.round(width ?? state.width))
  const outHeight = Math.max(1, Math.round(height ?? state.height))

  canvas.width = outWidth
  canvas.height = outHeight

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, outWidth, outHeight)

  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, outWidth, outHeight)
  }

  ctx.imageSmoothingQuality = 'high'
  if (withFilters && !isDefaultFilters(state.filters)) ctx.filter = filterString(state.filters)

  // Pre-rotation box: swapped when the image is turned on its side.
  const upright = state.rotation % 180 === 0
  const drawWidth = upright ? outWidth : outHeight
  const drawHeight = upright ? outHeight : outWidth

  ctx.save()
  ctx.translate(outWidth / 2, outHeight / 2)
  ctx.rotate((state.rotation * Math.PI) / 180)
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1)
  ctx.drawImage(state.source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()

  return canvas
}

/**
 * Bakes geometry (and an optional crop rectangle in output pixels) into a new
 * source canvas, so later edits start from the cropped result.
 */
export function bake(state, crop = null) {
  const natural = naturalSize(state)
  const full = document.createElement('canvas')
  render(state, full, { ...natural, withFilters: false })

  let next = full
  if (crop) {
    const x = Math.max(0, Math.round(crop.x))
    const y = Math.max(0, Math.round(crop.y))
    const w = Math.max(1, Math.min(Math.round(crop.width), full.width - x))
    const h = Math.max(1, Math.min(Math.round(crop.height), full.height - y))

    next = document.createElement('canvas')
    next.width = w
    next.height = h
    next.getContext('2d').drawImage(full, x, y, w, h, 0, 0, w, h)
  }

  state.history.push({ source: state.source, rotation: state.rotation, flipH: state.flipH, flipV: state.flipV })
  state.source = next
  state.rotation = 0
  state.flipH = false
  state.flipV = false
  resetSize(state)
}

export function undo(state) {
  const previous = state.history.pop()
  if (!previous) return false
  Object.assign(state, previous)
  resetSize(state)
  return true
}

export function revert(state) {
  state.source = state.original
  state.rotation = 0
  state.flipH = false
  state.flipV = false
  state.filters = { ...DEFAULT_FILTERS }
  state.preset = 'Original'
  state.history = []
  resetSize(state)
}

export function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Renders the current state at export size and encodes it. */
export async function exportBlob(state, { type, quality, matte, maxSide = 0 }) {
  let width = state.width
  let height = state.height

  if (maxSide > 0 && Math.max(width, height) > maxSide) {
    const scale = maxSide / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  const flatten = type === 'image/jpeg' || matte
  render(state, canvas, { width, height, background: flatten ? '#ffffff' : null })

  const blob = await toBlob(canvas, type, type === 'image/png' ? undefined : quality)
  return { blob, width, height }
}
