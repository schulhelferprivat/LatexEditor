import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PDFDocumentLoadingTask,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toScreenPoint, toSourcePoint } from './coordinates';
import { PdfContextMenu } from './context-menu';
import type { SyncLocation } from '../domain/types';
GlobalWorkerOptions.workerSrc = workerUrl;
export type PdfMode = 'width' | 'page' | 'custom';
type PageSlot = {
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  text: HTMLDivElement;
  marker: HTMLDivElement;
  number: number;
  page?: PDFPageProxy;
  render?: RenderTask;
  textLayer?: TextLayer;
  visible: boolean;
  generation: number;
};
export class PdfViewer {
  private contextMenu: PdfContextMenu;
  private document?: PDFDocumentProxy;
  private loading?: PDFDocumentLoadingTask;
  private observer: IntersectionObserver;
  private resize: ResizeObserver;
  private pages: PageSlot[] = [];
  private mode: PdfMode = 'width';
  private scale = 1;
  private generation = 0;
  private target?: SyncLocation;
  private deviceRatio = window.devicePixelRatio || 1;
  private layoutSize = { width: 0, height: 0 };
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private firstSize = { width: 595, height: 842 };
  private lens = document.createElement('div');
  private lensCanvas = document.createElement('canvas');
  private lensPointer?: number;
  private lensFrame = 0;
  private lensPosition = { x: 0, y: 0 };
  private hideLens = () => {
    cancelAnimationFrame(this.lensFrame);
    this.lensFrame = 0;
    this.lens.hidden = true;
    this.container.classList.remove('pdf-lens-active');
  };
  private closeLens = () => {
    const pointer = this.lensPointer;
    this.lensPointer = undefined;
    if (pointer !== undefined && this.container.hasPointerCapture(pointer))
      this.container.releasePointerCapture(pointer);
    this.hideLens();
  };
  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey || event.metaKey) return;
    if (!this.pages.some((slot) => slot.page && slot.element.contains(event.target as Node))) return;
    event.preventDefault();
    this.closeLens();
    this.lensPointer = event.pointerId;
    this.container.classList.add('pdf-lens-active');
    this.container.setPointerCapture(event.pointerId);
    this.onPointerMove(event);
  };
  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.lensPointer) return;
    if (!(event.buttons & 1)) {
      this.closeLens();
      return;
    }
    this.lensPosition = { x: event.clientX, y: event.clientY };
    if (!this.lensFrame)
      this.lensFrame = requestAnimationFrame(() => {
        this.lensFrame = 0;
        void this.renderLens();
      });
  };
  private onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId === this.lensPointer) this.closeLens();
  };
  private renderLens() {
    const { x, y } = this.lensPosition;
    const bounds = this.container.getBoundingClientRect();
    const slot = this.pages.find((candidate) => {
      const rect = candidate.element.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    });
    if (!slot?.page || x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom) {
      this.hideLens();
      return;
    }
    const rect = slot.element.getBoundingClientRect();
    const ratio = this.deviceRatio;
    if (!slot.canvas.width || !slot.canvas.height) return;
    const canvas = this.lensCanvas;
    const width = Math.ceil(200 * ratio);
    if (canvas.width !== width || canvas.height !== width) {
      canvas.width = width;
      canvas.height = width;
    }
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    this.lens.style.left = `${x - 100}px`;
    this.lens.style.top = `${y - 100}px`;
    const scaleX = slot.canvas.width / rect.width;
    const scaleY = slot.canvas.height / rect.height;
    const sourceWidth = 100 * scaleX;
    const sourceHeight = 100 * scaleY;
    const sourceX = (x - rect.left) * scaleX - sourceWidth / 2;
    const sourceY = (y - rect.top) * scaleY - sourceHeight / 2;
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, width);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(slot.canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, width);
    this.lens.hidden = false;
  }
  private onWindowResize = () => {
    this.closeLens();
    const ratio = window.devicePixelRatio || 1;
    if (ratio !== this.deviceRatio) {
      this.deviceRatio = ratio;
      this.layout();
    }
  };
  constructor(
    private container: HTMLElement,
    private onStatus: (pages: number, scale: number) => void,
    private onSync: (point: SyncLocation) => void,
    private onError: (message: string) => void,
    private canSync: () => boolean = () => true,
  ) {
    this.contextMenu = new PdfContextMenu(
      container,
      this.closeLens,
      (element, x, y) => this.syncAt(element, x, y),
      canSync,
      onError,
    );
    this.lens.className = 'pdf-lens';
    this.lens.hidden = true;
    this.lens.setAttribute('aria-hidden', 'true');
    this.lens.append(this.lensCanvas);
    document.body.append(this.lens);
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerEnd);
    container.addEventListener('pointercancel', this.onPointerEnd);
    container.addEventListener('lostpointercapture', this.onPointerEnd);
    container.addEventListener('scroll', this.closeLens);
    window.addEventListener('blur', this.closeLens);
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = this.pages.find((slot) => slot.element === entry.target);
          if (!page) continue;
          page.visible = entry.isIntersecting;
          if (page.visible) void this.render(page);
          else this.releasePage(page);
        }
      },
      { root: container, rootMargin: '800px 0px' },
    );
    this.resize = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (
          this.layoutSize.width !== container.clientWidth ||
          this.layoutSize.height !== container.clientHeight
        )
          this.layout();
      }, 100);
    });
    this.resize.observe(container);
    window.addEventListener('resize', this.onWindowResize);
  }
  async load(url: string) {
    const generation = ++this.generation;
    this.clear();
    this.loading = getDocument({
      url,
      isEvalSupported: false,
      cMapUrl: `${import.meta.env.BASE_URL}pdf/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${import.meta.env.BASE_URL}pdf/standard_fonts/`,
      wasmUrl: `${import.meta.env.BASE_URL}pdf/wasm/`,
      enableXfa: false,
    });
    try {
      const pdf = await this.loading.promise;
      if (generation !== this.generation) {
        await pdf.destroy();
        return;
      }
      this.document = pdf;
      const first = await pdf.getPage(1);
      if (generation !== this.generation) return;
      const viewport = first.getViewport({ scale: 1 });
      this.firstSize = { width: viewport.width, height: viewport.height };
      for (let number = 1; number <= pdf.numPages; number++) {
        const element = document.createElement('div');
        element.className = 'pdf-page';
        element.setAttribute('aria-label', `Seite ${number}`);
        element.dataset.page = String(number);
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        const text = document.createElement('div');
        text.className = 'textLayer';
        const marker = document.createElement('div');
        marker.className = 'pdf-marker';
        marker.hidden = true;
        element.append(canvas, text, marker);
        const slot: PageSlot = {
          element,
          canvas,
          text,
          marker,
          number,
          page: number === 1 ? first : undefined,
          visible: false,
          generation: 0,
        };
        element.addEventListener('click', (event) => {
          if (!(event.ctrlKey || event.metaKey) || !slot.page) return;
          event.preventDefault();
          this.syncAt(element, event.clientX, event.clientY);
        });
        this.pages.push(slot);
        this.container.append(element);
        this.observer.observe(element);
      }
      this.layout();
    } catch (error) {
      if (generation === this.generation)
        this.onError(error instanceof Error ? error.message : String(error));
    }
  }
  private syncAt(element: HTMLElement, x: number, y: number) {
    const slot = this.pages.find((candidate) => candidate.element === element);
    if (!slot?.page || !this.canSync()) return;
    const rect = element.getBoundingClientRect();
    const viewport = slot.page.getViewport({ scale: this.pageScale(slot.page) });
    const point = toSourcePoint(viewport, slot.page.view, x - rect.left, y - rect.top);
    this.onSync({ page: slot.number, ...point });
  }
  zoom(factor: number) {
    this.mode = 'custom';
    this.scale = Math.min(4, Math.max(0.25, this.scale * factor));
    this.layout();
  }
  fit(mode: 'width' | 'page') {
    this.mode = mode;
    this.layout();
  }
  private pageScale(page?: PDFPageProxy) {
    if (this.mode === 'custom') return this.scale;
    const size = page ? page.getViewport({ scale: 1 }) : this.firstSize;
    const width = Math.max(100, this.container.clientWidth - 64) / size.width;
    return Math.max(
      0.1,
      Math.min(
        4,
        this.mode === 'width'
          ? width
          : Math.min(width, Math.max(100, this.container.clientHeight - 48) / size.height),
      ),
    );
  }
  private layout() {
    this.contextMenu.close();
    this.closeLens();
    if (!this.document || this.container.clientWidth === 0) return;
    this.layoutSize = { width: this.container.clientWidth, height: this.container.clientHeight };
    const anchor = this.pages.find(
      (slot) => slot.element.offsetTop + slot.element.offsetHeight > this.container.scrollTop,
    );
    const fraction = anchor
      ? (this.container.scrollTop - anchor.element.offsetTop) / Math.max(1, anchor.element.offsetHeight)
      : 0;
    this.scale = this.pageScale(this.pages[0]?.page);
    for (const slot of this.pages) {
      const viewport = slot.page?.getViewport({ scale: this.pageScale(slot.page) });
      slot.element.style.width = `${viewport?.width ?? this.firstSize.width * this.scale}px`;
      slot.element.style.height = `${viewport?.height ?? this.firstSize.height * this.scale}px`;
      this.releasePage(slot);
      if (slot.visible) void this.render(slot);
    }
    if (anchor) this.container.scrollTop = anchor.element.offsetTop + fraction * anchor.element.offsetHeight;
    this.onStatus(this.document.numPages, this.scale);
  }
  private async render(slot: PageSlot) {
    const generation = ++slot.generation;
    const pdf = this.document;
    if (!pdf) return;
    try {
      slot.page ??= await pdf.getPage(slot.number);
      if (generation !== slot.generation || !slot.visible) return;
      const viewport = slot.page.getViewport({ scale: this.pageScale(slot.page) });
      slot.element.style.width = `${viewport.width}px`;
      slot.element.style.height = `${viewport.height}px`;
      const ratio = Math.min(this.deviceRatio * 2, Math.sqrt(24000000 / (viewport.width * viewport.height)));
      slot.canvas.width = Math.ceil(viewport.width * ratio);
      slot.canvas.height = Math.ceil(viewport.height * ratio);
      slot.canvas.style.width = `${viewport.width}px`;
      slot.canvas.style.height = `${viewport.height}px`;
      slot.element.style.setProperty('--scale-factor', String(viewport.scale));
      slot.element.style.setProperty('--total-scale-factor', String(viewport.scale));
      slot.element.style.setProperty('--user-unit', String(slot.page.userUnit));
      const context = slot.canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('PDF-Zeichenfläche ist nicht verfügbar.');
      slot.render = slot.page.render({
        canvas: slot.canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await slot.render.promise;
      if (generation !== slot.generation) return;
      slot.text.replaceChildren();
      slot.textLayer = new TextLayer({
        textContentSource: slot.page.streamTextContent(),
        container: slot.text,
        viewport,
      });
      await slot.textLayer.render();
      this.drawTarget(slot);
    } catch (error) {
      if (
        generation === slot.generation &&
        !(error instanceof Error && error.name === 'RenderingCancelledException')
      )
        this.onError(error instanceof Error ? error.message : String(error));
    }
  }
  private releasePage(slot: PageSlot) {
    slot.generation++;
    slot.render?.cancel();
    slot.textLayer?.cancel();
    slot.render = undefined;
    slot.textLayer = undefined;
    slot.canvas.width = 0;
    slot.canvas.height = 0;
    slot.text.replaceChildren();
  }
  private revealTarget = false;
  show(location: SyncLocation) {
    this.revealTarget = true;
    this.target = location;
    for (const slot of this.pages) slot.marker.hidden = true;
    const slot = this.pages.find((page) => page.number === location.page);
    if (!slot) return;
    slot.element.scrollIntoView({ block: 'center' });
    this.drawTarget(slot);
  }
  private drawTarget(slot: PageSlot) {
    if (
      this.target?.page !== slot.number ||
      !slot.page ||
      this.target.x === undefined ||
      this.target.y === undefined
    )
      return;
    const point = toScreenPoint(
      slot.page.getViewport({ scale: this.pageScale(slot.page) }),
      slot.page.view,
      this.target.x,
      this.target.y,
    );
    slot.marker.hidden = false;
    slot.marker.style.left = `${point.left}px`;
    slot.marker.style.top = `${point.top}px`;
    if (this.revealTarget) {
      this.revealTarget = false;
      slot.marker.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }
  private clear() {
    this.contextMenu.close();
    this.closeLens();
    for (const slot of this.pages) {
      this.observer.unobserve(slot.element);
      this.releasePage(slot);
    }
    this.pages = [];
    this.container.replaceChildren();
    if (this.loading) void this.loading.destroy();
    this.loading = undefined;
    this.document = undefined;
  }
  destroy() {
    this.contextMenu.destroy();
    this.generation++;
    clearTimeout(this.resizeTimer);
    this.observer.disconnect();
    this.resize.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('blur', this.closeLens);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerEnd);
    this.container.removeEventListener('pointercancel', this.onPointerEnd);
    this.container.removeEventListener('lostpointercapture', this.onPointerEnd);
    this.container.removeEventListener('scroll', this.closeLens);
    this.clear();
    this.lens.remove();
  }
}
