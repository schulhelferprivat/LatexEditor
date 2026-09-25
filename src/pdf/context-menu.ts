export function wordContext(page: HTMLElement, x: number, y: number): string | undefined {
  const words: string[] = [];
  let selected = -1;
  const walker = document.createTreeWalker(page.querySelector('.textLayer') ?? page, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const match of (node.textContent ?? '').matchAll(/\S+/gu)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      if (
        [...range.getClientRects()].some(
          (rect) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
        )
      )
        selected = words.length;
      words.push(match[0]);
    }
  }
  return selected < 0 ? undefined : words.slice(Math.max(0, selected - 5), selected + 6).join(' ');
}

export class PdfContextMenu {
  private menu = document.createElement('div');
  private previousFocus?: HTMLElement;
  constructor(
    private host: HTMLElement,
    private onOpen: () => void,
    private onSync: (page: HTMLElement, x: number, y: number) => void,
    private canSync: () => boolean,
    private onError: (message: string) => void,
  ) {
    this.menu.className = 'pdf-context-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'PDF-Aktionen');
    this.menu.hidden = true;
    document.body.append(this.menu);
    host.addEventListener('contextmenu', this.open);
    host.addEventListener('scroll', this.close);
    document.addEventListener('pointerdown', this.outside);
    document.addEventListener('keydown', this.keydown);
    window.addEventListener('blur', this.close);
    window.addEventListener('resize', this.close);
  }
  close = () => {
    this.menu.hidden = true;
    this.menu.replaceChildren();
  };
  private outside = (event: PointerEvent) => {
    if (!this.menu.contains(event.target as Node)) this.close();
  };
  private keydown = (event: KeyboardEvent) => {
    if (this.menu.hidden) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      this.close();
      this.previousFocus?.focus({ preventScroll: true });
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...this.menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };
  private open = (event: MouseEvent) => {
    const page = (event.target as Element).closest<HTMLElement>('.pdf-page');
    if (!page || !this.host.contains(page)) return;
    event.preventDefault();
    this.onOpen();
    this.close();
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const text = wordContext(page, event.clientX, event.clientY);
    const copy = document.createElement('button');
    copy.textContent = 'Kopieren';
    copy.disabled = text === undefined;
    copy.onclick = () => {
      this.close();
      void (async () => {
        try {
          await navigator.clipboard.writeText(text!);
        } catch {
          this.onError(
            'Text konnte nicht in die Zwischenablage kopiert werden. Bitte die Browserberechtigung prüfen.',
          );
        }
      })();
    };
    const sync = document.createElement('button');
    sync.textContent = 'Im Quelltext finden';
    sync.disabled = !this.canSync();
    sync.onclick = () => {
      this.close();
      if (this.canSync()) this.onSync(page, event.clientX, event.clientY);
    };
    for (const button of [copy, sync]) button.setAttribute('role', 'menuitem');
    this.menu.append(copy, sync);
    this.menu.hidden = false;
    const rect = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - rect.width))}px`;
    this.menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - rect.height))}px`;
    (copy.disabled ? sync : copy).focus({ preventScroll: true });
  };
  destroy() {
    this.close();
    this.menu.remove();
    this.host.removeEventListener('contextmenu', this.open);
    this.host.removeEventListener('scroll', this.close);
    document.removeEventListener('pointerdown', this.outside);
    document.removeEventListener('keydown', this.keydown);
    window.removeEventListener('blur', this.close);
    window.removeEventListener('resize', this.close);
  }
}
