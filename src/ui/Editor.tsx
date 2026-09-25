import { useEffect, useRef } from 'react';
import { EditorAdapter } from '../editor/adapter';
import type { Document } from '../domain/app';
export function Editor({
  document,
  active,
  language,
  onReady,
  onChange,
  onCursor,
  onError,
  onSearch,
  onCloseSearch,
  onFindInPdf,
  canFindInPdf,
  jump,
}: {
  document: Document;
  active: boolean;
  language: 'de' | 'en';
  onReady: (id: string, adapter: EditorAdapter | null) => void;
  onChange: (id: string, text: string) => void;
  onCursor: (line: number, column: number) => void;
  onError: (message: string) => void;
  onSearch?: () => void;
  onCloseSearch?: () => void;
  onFindInPdf?: (line: number, column: number) => void;
  canFindInPdf?: () => boolean;
  jump?: { id: string; line: number; nonce: number };
}) {
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<EditorAdapter | null>(null);
  const findInPdf = useRef(onFindInPdf);
  const canFind = useRef(canFindInPdf);
  findInPdf.current = onFindInPdf;
  canFind.current = canFindInPdf;
  useEffect(() => {
    if (!host.current) return;
    const instance = new EditorAdapter(
      host.current,
      document.text,
      language,
      (text) => onChange(document.id, text),
      onCursor,
      onError,
      () => onSearch?.(),
      () => onCloseSearch?.(),
      (line, column) => findInPdf.current?.(line, column),
      () => canFind.current?.() ?? false,
    );
    adapter.current = instance;
    onReady(document.id, instance);
    return () => {
      onReady(document.id, null);
      instance.destroy();
    };
  }, [document.id]);
  useEffect(() => {
    adapter.current?.setText(document.text);
  }, [document.text]);
  useEffect(() => {
    adapter.current?.setLanguage(language);
  }, [language]);
  useEffect(() => {
    adapter.current?.setActive(active);
  }, [active]);
  useEffect(() => {
    if (jump?.id === document.id) adapter.current?.jump(jump.line);
  }, [jump?.nonce]);
  return <div ref={host} className="code-editor" hidden={!active} />;
}
