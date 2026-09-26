import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookPlus, EyeOff, X } from 'lucide-react';
import type { EditorAdapter, SpellingIssue } from '../editor/adapter';

export function nextIssueIndex(index: number, step: number, count: number) {
  if (count < 1) return 0;
  return (((index + step) % count) + count) % count;
}
export function clampIssueIndex(index: number, count: number) {
  if (count < 1) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}
export function SpellBar({
  editor,
  nonce,
  revision,
  onClose,
}: {
  editor: EditorAdapter | undefined;
  nonce: number;
  revision: number;
  onClose: () => void;
}) {
  const [issues, setIssues] = useState<SpellingIssue[]>([]);
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor) return;
    const read = () => setIssues(editor.spellIssues());
    read();
    const timer = setInterval(read, 700);
    return () => clearInterval(timer);
  }, [editor, revision]);
  useEffect(() => {
    container.current?.focus();
  }, [nonce]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (
        event.key === 'F3' ||
        (event.key === 'Enter' && container.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        go(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const safeIndex = clampIssueIndex(index, issues.length);
  const current = issues[safeIndex];
  useEffect(() => {
    if (index !== safeIndex) setIndex(safeIndex);
  }, [index, safeIndex]);
  useEffect(() => {
    if (current) editor?.revealSpellIssue(current);
    else editor?.clearSpellFocus();
  }, [editor, current?.from, current?.to]);
  const position = useMemo(
    () => (issues.length ? `${safeIndex + 1} von ${issues.length}` : 'Keine Funde'),
    [safeIndex, issues.length],
  );
  function go(step: number) {
    if (!issues.length) return;
    setIndex(nextIssueIndex(safeIndex, step, issues.length));
  }
  function replace(suggestion: string) {
    if (!current || !editor) return;
    editor.replaceSpellIssue(current, suggestion);
    setIssues(editor.spellIssues());
  }
  function accept(permanent: boolean) {
    if (!current || !editor) return;
    editor.acceptSpelling(current.word, permanent);
    setIssues(editor.spellIssues());
  }
  function close() {
    editor?.clearSpellFocus();
    onClose();
    editor?.focus();
  }
  return (
    <div ref={container} className="spell-bar" role="group" aria-label="Rechtschreibprüfung" tabIndex={-1}>
      <span className="spell-count">{position}</span>
      <span className="spell-word" title={current?.context}>
        {current ? `„${current.word}“ · Zeile ${current.line}` : 'Der Text ist fehlerfrei.'}
      </span>
      <div className="spell-suggestions">
        {current?.suggestions.length
          ? current.suggestions.slice(0, 4).map((suggestion) => (
              <button
                key={suggestion}
                className="spell-suggestion"
                title={`Durch „${suggestion}“ ersetzen`}
                onClick={() => replace(suggestion)}
              >
                {suggestion}
              </button>
            ))
          : current && <span className="spell-empty">Kein Vorschlag</span>}
      </div>
      <span className="toolbar-rule" />
      <button
        className="icon-button"
        title="Wort einmalig übergehen"
        aria-label="Wort einmalig übergehen"
        disabled={!current}
        onClick={() => accept(false)}
      >
        <EyeOff size={16} />
      </button>
      <button
        className="icon-button"
        title="Wort ins Wörterbuch aufnehmen"
        aria-label="Wort ins Wörterbuch aufnehmen"
        disabled={!current}
        onClick={() => accept(true)}
      >
        <BookPlus size={16} />
      </button>
      <span className="toolbar-rule" />
      <button
        className="icon-button"
        title="Vorheriger Fund · Shift + F3"
        aria-label="Vorheriger Fund"
        disabled={issues.length < 2}
        onClick={() => go(-1)}
      >
        <ArrowUp size={16} />
      </button>
      <button
        className="icon-button"
        title="Nächster Fund · F3"
        aria-label="Nächster Fund"
        disabled={!issues.length}
        onClick={() => go(1)}
      >
        <ArrowDown size={16} />
      </button>
      <button
        className="icon-button spell-close"
        title="Rechtschreibprüfung schließen · Esc"
        aria-label="Rechtschreibprüfung schließen"
        onClick={close}
      >
        <X size={16} />
      </button>
    </div>
  );
}
