import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import type { EditorAdapter, SearchState } from '../editor/adapter';

const empty: SearchState = {
  search: '',
  replace: '',
  caseSensitive: false,
};

export function SearchBar({
  editor,
  nonce,
  onClose,
}: {
  editor: EditorAdapter | undefined;
  nonce: number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState<SearchState>(empty);
  const [matches, setMatches] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.select();
    field.current?.focus();
  }, [nonce]);
  useEffect(() => {
    editor?.openSearch();
    return () => editor?.closeSearch();
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    editor.setQuery(query);
    setMatches(editor.matchCount(query));
  }, [editor, query.search, query.caseSensitive, query.replace]);
  function update(patch: Partial<SearchState>) {
    setQuery((current) => ({ ...current, ...patch }));
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      editor?.focus();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) editor?.findPrevious();
      else editor?.findNext();
    }
  }
  return (
    <div className="search-bar" role="search" aria-label="Suchen und Ersetzen" onKeyDown={onKeyDown}>
      <div className="search-row">
        <input
          ref={field}
          className="search-field"
          type="text"
          placeholder="Suchen"
          aria-label="Suchen"
          value={query.search}
          onChange={(event) => update({ search: event.target.value })}
        />
        <span className="search-count">{query.search ? `${matches} Treffer` : ''}</span>
        <div className="search-toggles" role="group" aria-label="Suchoptionen">
          <button
            className={query.caseSensitive ? 'icon-button pressed' : 'icon-button'}
            aria-pressed={query.caseSensitive}
            title="Groß-/Kleinschreibung beachten"
            aria-label="Groß-/Kleinschreibung beachten"
            onClick={() => update({ caseSensitive: !query.caseSensitive })}
          >
            <CaseSensitive size={17} />
          </button>
        </div>
        <span className="toolbar-rule" />
        <button
          className="icon-button"
          title="Vorheriger Treffer · Shift + Enter"
          aria-label="Vorheriger Treffer"
          disabled={!matches}
          onClick={() => editor?.findPrevious()}
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="icon-button"
          title="Nächster Treffer · Enter"
          aria-label="Nächster Treffer"
          disabled={!matches}
          onClick={() => editor?.findNext()}
        >
          <ArrowDown size={16} />
        </button>
        <button
          className="icon-button search-close"
          title="Suche schließen · Esc"
          aria-label="Suche schließen"
          onClick={() => {
            onClose();
            editor?.focus();
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="search-row">
        <input
          className="search-field"
          type="text"
          placeholder="Ersetzen durch"
          aria-label="Ersetzen durch"
          value={query.replace}
          onChange={(event) => update({ replace: event.target.value })}
        />
        <button className="button subtle" disabled={!matches} onClick={() => editor?.replaceNext()}>
          Ersetzen
        </button>
        <button className="button subtle" disabled={!matches} onClick={() => editor?.replaceAll()}>
          Alle ersetzen
        </button>
      </div>
    </div>
  );
}
