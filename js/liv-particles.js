(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mobileViewport = window.matchMedia('(max-width: 768px)')

  const createField = canvas => {
    if (!canvas || canvas.dataset.particlesReady === 'true' || mobileViewport.matches) return
    canvas.dataset.particlesReady = 'true'

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let frame = 0
    let lastTime = 0
    let points = []
    let resizeFrame = 0
    let scrollProgress = 0
    let scrollTarget = 0
    let hasDrawn = false
    let hasRevealed = false
    let revealTimer = 0
    const pointer = { x: -1000, y: -1000, active: false }

    const seededRandom = seed => {
      const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
      return value - Math.floor(value)
    }

    const makeGlyphPoints = () => {
      const maskSize = 760
      const mask = document.createElement('canvas')
      const maskCtx = mask.getContext('2d', { willReadFrequently: true })
      if (!maskCtx) return []

      mask.width = maskSize
      mask.height = maskSize
      maskCtx.clearRect(0, 0, maskSize, maskSize)
      maskCtx.fillStyle = '#000'
      maskCtx.textAlign = 'center'
      maskCtx.textBaseline = 'alphabetic'
      maskCtx.font = `400 ${Math.round(maskSize * .72)}px "Lucida Calligraphy", "Baskerville Old Face", "Palatino Linotype", Georgia, serif`
      maskCtx.lineWidth = Math.max(3, maskSize * .006)
      maskCtx.strokeStyle = '#000'
      maskCtx.strokeText('L', maskSize * .5, maskSize * .76)
      maskCtx.fillText('L', maskSize * .5, maskSize * .76)

      const image = maskCtx.getImageData(0, 0, maskSize, maskSize).data
      const step = 10
      const sampled = []
      let seed = 1

      for (let y = step; y < maskSize - step; y += step) {
        for (let x = step; x < maskSize - step; x += step) {
          const alpha = image[(y * maskSize + x) * 4 + 3] / 255
          const random = seededRandom(seed++)
          if (alpha < .18 || random > .82 + alpha * .18) continue

          sampled.push({
            nx: x / maskSize,
            ny: y / maskSize,
            phaseX: seededRandom(seed++) * Math.PI * 2,
            phaseY: seededRandom(seed++) * Math.PI * 2,
            speed: .42 + seededRandom(seed++) * .74,
            drift: 2.5 + seededRandom(seed++) * 5.5,
            depth: .25 + seededRandom(seed++) * .75,
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0
          })
        }
      }

      return sampled
    }

    const getScrollTarget = () => {
      const travel = Math.min(760, Math.max(460, height * .82))
      return Math.min(1, Math.max(0, window.scrollY / travel))
    }

    const resize = (force = false) => {
      const nextWidth = Math.max(1, window.innerWidth)
      const nextHeight = Math.max(1, window.innerHeight)
      if (!force && Math.abs(nextWidth - width) < 2 && Math.abs(nextHeight - height) < 2) return

      width = nextWidth
      height = nextHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      points = makeGlyphPoints()
      scrollTarget = getScrollTarget()
      scrollProgress = scrollTarget

      // Keep the canvas transparent until its viewport and glyph mask have
      // remained stable. Some browsers finalize scrollbar/font metrics a few
      // frames after load; revealing before that makes the glyph visibly jump.
      if (!hasRevealed) {
        hasDrawn = false
        if (revealTimer) clearTimeout(revealTimer)
        revealTimer = 0
      }

      if (reduceMotion.matches) draw(performance.now())
      else if (!frame) frame = requestAnimationFrame(draw)
    }

    const homeFor = (point, now, progress) => {
      const fieldWidth = width * .48
      const fieldHeight = Math.min(height * .76, 680)
      const originX = width * .49
      const originY = Math.max(8, height * .018)
      const motionScale = reduceMotion.matches ? 0 : 1
      const eased = progress * progress * (3 - 2 * progress)
      const driftScale = 1 - eased * .72
      const driftX = Math.sin(now * .00042 * point.speed + point.phaseX) * point.drift * motionScale * driftScale
      const driftY = Math.cos(now * .00036 * point.speed + point.phaseY) * point.drift * .85 * motionScale * driftScale
      const baseX = originX + point.nx * fieldWidth + driftX
      const baseY = originY + point.ny * fieldHeight + driftY
      const centerX = originX + fieldWidth * .5
      const centerY = originY + fieldHeight * .5
      const scale = 1 - eased * .5

      return {
        x: centerX + (baseX - centerX) * scale,
        y: centerY + (baseY - centerY) * scale
      }
    }

    const draw = now => {
      if (!canvas.isConnected) {
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        return
      }

      const elapsed = Math.min(2, Math.max(.45, (now - lastTime) / 16.667 || 1))
      lastTime = now
      ctx.clearRect(0, 0, width, height)

      scrollTarget = getScrollTarget()
      scrollProgress += (scrollTarget - scrollProgress) * (reduceMotion.matches ? 1 : Math.min(.14, .07 * elapsed))

      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      const motion = !reduceMotion.matches
      const radius = Math.min(170, width * .18)
      const visibility = 1 - scrollProgress * .2

      points.forEach(point => {
        const home = homeFor(point, now, scrollProgress)

        if (!motion) {
          point.ox = 0
          point.oy = 0
        } else {
          if (pointer.active) {
            const currentX = home.x + point.ox
            const currentY = home.y + point.oy
            const dx = currentX - pointer.x
            const dy = currentY - pointer.y
            const distance = Math.hypot(dx, dy) || 1

            if (distance < radius) {
              const force = Math.pow(1 - distance / radius, 2) * 5.4 * elapsed
              const swirl = Math.sin(point.phaseX + now * .002) * force * .34
              point.vx += dx / distance * force - dy / distance * swirl
              point.vy += dy / distance * force + dx / distance * swirl
            }
          }

          point.vx += -point.ox * .028 * elapsed
          point.vy += -point.oy * .028 * elapsed
          point.vx *= Math.pow(.91, elapsed)
          point.vy *= Math.pow(.91, elapsed)
          point.ox += point.vx * elapsed
          point.oy += point.vy * elapsed
        }

        const alpha = (dark ? .2 + point.depth * .38 : .24 + point.depth * .42) * visibility
        const size = .72 + point.depth * 1.08

        ctx.beginPath()
        ctx.arc(home.x + point.ox, home.y + point.oy, size, 0, Math.PI * 2)
        ctx.fillStyle = dark
          ? `rgba(176, 194, 255, ${alpha})`
          : `rgba(68, 99, 194, ${alpha})`
        ctx.fill()
      })

      if (!hasDrawn) {
        hasDrawn = true
        revealTimer = window.setTimeout(() => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!canvas.isConnected || mobileViewport.matches) return
            hasRevealed = true
            revealTimer = 0
            canvas.classList.add('is-ready')
          }))
        }, 180)
      }

      if (motion && !document.hidden) frame = requestAnimationFrame(draw)
    }

    const updatePointer = event => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
    }

    const clearPointer = () => { pointer.active = false }

    window.addEventListener('pointermove', updatePointer, { passive: true })
    window.addEventListener('pointerleave', clearPointer, { passive: true })
    window.addEventListener('pointercancel', clearPointer, { passive: true })

    const scheduleResize = () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
        resize()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(canvas)

    const handleMotionChange = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (reduceMotion.matches) draw(performance.now())
      else frame = requestAnimationFrame(draw)
    }

    reduceMotion.addEventListener?.('change', handleMotionChange)
    mobileViewport.addEventListener?.('change', event => {
      if (event.matches) {
        canvas.classList.remove('is-ready')
        ctx.clearRect(0, 0, width, height)
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        return
      }

      resize(true)
      if (hasRevealed) canvas.classList.add('is-ready')
      if (!reduceMotion.matches && !frame) frame = requestAnimationFrame(draw)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      } else if (!document.hidden && !reduceMotion.matches && !frame) {
        lastTime = performance.now()
        frame = requestAnimationFrame(draw)
      }
    })

    resize(true)
  }

  const init = () => {
    if (mobileViewport.matches) return
    const canvas = document.getElementById('liv-particle-field')
    if (!canvas) return

    const start = () => requestAnimationFrame(() => requestAnimationFrame(() => createField(canvas)))
    if (document.fonts?.ready) document.fonts.ready.then(start).catch(start)
    else start()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()

  document.addEventListener('pjax:complete', init)
  mobileViewport.addEventListener?.('change', init)
})()

// Share.js renders icon-only links at runtime; keep their accessible names stable.
;(() => {
  const labels = {
    'icon-facebook': '分享到 Facebook',
    'icon-twitter': '分享到 X',
    'icon-wechat': '分享到微信',
    'icon-weibo': '分享到微博',
    'icon-qq': '分享到 QQ'
  }

  const enhanceShareControls = () => {
    document.querySelectorAll('.social-share-icon').forEach(link => {
      const className = Object.keys(labels).find(name => link.classList.contains(name))
      if (!className) return
      link.setAttribute('aria-label', labels[className])
      link.setAttribute('title', labels[className])
    })
  }

  const watchShareControls = () => {
    enhanceShareControls()
    if (!document.body || document.querySelector('.social-share-icon')) return

    const observer = new MutationObserver(() => {
      if (!document.querySelector('.social-share-icon')) return
      enhanceShareControls()
      observer.disconnect()
    })

    observer.observe(document.body, { childList: true, subtree: true })
    window.setTimeout(() => {
      enhanceShareControls()
      observer.disconnect()
    }, 1600)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchShareControls, { once: true })
  } else {
    watchShareControls()
  }

  window.addEventListener('load', watchShareControls, { once: true })
  document.addEventListener('pjax:complete', () => requestAnimationFrame(watchShareControls))
})()
