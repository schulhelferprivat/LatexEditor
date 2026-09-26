import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import {
  Bookmark,
  Bold,
  Check,
  Divide,
  FilePlus2,
  FileText,
  FolderOpen,
  Image,
  Italic,
  Link,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  Redo2,
  ShieldCheck,
  Square,
  Sigma,
  Undo2,
  Underline,
  X,
  AlertCircle,
  CheckCircle2,
  Copy,
  PlugZap,
  SpellCheck2,
} from 'lucide-react';
import { app, dirty } from '../domain/app';
import { bridgeUnreachable } from '../infra/bridge';
import {
  currentDownload,
  macArmDownload,
  macIntelDownload,
  releasesPage,
  windowsDownload,
} from '../infra/download';
import type { Engine } from '../domain/types';
import type { EditorAdapter } from '../editor/adapter';
import { Editor } from './Editor';
import { Pdf } from './Pdf';
import { Dialog } from './Dialog';
import { Preamble } from './Preamble';
import { SearchBar } from './SearchBar';
import { SpellBar } from './SpellBar';
import { SnippetToolbar } from './SnippetToolbar';
const download = currentDownload();
const snippetIcons: Record<string, ComponentType<{ size?: number }>> = {
  Bold,
  Italic,
  Underline,
  List,
  Pencil,
  AlphabeticalTasks,
  Sigma,
  Square,
  Divide,
  FileText,
  Link,
  Bookmark,
  BlockMath,
  Checkmark,
  CoordinateSystem,
  Equivalence,
  Interval,
  InlineMath,
  Lines,
  NumberedList,
  NotebookPresentation,
  Point,
  SingleChoice,
  SquareX,
  SnippetCards,
  StruckFile,
  TableGrid,
  Image,
};
function AlphabeticalTasks({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <text x="0.5" y="4.5" fill="currentColor" fontSize="4.8" fontWeight="700">
        a)
      </text>
      <text x="0.5" y="9.75" fill="currentColor" fontSize="4.8" fontWeight="700">
        b)
      </text>
      <text x="0.5" y="15" fill="currentColor" fontSize="4.8" fontWeight="700">
        c)
      </text>
      <path
        d="M6.5 3h8M6.5 8.2h8M6.5 13.4h8"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
function NumberedList({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <text x="0.5" y="4.5" fill="currentColor" fontSize="4.8" fontWeight="700">
        1.
      </text>
      <text x="0.5" y="9.75" fill="currentColor" fontSize="4.8" fontWeight="700">
        2.
      </text>
      <text x="0.5" y="15" fill="currentColor" fontSize="4.8" fontWeight="700">
        3.
      </text>
      <path
        d="M6.5 3h8M6.5 8.2h8M6.5 13.4h8"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
function NotebookPresentation({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.1 1.9h8.1c.6 0 1 .4 1 1v10.2c0 .6-.4 1-1 1H5.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5.1 1.9v12.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M2.6 3.7h2.5M2.6 6.6h2.5M2.6 9.4h2.5M2.6 12.3h2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M7.6 5.6h4.2M7.6 8h4.2M7.6 10.4h2.7"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CoordinateSystem({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 1.375} height={size} viewBox="0 0 22 16" fill="none" aria-hidden="true">
      <path
        d="M0.5 9h13.5M6.5 15.5V1.5M14 9l-2-2M14 9l-2 2M6.5 1.5l-2 2M6.5 1.5l2 2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="16.3" y="11.8" fill="currentColor" fontFamily="monospace" fontSize="6.5" fontStyle="italic">
        x
      </text>
      <text x="8.6" y="6.8" fill="currentColor" fontFamily="monospace" fontSize="6.5" fontStyle="italic">
        y
      </text>
    </svg>
  );
}
function InlineMath({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 32 16" aria-hidden="true">
      <text
        x="0.5"
        y="11.8"
        fill="currentColor"
        fontFamily="monospace"
        fontSize="10.5"
        fontWeight="600"
        textAnchor="start"
      >
        {'\\( \\)'}
      </text>
    </svg>
  );
}
function BlockMath({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 32 16" aria-hidden="true">
      <text
        x="0.5"
        y="11.8"
        fill="currentColor"
        fontFamily="monospace"
        fontSize="10.5"
        fontWeight="600"
        textAnchor="start"
      >
        {'\\[ \\]'}
      </text>
    </svg>
  );
}
function Interval({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 32 16" aria-hidden="true">
      <text
        x="0.5"
        y="12"
        fill="currentColor"
        fontFamily="monospace"
        fontSize="10.5"
        fontWeight="600"
        textAnchor="start"
      >
        [a;b]
      </text>
    </svg>
  );
}
function Equivalence({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <text x="0.5" y="11.5" fill="currentColor" fontSize="11" fontWeight="600" textAnchor="start">
        {'\u21d4'}
      </text>
    </svg>
  );
}
function Checkmark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m2.6 8.6 3.5 3.6 7.3-8.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Lines({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
function SnippetCards({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.3" y="3.6" width="8.6" height="10.1" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.9 2.3h8.5c.7 0 1.3.6 1.3 1.3v8.1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M3.7 7.1h3.8M3.7 10.2h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
function Point({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 32 16" aria-hidden="true">
      <text
        x="0.5"
        y="12"
        fill="currentColor"
        fontFamily="monospace"
        fontSize="10.5"
        fontWeight="600"
        textAnchor="start"
      >
        (x,y)
      </text>
    </svg>
  );
}
function TableGrid({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="13" height="12" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1.5 6h13M1.5 10h13M5.85 2v12M10.15 2v12" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 2.5h3.35v3H2z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
function StruckFile({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="m2 14 12-12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function SquareX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="m5 5 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function SingleChoice({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 2.25} height={size} viewBox="0 0 36 16" fill="none" aria-hidden="true">
      <rect x="0.65" y="0.65" width="14.7" height="14.7" stroke="currentColor" strokeWidth="1.3" />
      <rect x="20.65" y="0.65" width="14.7" height="14.7" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="m4.9 4.6 1.4 6.8 1.7-5 1.7 5 1.4-6.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25.9 11.4V4.6h4.6M25.9 7.9h3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function App() {
  const state = useSyncExternalStore(app.subscribe, app.snapshot);
  const active = state.documents.find((document) => document.id === state.active);
  const [preamble, setPreamble] = useState(false);
  const [setup, setSetup] = useState(false);
  const [texDir, setTexDir] = useState('');
  const [gnuplotDir, setGnuplotDir] = useState('');
  const [log, setLog] = useState(false);
  const [buildMode, setBuildMode] = useState<'draft' | 'final'>('draft');
  const [search, setSearch] = useState({ open: false, nonce: 0 });
  const [spell, setSpell] = useState({ open: false, nonce: 0 });
  const [copiedDiagnostic, setCopiedDiagnostic] = useState<number | null>(null);
  const [split, setSplit] = useState(() =>
    Math.max(30, Math.min(70, Number(localStorage.getItem('split')) || 50)),
  );
  const editors = useRef(new Map<string, EditorAdapter>());
  const splitHost = useRef<HTMLDivElement>(null);
  const blocked = state.busy || state.saving;
  const finalAvailable = !!active && state.preamble.enabled;
  const selectedBuildMode = finalAvailable ? buildMode : 'draft';
  const stale = !!active?.pdf && (!active.preview || active.preview.revision !== active.revision);
  useEffect(() => {
    if (!finalAvailable) setBuildMode('draft');
  }, [finalAvailable]);
  useEffect(() => {
    void app.init();
    const heartbeat = setInterval(() => {
      void app.connectBridge();
    }, 60000);
    const unload = () => app.dispose();
    window.addEventListener('pagehide', unload);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', unload);
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!preamble && !state.panel && !state.question) void app.run(() => app.save());
      }
      if (event.key === 'F7' && !preamble && !state.panel && !state.question) {
        event.preventDefault();
        openSpell();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preamble, state.panel, state.question]);
  useEffect(() => {
    const onClose = (event: BeforeUnloadEvent) => {
      if (app.state.documents.some(dirty) || app.state.busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onClose);
    return () => window.removeEventListener('beforeunload', onClose);
  }, []);
  function editor() {
    return editors.current.get(state.active);
  }
  function openSpell() {
    setSpell((current) => ({ open: true, nonce: current.nonce + 1 }));
  }
  function openSearch() {
    setSearch((current) => ({ open: true, nonce: current.nonce + 1 }));
  }
  function changeSplit(value: number) {
    const next = Math.max(30, Math.min(70, value));
    setSplit(next);
    localStorage.setItem('split', String(next));
  }
  function refresh() {
    void app.run(async () => {
      app.state.capabilities = await app.bridge.refreshCapabilities();
      app.emit();
    });
  }
  function applyGnuplotDir() {
    void app.run(async () => {
      app.state.capabilities = await app.bridge.setGnuplotDir(gnuplotDir.trim() || null);
      app.emit();
    });
  }
  function applyTexDir() {
    void app.run(async () => {
      app.state.capabilities = await app.bridge.setTexDir(texDir.trim() || null);
      app.emit();
    });
  }
  async function copyDiagnostic(index: number, message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedDiagnostic(index);
      window.setTimeout(() => setCopiedDiagnostic((current) => (current === index ? null : current)), 1500);
    } catch {
      app.notify('Die Meldung konnte nicht in die Zwischenablage kopiert werden.');
    }
  }
  return (
    <div className="application">
      <div className="document-bar">
        <div className="document-bar-start">
          <span className="app-title">
            LatexHelper
            <span className="app-version">
              (v{__APP_VERSION__} · {__APP_BUILD__})
            </span>
          </span>
          <div className="file-actions">
            <button
              className="icon-button"
              disabled={blocked}
              onClick={() => void app.run(() => app.open())}
              aria-label="Öffnen"
              title="Öffnen"
            >
              <span aria-hidden="true">📂</span>
            </button>
            <button
              className="icon-button"
              disabled={!active || blocked}
              onClick={() => void app.run(() => app.save())}
              aria-label="Speichern"
              title="Speichern · Ctrl / ⌘ + S"
            >
              <span aria-hidden="true">💾</span>
            </button>
            <button
              className="icon-button"
              onClick={() => {
                setTexDir(state.capabilities?.texDir ?? '');
                setGnuplotDir(state.capabilities?.gnuplotDir ?? '');
                setSetup(true);
              }}
              aria-label="Einstellungen"
              title="Einstellungen"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
          </div>
          <div className="tabs" role="tablist" aria-label="Dokumente">
            {state.documents.map((document) => (
              <div
                key={document.id}
                className={state.active === document.id ? 'document-tab active' : 'document-tab'}
              >
                <button
                  role="tab"
                  aria-selected={state.active === document.id}
                  onClick={() => app.activate(document.id)}
                >
                  <FileText size={14} />
                  <span>{document.name}</span>
                  {dirty(document) && <i className="dirty-dot" title="Ungespeichert" />}
                </button>
                <button
                  className="close-tab"
                  aria-label={`${document.name} schließen`}
                  title="Tab schließen"
                  disabled={blocked}
                  onClick={() => void app.run(() => app.close(document.id))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              className="icon-button new-tab"
              title="Neues Dokument"
              aria-label="Neues Dokument"
              onClick={() => app.newDocument()}
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
        <div className="build-controls tab-build-controls">
          <label className="solution-control">
            <input
              type="checkbox"
              checked={state.solution}
              disabled={!state.preamble.enabled || blocked}
              onChange={(event) => app.setSolution(event.target.checked)}
            />
            Lösung
          </label>
          <div className="build-mode" role="radiogroup" aria-label="Kompiliermodus">
            <label>
              <input
                type="radio"
                name="build-mode"
                value="draft"
                checked={selectedBuildMode === 'draft'}
                disabled={blocked}
                onChange={() => setBuildMode('draft')}
              />
              <span>Entwurf</span>
            </label>
            <label>
              <input
                type="radio"
                name="build-mode"
                value="final"
                checked={selectedBuildMode === 'final'}
                disabled={blocked || !finalAvailable}
                onChange={() => setBuildMode('final')}
              />
              <span>Endversion</span>
            </label>
          </div>
          {state.busy ? (
            <button
              className="header-action build-button build-progress"
              title="Abbrechen"
              aria-label="Abbrechen"
              onClick={() => void app.run(() => app.cancel())}
            >
              <LoaderCircle size={30} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="header-action build-button"
              disabled={!active || blocked || state.bridgeOffline}
              title={state.bridgeOffline ? bridgeUnreachable : 'Kompilieren'}
              aria-label="Kompilieren"
              onClick={() => void app.run(() => app.build(selectedBuildMode))}
            >
              <span aria-hidden="true">▶️</span>
            </button>
          )}
        </div>
      </div>
      {state.bridgeOffline && (
        <div className="bridge-offline" role="status">
          <PlugZap size={16} />
          <span>{bridgeUnreachable}</span>
          <button className="text-button" onClick={() => void app.connectBridge()}>
            Erneut verbinden
          </button>
          <a
            className="text-button"
            href={download?.url ?? releasesPage}
            target="_blank"
            rel="noopener noreferrer"
          >
            Bridge herunterladen
          </a>
        </div>
      )}
      {state.error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={16} />
          <span>{state.error}</span>
          <button
            className="icon-button"
            title="Meldung schließen"
            aria-label="Meldung schließen"
            onClick={() => {
              app.state.error = '';
              app.emit();
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <main
        className="workspace"
        ref={splitHost}
        style={{ gridTemplateColumns: `minmax(0, ${split}fr) 6px minmax(0, ${100 - split}fr)` }}
      >
        <section className="editor-pane">
          <div className="pane-toolbar">
            <div className="editor-actions">
              <button
                className="icon-button"
                title="Rückgängig"
                aria-label="Rückgängig"
                disabled={!active}
                onClick={() => editor()?.undo()}
              >
                <Undo2 size={15} />
              </button>
              <button
                className="icon-button"
                title="Wiederholen"
                aria-label="Wiederholen"
                disabled={!active}
                onClick={() => editor()?.redo()}
              >
                <Redo2 size={15} />
              </button>
              <span className="toolbar-rule" />
              <button
                className="icon-button"
                title="Präambel"
                aria-label="Präambel"
                disabled={blocked}
                onClick={() => setPreamble(true)}
              >
                <span aria-hidden="true">📦</span>
              </button>
              <button
                className="icon-button diagnostics-action"
                title="Fehler & Protokoll"
                aria-label="Fehler & Protokoll"
                aria-haspopup="dialog"
                onClick={() => {
                  app.state.panel = true;
                  app.emit();
                }}
              >
                <span aria-hidden="true">🐛</span>
                {state.diagnostics.length > 0 && (
                  <span className="count-pill">{state.diagnostics.length}</span>
                )}
              </button>
              <span className="toolbar-rule" />
              <button
                className={search.open ? 'icon-button pressed' : 'icon-button'}
                title="Suchen und Ersetzen · Strg / ⌘ + F"
                aria-label="Suchen und Ersetzen"
                aria-pressed={search.open}
                disabled={!active}
                onClick={() => openSearch()}
              >
                <span aria-hidden="true">🔍</span>
              </button>
              <button
                className={spell.open ? 'icon-button pressed' : 'icon-button'}
                title="Rechtschreibfehler durchgehen · F7"
                aria-label="Rechtschreibfehler durchgehen"
                aria-pressed={spell.open}
                disabled={!active}
                onClick={() => openSpell()}
              >
                <SpellCheck2 size={17} aria-hidden="true" />
              </button>
              <span className="toolbar-rule" />
              <SnippetToolbar
                active={!!active}
                documentId={active?.id ?? null}
                icons={snippetIcons}
                onInsert={(snippet) => editor()?.snippet(snippet)}
              />
            </div>
          </div>
          {search.open && active && (
            <SearchBar
              editor={editor()}
              nonce={search.nonce}
              onClose={() => setSearch({ open: false, nonce: 0 })}
            />
          )}
          {spell.open && active && (
            <SpellBar
              editor={editor()}
              nonce={spell.nonce}
              revision={active.revision}
              onClose={() => setSpell({ open: false, nonce: 0 })}
            />
          )}
          <div className="editors">
            {state.documents.map((document) => (
              <Editor
                key={document.id}
                document={document}
                active={state.active === document.id}
                language={state.language}
                jump={state.jump}
                onReady={(id, instance) =>
                  instance ? editors.current.set(id, instance) : editors.current.delete(id)
                }
                onChange={(id, text) => app.edit(id, text)}
                onCursor={() => undefined}
                onError={(message) => app.notify(message)}
                onSearch={openSearch}
                onCloseSearch={() => setSearch({ open: false, nonce: 0 })}
                onFindInPdf={(line, column) => void app.run(() => app.sync({ line, column }))}
                canFindInPdf={() => document.id === state.active && !!active?.preview && !stale}
              />
            ))}
            {!active && (
              <div className="welcome">
                <div className="welcome-actions">
                  <button className="button primary" onClick={() => void app.run(() => app.open())}>
                    <FolderOpen size={16} /> Dokument öffnen
                  </button>
                  <button className="button" onClick={() => app.newDocument()}>
                    <FilePlus2 size={16} /> Neu beginnen
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        <div
          className="splitter"
          role="separator"
          aria-label="Editorbreite"
          aria-orientation="vertical"
          tabIndex={0}
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={Math.round(split)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              changeSplit(split + (event.key === 'ArrowLeft' ? -2 : 2));
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || !splitHost.current) return;
            const rect = splitHost.current.getBoundingClientRect();
            changeSplit(((event.clientX - rect.left) / rect.width) * 100);
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          onDoubleClick={() => changeSplit(50)}
        >
          <span />
        </div>
        <Pdf
          key={active?.id ?? 'empty'}
          url={active?.pdf}
          stale={stale}
          target={state.pdfTarget}
          onSync={(location) => void app.run(() => app.sync(location))}
          onError={(message) => app.notify(message)}
        />
      </main>
      {state.panel && (
        <Dialog
          title="Fehler & Protokoll"
          wide
          onCancel={() => {
            app.state.panel = false;
            app.emit();
          }}
        >
          <div className="log-content">
            <div className="log-tabs">
              <button aria-pressed={!log} onClick={() => setLog(false)}>
                Meldungen
              </button>
              <button aria-pressed={log} onClick={() => setLog(true)}>
                Build-Log
              </button>
            </div>
            {log ? (
              <pre>{state.log || 'Noch kein Build ausgeführt.'}</pre>
            ) : (
              <div className="diagnostics">
                {state.diagnostics.map((diagnostic, index) => {
                  const document = state.documents.find((item) => item.id === state.resultDocument);
                  const canJump = !!document && !!diagnostic.line && diagnostic.file === document.name;
                  const location = `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}`;
                  const copyText = `${diagnostic.severity === 'error' ? 'Fehler' : 'Warnung'}: ${diagnostic.message}\n${location}`;
                  const content = (
                    <>
                      <AlertCircle size={14} />
                      <span>{diagnostic.message}</span>
                      <code>{location}</code>
                    </>
                  );
                  return (
                    <div key={index} className={`diagnostic ${diagnostic.severity}`}>
                      {canJump ? (
                        <button
                          className="diagnostic-main diagnostic-jump"
                          title={`Zu Zeile ${diagnostic.line} springen`}
                          onClick={() => {
                            app.state.panel = false;
                            app.jump(diagnostic, document.id);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="diagnostic-main">{content}</div>
                      )}
                      <button
                        className="diagnostic-copy"
                        title="Meldung kopieren"
                        aria-label="Meldung kopieren"
                        onClick={() => void copyDiagnostic(index, copyText)}
                      >
                        {copiedDiagnostic === index ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    </div>
                  );
                })}
                {!state.diagnostics.length && (
                  <p className="muted">
                    <CheckCircle2 size={15} /> Keine Meldungen.
                  </p>
                )}
              </div>
            )}
          </div>
        </Dialog>
      )}
      {preamble && (
        <Preamble
          settings={state.preamble}
          onCancel={() => setPreamble(false)}
          onApply={(config) => {
            app.setPreamble(config);
            setPreamble(false);
          }}
        />
      )}
      {state.question && (
        <Dialog
          title={state.question.title}
          onCancel={() => app.respond(Math.max(0, state.question!.options.indexOf('Abbrechen')))}
        >
          <p className="question-message">{state.question.message}</p>
          <div className="dialog-footer">
            {state.question.options.map((option, index) => (
              <button
                key={option}
                className={index === 0 ? 'button primary' : 'button'}
                onClick={() => app.respond(index)}
              >
                {option}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {setup && (
        <Dialog title="Einstellungen" onCancel={() => setSetup(false)}>
          <h3>Bridge-Verwaltung</h3>
          <p className="dialog-intro">
            LatexHelper verwendet deine lokale TeX-Installation. Auch ohne Internetverbindung.
          </p>
          <ol className="setup-list">
            <li>
              <span>01</span>
              <div>
                <strong>Bridge installieren</strong>
                <p>
                  Das LatexHelper-Paket für Windows oder macOS installieren. Die Bridge startet bei der
                  Anmeldung.
                </p>
                <p className="setup-downloads">
                  {[windowsDownload, macArmDownload, macIntelDownload].map((option) => (
                    <a
                      key={option.url}
                      href={option.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-current={download?.url === option.url ? 'true' : undefined}
                    >
                      {option.label}
                    </a>
                  ))}
                  <a href={releasesPage} target="_blank" rel="noopener noreferrer">
                    Alle Versionen
                  </a>
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>TeX bereitstellen</strong>
                <p>
                  MiKTeX oder TeX Live unter Windows, MacTeX unter macOS installieren. LuaLaTeX ist die
                  Standard-Engine. Liegt die Installation an einem eigenen Ort, dessen bin-Verzeichnis in
                  LATEXHELPER_TEX_DIR eintragen.
                </p>
              </div>
            </li>
          </ol>
          <div className="setup-detected">
            <ShieldCheck size={17} />
            {state.capabilities
              ? `Erkannt: ${state.capabilities.engines.join(', ') || 'keine TeX-Engine'}`
              : 'Bridge derzeit nicht erreichbar'}
          </div>
          <div className="setup-spell">
            <label htmlFor="spell-language">Sprache der Rechtschreibprüfung</label>
            <select
              id="spell-language"
              className="engine-select"
              value={state.language}
              onChange={(event) => app.language(event.target.value as 'de' | 'en')}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="setup-engine">
            <label htmlFor="engine">PDF-Builder</label>
            <select
              id="engine"
              className="engine-select"
              value={active?.config.engine ?? 'lualatex'}
              disabled={!active || blocked}
              onChange={(event) =>
                active && app.configure({ ...active.config, engine: event.target.value as Engine })
              }
            >
              <option value="lualatex">LuaLaTeX</option>
              <option
                value="pdflatex"
                disabled={!!state.capabilities && !state.capabilities.engines.includes('pdflatex')}
              >
                pdfLaTeX
              </option>
              <option
                value="xelatex"
                disabled={!!state.capabilities && !state.capabilities.engines.includes('xelatex')}
              >
                XeLaTeX
              </option>
            </select>
          </div>
          <div className="setup-shell-escape">
            <label>
              <input
                type="checkbox"
                checked={active?.config.shellEscape ?? false}
                disabled={!active || blocked}
                onChange={(event) =>
                  active && app.configure({ ...active.config, shellEscape: event.target.checked })
                }
              />
              Shell Escape für dieses Dokument aktivieren
            </label>
            <p>
              Für \tkzFct wird Gnuplot benötigt.{' '}
              {state.capabilities
                ? state.capabilities.tools.includes('gnuplot')
                  ? 'Gnuplot erkannt.'
                  : 'Gnuplot derzeit nicht erkannt.'
                : 'Gnuplot-Status unbekannt: Bridge nicht erreichbar.'}{' '}
              LaTeX-Code kann dann Programme mit deinen Benutzerrechten starten. Nur für vertrauenswürdige
              Dokumente aktivieren.
            </p>
          </div>
          <div className="setup-texdir">
            <label htmlFor="texdir">Installationspfad</label>
            <p>
              Leer lassen für die automatische Suche. Sonst das bin-Verzeichnis der TeX-Installation angeben,
              etwa C:\Users\Name\AppData\Local\Programs\MiKTeX\miktex\bin\x64.
            </p>
            <div className="setup-texdir-row">
              <input
                id="texdir"
                type="text"
                value={texDir}
                placeholder={state.capabilities?.texDir ?? 'Automatisch suchen'}
                onChange={(event) => setTexDir(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyTexDir();
                }}
              />
              <button className="button" onClick={applyTexDir}>
                Übernehmen
              </button>
            </div>
          </div>
          <div className="setup-texdir">
            <label htmlFor="gnuplotdir">Gnuplot-Installationspfad</label>
            <p>
              Leer lassen für die automatische Suche. Zum Beispiel C:\Program Files\gnuplot oder dessen
              bin-Verzeichnis.
            </p>
            <div className="setup-texdir-row">
              <input
                id="gnuplotdir"
                type="text"
                value={gnuplotDir}
                placeholder="Automatisch suchen"
                onChange={(event) => setGnuplotDir(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyGnuplotDir();
                }}
              />
              <button className="button" onClick={applyGnuplotDir} aria-label="Gnuplot-Pfad übernehmen">
                Übernehmen
              </button>
            </div>
            {state.capabilities?.gnuplotPath && <p>Erkannt: {state.capabilities.gnuplotPath}</p>}
            <p>
              Der Pfad gilt bis zum Neustart der Bridge. Für einen dauerhaften Startwert
              LATEXHELPER_GNUPLOT_DIR setzen.
            </p>
          </div>
          <div className="dialog-footer">
            <a
              className="text-button"
              href={`${import.meta.env.BASE_URL}licenses/index.html`}
              target="_blank"
              rel="noreferrer"
            >
              Lizenzen
            </a>
            <button className="button" onClick={refresh}>
              Erneut prüfen
            </button>
            <button className="button primary" onClick={() => setSetup(false)}>
              <Check size={15} /> Fertig
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
