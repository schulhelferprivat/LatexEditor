import type { EditorView } from '@codemirror/view';
import { lineComment, lineUncomment } from '@codemirror/commands';

const wordPattern = /^\p{L}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*$/u;
const wordScan = /\p{L}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu;

export class EditorContextMenu {
  private menu = document.createElement('div');
  private previousFocus?: HTMLElement;
  constructor(
    private host: HTMLElement,
    private view: EditorView,
    private onFindInPdf: (line: number, column: number) => void,
    private canFindInPdf: () => boolean,
    private onError: (message: string) => void,
    private onAddToDictionary: (word: string) => void,
    private onIgnoreSpelling: (word: string) => void,
  ) {
    this.menu.className = 'editor-context-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Quelltext-Aktionen');
    this.menu.hidden = true;
    document.body.append(this.menu);
    host.addEventListener('contextmenu', this.open);
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
    event.preventDefault();
    this.close();
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const selection = this.view.state.selection.main;
    const text = this.view.state.sliceDoc(selection.from, selection.to);
    const word = text
      ? wordPattern.test(text)
        ? text
        : undefined
      : this.wordAt(this.view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? selection.head);
    const copy = document.createElement('button');
    copy.textContent = 'Kopieren';
    copy.disabled = !text;
    copy.onclick = () => {
      this.close();
      void (async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          this.onError(
            'Text konnte nicht in die Zwischenablage kopiert werden. Bitte die Browserberechtigung prüfen.',
          );
        }
      })();
    };
    const comment = document.createElement('button');
    comment.textContent = 'Auskommentieren';
    comment.disabled = !text;
    comment.onclick = () => {
      this.close();
      if (lineComment(this.view)) this.view.focus();
    };
    const uncomment = document.createElement('button');
    uncomment.textContent = 'Entkommentieren';
    uncomment.disabled = !text;
    uncomment.onclick = () => {
      this.close();
      if (lineUncomment(this.view)) this.view.focus();
    };
    const addToDictionary = document.createElement('button');
    addToDictionary.textContent = 'Zum Wörterbuch hinzufügen';
    addToDictionary.disabled = word === undefined;
    addToDictionary.onclick = () => {
      this.close();
      if (word) this.onAddToDictionary(word);
    };
    const ignoreSpelling = document.createElement('button');
    ignoreSpelling.textContent = 'Rechtschreibmeldung ignorieren';
    ignoreSpelling.disabled = word === undefined;
    ignoreSpelling.onclick = () => {
      this.close();
      if (word) this.onIgnoreSpelling(word);
    };
    const find = document.createElement('button');
    find.textContent = 'Im PDF finden';
    find.disabled = !this.canFindInPdf();
    find.onclick = () => {
      this.close();
      if (!this.canFindInPdf()) return;
      const line = this.view.state.doc.lineAt(selection.head);
      this.onFindInPdf(line.number, selection.head - line.from + 1);
    };
    const buttons = [copy, comment, uncomment, addToDictionary, ignoreSpelling, find];
    for (const button of buttons) button.setAttribute('role', 'menuitem');
    this.menu.append(...buttons);
    this.menu.hidden = false;
    const rect = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - rect.width))}px`;
    this.menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - rect.height))}px`;
    buttons.find((button) => !button.disabled)?.focus({ preventScroll: true });
  };
  private wordAt(position: number) {
    const line = this.view.state.doc.lineAt(position);
    const offset = position - line.from;
    wordScan.lastIndex = 0;
    for (const match of line.text.matchAll(wordScan)) {
      const start = match.index ?? 0;
      if (offset >= start && offset <= start + match[0].length) return match[0];
    }
    return undefined;
  }
  destroy() {
    this.close();
    this.menu.remove();
    this.host.removeEventListener('contextmenu', this.open);
    document.removeEventListener('pointerdown', this.outside);
    document.removeEventListener('keydown', this.keydown);
    window.removeEventListener('blur', this.close);
    window.removeEventListener('resize', this.close);
  }
}
