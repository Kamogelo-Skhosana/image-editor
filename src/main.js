import './style.css'
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
    const scale = 64 / Math.max(size.width, size.height)
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
  $('#cropRatio').hidden = false
  setStatus('Drag on the image to choose the area, then apply.')
}

function exitCrop() {
  cropping = false
  cropper.hide()
  $('#cropToggle').hidden = false
  $('#cropApply').hidden = true
  $('#cropCancel').hidden = true
  $('#cropRatio').hidden = true
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
  syncFilterLabels()
  draw()
})

function syncFilterLabels() {
  const state = active()
  const filters = state?.filters ?? DEFAULT_FILTERS
  for (const { key, unit } of SLIDERS) {
    $(`[data-label="${key}"]`).textContent = `${filters[key]}${unit}`
    $(`[data-filter="${key}"]`).value = filters[key]
  }
}

$('#resetFilters').addEventListener('click', () => {
  const state = active()
  if (!state) return
  state.filters = { ...DEFAULT_FILTERS }
  syncFilterLabels()
  renderThumbs()
  draw()
})

$('#presets').innerHTML = Object.keys(PRESETS)
  .map((name) => `<button class="preset" type="button" data-preset="${name}">${name}</button>`)
  .join('')

$('#presets').addEventListener('click', (event) => {
  const name = event.target.dataset.preset
  const state = active()
  if (!name || !state) return
  state.filters = { ...DEFAULT_FILTERS, ...PRESETS[name] }
  syncFilterLabels()
  renderThumbs()
  draw()
})

/* ---------------------------------------------------------------- export --- */

$('#format').addEventListener('change', () => {
  $('#qualityField').style.visibility = $('#format').value === 'image/png' ? 'hidden' : 'visible'
  draw()
})

$('#quality').addEventListener('input', () => {
  $('#qualityLabel').textContent = `${$('#quality').value}%`
  draw()
})

$('#matte').addEventListener('change', draw)

$('#cap').addEventListener('input', () => {
  const value = Number($('#cap').value)
  $('#capLabel').textContent = value ? `${value} px` : 'off'
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
}

syncControls()
$('#qualityField').style.visibility = 'hidden' // PNG is lossless, so quality starts hidden
setStatus('Load an image to start.')
mountAds()
