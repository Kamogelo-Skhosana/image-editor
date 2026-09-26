import './style.css'
import '@polytheme/themes-classic/flourishes.css'
import './theme.js'
import { mountAds } from './ads.js'
import {
  SLIDERS, PRESETS, DEFAULT_FILTERS,
  createState, render, naturalSize, resetSize, bake, undo, revert, exportBlob,
} from './editor.js'
import { createCropper } from './crop.js'

const $ = (sel) => document.querySelector(sel)

const MAX_PREVIEW = 1400

const canvas = $('#canvas')
const stage = $('#stage')
const dropZone = $('#drop')
const fileInput = $('#fileInput')
const thumbsEl = $('#thumbs')
const metaEl = $('#meta')
const statusEl = $('#status')
const presetsEl = $('#presets')

let entries = []
let activeId = null
let nextId = 1
let cropping = false
let frame = null
let sizeTimer = null

const active = () => entries.find((entry) => entry.id === activeId)?.state ?? null

const cropper = createCropper({
  layer: $('#cropLayer'),
  box: $('#cropBox'),
  canvas,
  getRatio: () => {
    const value = $('#cropRatio').value
    return value === 'free' ? null : Number(value)
  },
})

const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`)

function setStatus(message, tone = '') {
  statusEl.textContent = message
  statusEl.dataset.tone = tone
}

/** Ranges paint their filled portion from a custom property. */
function paintRange(input) {
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  const ratio = (Number(input.value) - min) / (max - min || 1)
  input.style.setProperty('--fill', `${Math.round(ratio * 100)}%`)
}

/* ----------------------------------------------------------------- rail --- */

const rail = $('#rail')

// Each tool owns a hue. The rail colours itself from these in CSS; opening a
// panel republishes the hue on :root so the panel picks it up too.
const TOOL_HUES = {
  frame: 'var(--coral)',
  size: 'var(--blue)',
  adjust: 'var(--violet)',
  filters: 'var(--magenta)',
  export: 'var(--green)',
  batch: 'var(--amber)',
}

function showPanel(name) {
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== name
  }
  for (const tab of rail.querySelectorAll('[data-tab]')) {
    tab.classList.toggle('is-active', tab.dataset.tab === name)
  }
  document.documentElement.style.setProperty('--tool', TOOL_HUES[name] ?? 'var(--coral)')
}

rail.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]')
  if (tab) showPanel(tab.dataset.tab)
})

/* -------------------------------------------------------------- welcome --- */

/**
 * First-run sheet. Both of its buttons live in a `method="dialog"` form, so
 * closing needs no handler — this only decides when to open it and remembers
 * that it has been seen. Storage can throw in private windows, in which case
 * the sheet simply shows every visit.
 */
const welcome = $('#welcome')
const WELCOME_SEEN = 'halide.welcome.seen'

const remember = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — nothing to remember */
  }
}

const recall = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

if (!recall(WELCOME_SEEN)) welcome.showModal()

welcome.addEventListener('close', () => remember(WELCOME_SEEN, '1'))

// Clicking the backdrop counts as dismissing; the dialog box itself is the
// event target only when the click lands outside its content.
welcome.addEventListener('click', (event) => {
  if (event.target === welcome) welcome.close()
})

$('#about').addEventListener('click', () => welcome.showModal())

/* ---------------------------------------------------------------- input --- */

dropZone.addEventListener('click', () => fileInput.click())
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    fileInput.click()
  }
})
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropZone.classList.add('is-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'))
dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  dropZone.classList.remove('is-over')
  addFiles(event.dataTransfer.files)
})
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files)
  fileInput.value = ''
})
$('#addMore').addEventListener('click', () => fileInput.click())

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not read ${file.name}`))
    image.src = url
  })
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'))
  if (!files.length) return setStatus('Those files are not images.', 'warn')

  for (const file of files) {
    try {
      const image = await loadImage(file)
      const entry = { id: nextId++, name: file.name, originalSize: file.size, state: createState(image, file.name) }
      entries.push(entry)
      if (activeId === null) activeId = entry.id
    } catch (error) {
      setStatus(error.message, 'error')
    }
  }

  stage.hidden = entries.length === 0
  renderThumbs()
  syncControls()
  draw()
  setStatus(`${entries.length} image(s) loaded.`, 'ok')
}

/* --------------------------------------------------------------- thumbs --- */

function renderThumbs() {
  thumbsEl.innerHTML = ''
  for (const entry of entries) {
    const li = document.createElement('li')
    li.className = `thumb ${entry.id === activeId ? 'is-active' : ''}`

    const button = document.createElement('button')
    button.type = 'button'
    button.title = entry.name

    const preview = document.createElement('canvas')
    const size = naturalSize(entry.state)
    const scale = 96 / Math.max(size.width, size.height)
    render(entry.state, preview, { width: size.width * scale, height: size.height * scale })
    button.append(preview)
    button.addEventListener('click', () => {
      activeId = entry.id
      exitCrop()
      renderThumbs()
      syncControls()
      draw()
    })

    const remove = document.createElement('span')
    remove.className = 'thumb__remove'
    remove.textContent = '×'
    remove.addEventListener('click', (event) => {
      event.stopPropagation()
      entries = entries.filter((e) => e.id !== entry.id)
      if (activeId === entry.id) activeId = entries[0]?.id ?? null
      stage.hidden = entries.length === 0
      renderThumbs()
      syncControls()
      draw()
    })

    li.append(button, remove)
    thumbsEl.append(li)
  }

  // Preset chips preview the active image, so they follow it around.
  renderPresets()
}

/* ---------------------------------------------------------------- draw --- */

function draw() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = null
    const state = active()
    if (!state) {
      canvas.width = canvas.height = 0
      metaEl.textContent = ''
      return
    }

    const scale = Math.min(1, MAX_PREVIEW / Math.max(state.width, state.height))
    render(state, canvas, { width: state.width * scale, height: state.height * scale })
    updateMeta()
  })
}

function updateMeta() {
  const state = active()
  if (!state) return
  const source = naturalSize(state)
  metaEl.textContent = `${state.width} × ${state.height} px · source ${source.width} × ${source.height} · measuring…`

  clearTimeout(sizeTimer)
  sizeTimer = setTimeout(async () => {
    const current = active()
    if (current !== state) return
    const { blob } = await exportBlob(state, exportOptions())
    if (active() !== state || !blob) return
    metaEl.textContent = `${state.width} × ${state.height} px · source ${source.width} × ${source.height} · ~${formatBytes(blob.size)} as ${formatLabel()}`
  }, 400)
}

const formatLabel = () => $('#format').selectedOptions[0].textContent

function exportOptions() {
  return {
    type: $('#format').value,
    quality: Number($('#quality').value) / 100,
    matte: $('#matte').checked,
  }
}

/* ------------------------------------------------------------ transform --- */

$('.tools').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action], [data-scale]')
  const state = active()
  if (!button || !state) return

  if (button.dataset.scale) {
    const natural = naturalSize(state)
    const scale = Number(button.dataset.scale)
    state.width = Math.max(1, Math.round(natural.width * scale))
    state.height = Math.max(1, Math.round(natural.height * scale))
    syncSizeInputs()
    draw()
    return
  }

  switch (button.dataset.action) {
    case 'rotate-left':
      state.rotation = (state.rotation + 270) % 360
      resetSize(state)
      break
    case 'rotate-right':
      state.rotation = (state.rotation + 90) % 360
      resetSize(state)
      break
    case 'flip-h':
      state.flipH = !state.flipH
      break
    case 'flip-v':
      state.flipV = !state.flipV
      break
    default:
      return
  }

  cropper.reset()
  syncSizeInputs()
  renderThumbs()
  draw()
})

/* ------------------------------------------------------------------ crop --- */

function enterCrop() {
  cropping = true
  cropper.show()
  $('#cropToggle').hidden = true
  $('#cropApply').hidden = false
  $('#cropCancel').hidden = false
  $('#cropRatioField').hidden = false
  stage.classList.add('is-cropping')
  showPanel('frame')
  setStatus('Drag on the image to choose the area, then apply.')
}

function exitCrop() {
  cropping = false
  cropper.hide()
  $('#cropToggle').hidden = false
  $('#cropApply').hidden = true
  $('#cropCancel').hidden = true
  $('#cropRatioField').hidden = true
  stage.classList.remove('is-cropping')
}

$('#cropToggle').addEventListener('click', () => {
  if (!active()) return setStatus('Load an image first.', 'warn')
  cropping ? exitCrop() : enterCrop()
})

$('#cropCancel').addEventListener('click', exitCrop)

$('#cropApply').addEventListener('click', () => {
  const state = active()
  if (!state) return
  if (!cropper.hasSelection()) return setStatus('Drag a rectangle on the image first.', 'warn')

  // Preview may be scaled down, so map the selection back to full resolution.
  const rect = cropper.toCanvasRect()
  const natural = naturalSize(state)
  const scaleX = natural.width / canvas.width
  const scaleY = natural.height / canvas.height

  bake(state, {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  })

  exitCrop()
  syncControls()
  renderThumbs()
  draw()
  setStatus(`Cropped to ${state.width} × ${state.height}.`, 'ok')
})

/* ------------------------------------------------------------------ size --- */

const widthInput = $('#width')
const heightInput = $('#height')

function syncSizeInputs() {
  const state = active()
  if (!state) return
  widthInput.value = state.width
  heightInput.value = state.height
}

widthInput.addEventListener('input', () => {
  const state = active()
  if (!state) return
  const value = Math.max(1, Number(widthInput.value) || 1)
  const ratio = state.height / state.width
  state.width = value
  if ($('#lockRatio').checked) {
    state.height = Math.max(1, Math.round(value * ratio))
    heightInput.value = state.height
  }
  draw()
})

heightInput.addEventListener('input', () => {
  const state = active()
  if (!state) return
  const value = Math.max(1, Number(heightInput.value) || 1)
  const ratio = state.width / state.height
  state.height = value
  if ($('#lockRatio').checked) {
    state.width = Math.max(1, Math.round(value * ratio))
    widthInput.value = state.width
  }
  draw()
})

/* ----------------------------------------------------------- adjustments --- */

$('#sliders').innerHTML = SLIDERS.map(({ key, label, min, max, step, unit }) => `
  <label class="slider">
    <span>${label}<em data-label="${key}">${DEFAULT_FILTERS[key]}${unit}</em></span>
    <input type="range" data-filter="${key}" min="${min}" max="${max}" step="${step}" value="${DEFAULT_FILTERS[key]}" />
  </label>`).join('')

$('#sliders').addEventListener('input', (event) => {
  const key = event.target.dataset.filter
  const state = active()
  if (!key || !state) return
  state.filters[key] = Number(event.target.value)
  state.preset = null // hand-tuning drops the preset badge
  syncFilterLabels()
  markActivePreset()
  draw()
})

function syncFilterLabels() {
  const state = active()
  const filters = state?.filters ?? DEFAULT_FILTERS
  for (const { key, unit } of SLIDERS) {
    const input = $(`[data-filter="${key}"]`)
    $(`[data-label="${key}"]`).textContent = `${filters[key]}${unit}`
    input.value = filters[key]
    input.closest('.slider').classList.toggle('is-touched', filters[key] !== DEFAULT_FILTERS[key])
    paintRange(input)
  }
}

$('#resetFilters').addEventListener('click', () => {
  const state = active()
  if (!state) return
  state.filters = { ...DEFAULT_FILTERS }
  state.preset = 'Original'
  syncFilterLabels()
  renderThumbs()
  draw()
})

/**
 * Preset chips carry a live thumbnail of the active image under that look, so
 * the choice is made by eye rather than by name.
 */
function renderPresets() {
  const state = active()
  presetsEl.innerHTML = ''

  for (const [name, filters] of Object.entries(PRESETS)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'preset'
    button.dataset.preset = name

    const thumb = document.createElement('span')
    thumb.className = 'preset__thumb'

    if (state) {
      const preview = document.createElement('canvas')
      const size = naturalSize(state)
      const scale = 120 / Math.max(size.width, size.height)
      const restore = state.filters
      state.filters = { ...DEFAULT_FILTERS, ...filters }
      render(state, preview, { width: size.width * scale, height: size.height * scale })
      state.filters = restore
      thumb.append(preview)
    }

    const label = document.createElement('span')
    label.textContent = name

    button.append(thumb, label)
    presetsEl.append(button)
  }

  markActivePreset()
}

function markActivePreset() {
  const current = active()?.preset
  for (const button of presetsEl.children) {
    button.classList.toggle('is-active', button.dataset.preset === current)
  }
}

presetsEl.addEventListener('click', (event) => {
  const name = event.target.closest('[data-preset]')?.dataset.preset
  const state = active()
  if (!name || !state) return
  state.filters = { ...DEFAULT_FILTERS, ...PRESETS[name] }
  state.preset = name
  syncFilterLabels()
  renderThumbs()
  draw()
})

/* ---------------------------------------------------------------- export --- */

// PNG is lossless, so the quality control is meaningless there.
const syncQualityField = () => {
  $('#qualityField').hidden = $('#format').value === 'image/png'
}

$('#format').addEventListener('change', () => {
  syncQualityField()
  draw()
})

$('#quality').addEventListener('input', () => {
  $('#qualityLabel').textContent = `${$('#quality').value}%`
  paintRange($('#quality'))
  draw()
})

$('#matte').addEventListener('change', draw)

$('#cap').addEventListener('input', () => {
  const value = Number($('#cap').value)
  $('#capLabel').textContent = value ? `${value} px` : 'off'
  paintRange($('#cap'))
})

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const outputName = (name, type) => {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type]
  return `${name.replace(/\.[^.]+$/, '')}-edited.${ext}`
}

$('#download').addEventListener('click', async () => {
  const state = active()
  if (!state) return setStatus('Load an image first.', 'warn')
  const options = exportOptions()
  const { blob, width, height } = await exportBlob(state, options)
  if (!blob) return setStatus('This browser could not encode that format.', 'error')
  saveBlob(blob, outputName(state.name, options.type))
  setStatus(`Saved ${width} × ${height} · ${formatBytes(blob.size)}.`, 'ok')
})

$('#copy').addEventListener('click', async () => {
  const state = active()
  if (!state) return
  try {
    const { blob } = await exportBlob(state, { ...exportOptions(), type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    setStatus('Copied to clipboard as PNG.', 'ok')
  } catch {
    setStatus('Clipboard blocked by the browser — use Download instead.', 'error')
  }
})

$('#batch').addEventListener('click', async () => {
  if (!entries.length) return setStatus('Load some images first.', 'warn')
  const options = { ...exportOptions(), maxSide: Number($('#cap').value) }
  const shared = active()?.filters ?? DEFAULT_FILTERS

  setStatus(`Converting ${entries.length} image(s)…`)
  let index = 0

  for (const entry of entries) {
    const state = entry.state
    const restore = state.filters
    state.filters = { ...shared }
    const { blob } = await exportBlob(state, options)
    state.filters = restore

    if (blob) {
      setTimeout(() => saveBlob(blob, outputName(entry.name, options.type)), index * 350)
      index += 1
    }
  }

  setStatus(`${index} file(s) sent to your downloads.`, 'ok')
})

/* ----------------------------------------------------------------- misc --- */

$('#undo').addEventListener('click', () => {
  const state = active()
  if (!state) return
  if (undo(state)) {
    syncControls()
    renderThumbs()
    draw()
    setStatus('Undid the last crop.', 'ok')
  }
})

$('#revert').addEventListener('click', () => {
  const state = active()
  if (!state) return
  revert(state)
  exitCrop()
  syncControls()
  renderThumbs()
  draw()
  setStatus('Back to the original image.', 'ok')
})

function syncControls() {
  const state = active()
  $('#undo').disabled = !state?.history.length
  if (!state) return
  syncSizeInputs()
  syncFilterLabels()
  markActivePreset()
}

showPanel('frame')
syncControls()
syncFilterLabels() // paints the range fills before any image is loaded
renderPresets()
syncQualityField()
paintRange($('#quality'))
paintRange($('#cap'))
setStatus('Load an image to start.')
mountAds()
