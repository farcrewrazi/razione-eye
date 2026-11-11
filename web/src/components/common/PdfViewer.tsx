/**
 * In-page PDF viewer — pdf.js rendered to a canvas.
 *
 * Why not an <iframe> of the PDF URL: browser PDF plugins vary (and are absent
 * in headless/webview contexts), so an iframe can silently show a blank dark
 * rectangle. Rendering with pdf.js works everywhere, keeps the document inside
 * our own UI, and gives real loading/error states.
 *
 * Default is fit-width (readable body text, scrolls vertically); "fit page"
 * shows the whole sheet at once. The request carries the session cookie, so the
 * protected /api/gate/actions/:id/cv.pdf route behaves like any other API call.
 */
import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'

GlobalWorkerOptions.workerSrc = workerUrl

type Status = 'loading' | 'ready' | 'error'
type FitMode = 'width' | 'page'

const PADDING = 24
const ZOOM_STEP = 1.2
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

export function PdfViewer({ url, title }: { url: string; title: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [fit, setFit] = useState<FitMode>('width')
  const [zoom, setZoom] = useState(1)
  const [box, setBox] = useState({ width: 0, height: 0 })

  // Load the document once per URL.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setPage(1)
    setPageCount(0)

    const task = getDocument({ url, withCredentials: true })
    task.promise
      .then((doc) => {
        if (cancelled) return
        docRef.current = doc
        setPageCount(doc.numPages)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      // pdf.js v6 has no PDFDocumentProxy.destroy(): the loading task owns the
      // document and tears it down.
      docRef.current = null
      void task.destroy().catch(() => undefined)
    }
  }, [url])

  // Track the viewport of the scroll container (both axes: fit width vs page).
  useEffect(() => {
    const element = scrollerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      setBox({
        width: Math.max(0, Math.round(rect?.width ?? 0)),
        height: Math.max(0, Math.round(rect?.height ?? 0)),
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Paint the current page.
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || status !== 'ready' || box.width < 80 || box.height < 80) return

    let cancelled = false
    let renderTask: { cancel: () => void } | null = null

    const paint = async (): Promise<void> => {
      const pdfPage = await doc.getPage(page)
      if (cancelled) return
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const base = pdfPage.getViewport({ scale: 1 })
      const byWidth = (box.width - PADDING) / base.width
      const byHeight = (box.height - PADDING) / base.height
      const fitted = fit === 'width' ? byWidth : Math.min(byWidth, byHeight)
      const scale = Math.max(0.2, fitted * zoom)
      const viewport = pdfPage.getViewport({ scale: scale * devicePixelRatio })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`
      canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`
      const task = pdfPage.render({ canvas, viewport })
      renderTask = task
      await task.promise

      // Text layer: transparent, absolutely positioned over the canvas, so the
      // page is selectable/copyable while looking exactly like the render.
      const layer = textLayerRef.current
      if (layer && !cancelled) {
        layer.replaceChildren()
        layer.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`
        layer.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`
        const textLayer = new TextLayer({
          textContentSource: await pdfPage.getTextContent(),
          container: layer,
          viewport: pdfPage.getViewport({ scale }),
        })
        await textLayer.render()
      }
    }

    paint().catch((error: unknown) => {
      // Cancellation is expected when the page, fit or zoom changes mid-paint.
      if (cancelled) return
      if (error instanceof Error && /cancel/i.test(error.message)) return
      setStatus('error')
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [page, box, fit, zoom, status])

  const goTo = (next: number): void => {
    setPage(Math.min(Math.max(1, next), Math.max(1, pageCount)))
    scrollerRef.current?.scrollTo({ top: 0 })
  }

  const changeFit = (mode: FitMode): void => {
    setFit(mode)
    setZoom(1)
  }

  const nudgeZoom = (factor: number): void => {
    setZoom((current) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current * factor)))
  }

  const controlClass =
    'grid size-7 place-items-center rounded border border-[var(--color-border)] text-[var(--color-text)]/80 transition-colors hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)] disabled:opacity-30 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text)]/80'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3">
        <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)] uppercase">
          PDF
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--color-muted)]/80">{title}</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => nudgeZoom(1 / ZOOM_STEP)}
            disabled={status !== 'ready' || zoom <= ZOOM_MIN}
            aria-label="Zoom out"
            className={controlClass}
          >
            <ZoomOut className="size-3.5" strokeWidth={2} />
          </button>
          <span className="w-10 text-center font-mono text-[10px] text-[var(--color-muted)] tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => nudgeZoom(ZOOM_STEP)}
            disabled={status !== 'ready' || zoom >= ZOOM_MAX}
            aria-label="Zoom in"
            className={controlClass}
          >
            <ZoomIn className="size-3.5" strokeWidth={2} />
          </button>

          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />

          <button
            type="button"
            onClick={() => changeFit('width')}
            aria-label="Fit width"
            aria-pressed={fit === 'width'}
            title="Fit width"
            className={
              fit === 'width'
                ? 'grid size-7 place-items-center rounded border border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : controlClass
            }
          >
            <Minimize2 className="size-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => changeFit('page')}
            aria-label="Fit page"
            aria-pressed={fit === 'page'}
            title="Fit whole page"
            className={
              fit === 'page'
                ? 'grid size-7 place-items-center rounded border border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : controlClass
            }
          >
            <Maximize2 className="size-3.5" strokeWidth={2} />
          </button>

          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />

          <button
            type="button"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1 || status !== 'ready'}
            aria-label="Previous page"
            className={controlClass}
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <span className="min-w-14 text-center font-mono text-[11px] text-[var(--color-muted)] tabular-nums">
            {status === 'ready' ? `${page} / ${pageCount}` : '— / —'}
          </span>
          <button
            type="button"
            onClick={() => goTo(page + 1)}
            disabled={status !== 'ready' || page >= pageCount}
            aria-label="Next page"
            className={controlClass}
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto bg-[#0a0a0f]">
        {status === 'loading' && (
          <div className="grid h-full place-items-center">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-[var(--color-muted)]">
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              LOADING PDF
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <FileWarning className="size-6 text-rose-300" strokeWidth={1.75} />
              <p className="text-[13px] text-[var(--color-text)]">Could not render this PDF.</p>
              <p className="font-mono text-[11px] text-[var(--color-muted)]">
                Use Open or Download PDF above.
              </p>
            </div>
          </div>
        )}

        {/* w-max keeps the sheet at its intrinsic size so the scroller actually
            overflows (previously min-h-full squeezed the canvas and killed the
            scrollbar). The text layer sits absolutely over the canvas. */}
        <div className="flex w-max min-w-full justify-center p-3">
          <div className={status === 'ready' ? 'relative shadow-lg shadow-black/40' : 'relative hidden'}>
            <canvas
              ref={canvasRef}
              className="block"
              aria-label={title}
              role="img"
            />
            <div
              ref={textLayerRef}
              className="textLayer absolute top-0 left-0 origin-top-left select-text"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PdfViewer
