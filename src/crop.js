/**
 * Drag-to-crop overlay. Works in CSS pixels over the preview, and converts the
 * final rectangle into canvas pixels so the crop is applied at full resolution.
 */

export function createCropper({ layer, box, canvas, getRatio }) {
  let rect = null
  let drag = null

  const bounds = () => layer.getBoundingClientRect()

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

  function applyRatio(next) {
    const ratio = getRatio()
    if (!ratio) return next
    const width = Math.max(next.width, 20)
    return { ...next, width, height: width / ratio }
  }

  function paint() {
    if (!rect) {
      box.style.display = 'none'
      return
    }
    box.style.display = 'block'
    box.style.left = `${rect.x}px`
    box.style.top = `${rect.y}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
  }

  function pointerPosition(event) {
    const area = bounds()
    return {
      x: clamp(event.clientX - area.left, 0, area.width),
      y: clamp(event.clientY - area.top, 0, area.height),
    }
  }

  layer.addEventListener('pointerdown', (event) => {
    const point = pointerPosition(event)
    const handle = event.target.dataset?.handle

    if (handle) {
      drag = { mode: 'resize', handle, start: point, origin: { ...rect } }
    } else if (event.target === box) {
      drag = { mode: 'move', start: point, origin: { ...rect } }
    } else {
      rect = { x: point.x, y: point.y, width: 0, height: 0 }
      drag = { mode: 'new', start: point, origin: { ...rect } }
    }

    layer.setPointerCapture(event.pointerId)
    event.preventDefault()
  })

  layer.addEventListener('pointermove', (event) => {
    if (!drag) return
    const area = bounds()
    const point = pointerPosition(event)
    const dx = point.x - drag.start.x
    const dy = point.y - drag.start.y

    if (drag.mode === 'new') {
      const next = applyRatio({
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      })
      next.width = Math.min(next.width, area.width - next.x)
      next.height = Math.min(next.height, area.height - next.y)
      rect = next
    } else if (drag.mode === 'move') {
      rect = {
        ...drag.origin,
        x: clamp(drag.origin.x + dx, 0, area.width - drag.origin.width),
        y: clamp(drag.origin.y + dy, 0, area.height - drag.origin.height),
      }
    } else {
      const origin = drag.origin
      let { x, y, width, height } = origin

      if (drag.handle.includes('e')) width = origin.width + dx
      if (drag.handle.includes('s')) height = origin.height + dy
      if (drag.handle.includes('w')) {
        x = origin.x + dx
        width = origin.width - dx
      }
      if (drag.handle.includes('n')) {
        y = origin.y + dy
        height = origin.height - dy
      }

      width = Math.max(20, width)
      height = Math.max(20, height)
      const next = applyRatio({ x, y, width, height })
      next.x = clamp(next.x, 0, area.width - 20)
      next.y = clamp(next.y, 0, area.height - 20)
      next.width = Math.min(next.width, area.width - next.x)
      next.height = Math.min(next.height, area.height - next.y)
      rect = next
    }

    paint()
  })

  const end = (event) => {
    if (!drag) return
    drag = null
    if (rect && (rect.width < 12 || rect.height < 12)) rect = null
    paint()
    if (event.pointerId !== undefined && layer.hasPointerCapture?.(event.pointerId)) {
      layer.releasePointerCapture(event.pointerId)
    }
  }

  layer.addEventListener('pointerup', end)
  layer.addEventListener('pointercancel', end)

  return {
    show() {
      layer.hidden = false
      rect = null
      paint()
    },
    hide() {
      layer.hidden = true
      rect = null
      paint()
    },
    reset() {
      rect = null
      paint()
    },
    hasSelection: () => Boolean(rect && rect.width > 12 && rect.height > 12),
    /** Selection in canvas pixels. */
    toCanvasRect() {
      if (!rect) return null
      const scaleX = canvas.width / canvas.clientWidth
      const scaleY = canvas.height / canvas.clientHeight
      return {
        x: rect.x * scaleX,
        y: rect.y * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY,
      }
    },
  }
}
