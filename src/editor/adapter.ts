import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  RangeSet,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  Decoration,
  GutterMarker,
  drawSelection,
  gutterLineClass,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import {
  StreamLanguage,
  bracketMatching,
  foldKeymap,
  foldService,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle,
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
} from '@codemirror/autocomplete';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  highlightSelectionMatches,
  replaceAll,
  replaceNext,
  openSearchPanel,
  search,
  setSearchQuery,
} from '@codemirror/search';
import { setDiagnostics, type Diagnostic as EditorDiagnostic } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { completeEnvironment, environmentAt, environments } from './latex';
import { environmentFoldRangeAtLine, environmentFoldRanges, type EnvironmentFoldRange } from './folding';
import { FoldTransitions, foldGapNumbers, foldGapWidgets, visualFoldGutter } from './fold-ui';
import { insertMenuSnippet, insertSnippet, snippets, type Snippet } from './snippets';
import { EditorContextMenu } from './context-menu';
import type { SpellResponse, SpellRequest } from '../spell/worker';

const customDictionaryKey = 'custom-dictionary';
function loadCustomDictionary() {
  try {
    const words = JSON.parse(localStorage.getItem(customDictionaryKey) ?? '[]');
    return Array.isArray(words) ? words.filter((word): word is string => typeof word === 'string') : [];
  } catch {
    return [];
  }
}
function normalizeWord(word: string) {
  return word.normalize('NFC').toLocaleLowerCase();
}
function saveCustomDictionary(words: string[]) {
  localStorage.setItem(customDictionaryKey, JSON.stringify(words));
}

const stopEffect = StateEffect.define<{ from: number; to: number }[]>();
const environmentFolds = StateField.define<EnvironmentFoldRange[]>({
  create: (state) => environmentFoldRanges(state.doc.toString()),
  update: (value, transaction) =>
    transaction.docChanged ? environmentFoldRanges(transaction.state.doc.toString()) : value,
});
const environmentFoldService = foldService.of((state, lineStart, lineEnd) =>
  environmentFoldRangeAtLine(state.field(environmentFolds), lineStart, lineEnd),
);
const stops = StateField.define<{ from: number; to: number }[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(stopEffect)) return effect.value;
    if (transaction.docChanged)
      value = value.map((range) => ({
        from: transaction.changes.mapPos(range.from, -1),
        to: transaction.changes.mapPos(range.to, 1),
      }));
    return value;
  },
});
const jumpHighlightEffect = StateEffect.define<number | null>();
class JumpGutterMarker extends GutterMarker {
  elementClass = 'cm-jump-highlight-gutter';
  eq(other: GutterMarker) {
    return other instanceof JumpGutterMarker;
  }
}
const jumpGutterMarker = new JumpGutterMarker();
const jumpLine = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(jumpHighlightEffect)) return effect.value;
    if (value === null) return null;
    return transaction.changes.mapPos(value, -1);
  },
});
const jumpHighlight = [
  jumpLine,
  EditorView.decorations.compute([jumpLine], (state) => {
    const position = state.field(jumpLine);
    return position === null
      ? Decoration.none
      : Decoration.set([Decoration.line({ attributes: { class: 'cm-jump-highlight' } }).range(position)]);
  }),
  gutterLineClass.compute([jumpLine], (state) => {
    const position = state.field(jumpLine);
    return position === null ? RangeSet.empty : RangeSet.of([jumpGutterMarker.range(position)]);
  }),
];
function nextStop(view: EditorView, direction: number) {
  const ranges = view.state.field(stops);
  if (!ranges.length) return false;
  const selection = view.state.selection.main;
  const current = ranges.findIndex((range) => selection.from >= range.from && selection.to <= range.to);
  const index = current + direction;
  if (current < 0 || index < 0 || index >= ranges.length) {
    view.dispatch({ effects: stopEffect.of([]) });
    return false;
  }
  const range = ranges[index];
  view.dispatch({
    selection: EditorSelection.range(range.from, range.to),
    effects: index === ranges.length - 1 ? stopEffect.of([]) : [],
  });
  return true;
}
const commands = [
  ['documentclass', 'Dokumentklasse'],
  ['usepackage', 'Paket laden'],
  ['begin', 'Umgebung beginnen'],
  ['end', 'Umgebung beenden'],
  ['section', 'Abschnitt'],
  ['subsection', 'Unterabschnitt'],
  ['textbf', 'Fett'],
  ['textit', 'Kursiv'],
  ['emph', 'Hervorheben'],
  ['title', 'Titel'],
  ['author', 'Autor'],
  ['maketitle', 'Titel setzen'],
  ['label', 'Marke'],
  ['ref', 'Referenz'],
  ['eqref', 'Gleichungsreferenz'],
  ['cite', 'Literaturverweis'],
  ['footnote', 'Fußnote'],
  ['includegraphics', 'Abbildung'],
  ['caption', 'Bildunterschrift'],
  ['frac', 'Bruch'],
  ['sqrt', 'Wurzel'],
  ['sum', 'Summe'],
  ['int', 'Integral'],
  ['alpha', 'α'],
  ['beta', 'β'],
  ['gamma', 'γ'],
  ['lambda', 'λ'],
  ['pi', 'π'],
  ['item', 'Listeneintrag'],
  ['tableofcontents', 'Inhaltsverzeichnis'],
  ['newcommand', 'Makro definieren'],
  ['href', 'Link'],
];
function completions(context: CompletionContext) {
  const prefix = context.state.doc.sliceString(0, context.pos);
  const env = /\\(begin|end)\{([A-Za-z*]*)$/.exec(prefix);
  if (env) {
    const names =
      env[1] === 'end'
        ? [environmentAt(prefix.slice(0, env.index), env.index), ...environments].filter(
            (name): name is string => !!name,
          )
        : environments;
    return {
      from: context.pos - env[2].length,
      options: [...new Set(names)].map((name) => ({
        label: name,
        type: 'type',
        apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
          const source = view.state.doc.toString();
          const prefix = source.slice(0, from) + name;
          const edit =
            env[1] === 'begin'
              ? completeEnvironment(prefix + source.slice(to), prefix.length, prefix.length)
              : undefined;
          if (edit)
            view.dispatch({
              changes: { from, to: to + (source[to] === '}' ? 1 : 0), insert: name + edit.insert },
              selection: { anchor: edit.anchor },
              userEvent: 'input.complete',
            });
          else
            view.dispatch({
              changes: { from, to, insert: name + (source[to] === '}' ? '' : '}') },
              selection: { anchor: from + name.length + (source[to] === '}' ? 0 : 1) },
              userEvent: 'input.complete',
            });
        },
      })),
    };
  }
  const reference = /\\(?:ref|eqref|pageref)\{([^}]*)$/.exec(prefix);
  if (reference) {
    const labels = [...context.state.doc.toString().matchAll(/\\label\{([^}]+)\}/g)].map((match) => match[1]);
    return {
      from: context.pos - reference[1].length,
      options: [...new Set(labels)].map((label) => ({ label, type: 'constant' })),
    };
  }
  const word = context.matchBefore(/\\[A-Za-z]*/);
  if (!word) return null;
  return {
    from: word.from,
    options: commands.map(([name, detail]) => ({
      label: `\\${name}`,
      detail,
      type: 'function',
      apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
        const snippet = snippets.find(
          (s) => typeof s.parts[0] === 'string' && s.parts[0].startsWith(`\\${name}{`),
        );
        if (snippet && view.state.doc.sliceString(to, to + 1) !== '{') {
          const insertion = insertSnippet(view.state.doc.toString(), from, from, snippet);
          view.dispatch({
            changes: { from, to, insert: insertion.text },
            selection: EditorSelection.range(insertion.stops[0].from, insertion.stops[0].to),
            effects: stopEffect.of(insertion.stops),
          });
        } else {
          view.dispatch({
            changes: { from, to, insert: `\\${name}` },
            selection: { anchor: from + name.length + 1 },
          });
        }
      },
    })),
  };
}
const environmentCompletion = Prec.highest(
  EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '}') return false;
    const edit = completeEnvironment(view.state.doc.toString(), from, to);
    if (!edit) return false;
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.anchor },
      userEvent: 'input.type',
    });
    return true;
  }),
);
const theme = {
  text: '#dbe3f0',
  faint: '#5d6b82',
  accent: '#5aa9f0',
  panel: '#1b2435',
  panelBorder: '#2b354a',
  tooltip: '#202a3d',
  tooltipBorder: '#33415c',
  selected: '#2b4a6b',
  selection: '#3d5a8055',
  activeLine: '#ffffff03',
  activeGutter: '#ffffff05',
  search: '#e0b35633',
  searchActive: '#e0b35666',
};
export type SearchState = {
  search: string;
  replace: string;
  caseSensitive: boolean;
};
const germanPhrases = EditorState.phrases.of({
  Find: 'Suchen',
  Replace: 'Ersetzen',
  next: 'Weiter',
  previous: 'Zurück',
  'match case': 'Groß-/Kleinschreibung',
  replace: 'Ersetzen',
  'replace all': 'Alle ersetzen',
  close: 'Schließen',
  'current match': 'Aktueller Treffer',
  'on line': 'in Zeile',
  'replaced match on line $': 'Treffer in Zeile $ ersetzt',
  'replaced $ matches': '$ Treffer ersetzt',
  'Go to line': 'Gehe zu Zeile',
  go: 'Los',
});
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: '#5aa9f0' },
  { tag: tags.atom, color: '#4fc4c0' },
  { tag: tags.number, color: '#e0b356' },
  { tag: tags.comment, color: '#5d6b82', fontStyle: 'italic' },
  { tag: tags.string, color: '#d7a06a' },
  { tag: tags.bracket, color: '#8fa7cc' },
  { tag: tags.tagName, color: '#9fc9f5' },
  { tag: tags.name, color: '#9fc9f5' },
  { tag: tags.meta, color: '#b79ae8' },
  { tag: tags.operator, color: '#b79ae8' },
]);
export class EditorAdapter {
  readonly view: EditorView;
  private spell: Worker;
  private spellId = 0;
  private spellTimer: ReturnType<typeof setTimeout> | undefined;
  private jumpTimer: ReturnType<typeof setTimeout> | undefined;
  private language: 'de' | 'en';
  private suppressed = false;
  private active = true;
  private editable = new Compartment();
  private foldTransitions = new FoldTransitions();
  private contextMenu: EditorContextMenu;
  private customWords = loadCustomDictionary();
  private ignoredWords = new Set<string>();
  private addToDictionary = (word: string) => {
    if (this.customWords.some((entry) => normalizeWord(entry) === normalizeWord(word))) return;
    this.customWords = [...this.customWords, word];
    saveCustomDictionary(this.customWords);
    this.scheduleSpell();
  };
  private ignoreSpelling = (word: string) => {
    this.ignoredWords.add(normalizeWord(word));
    this.scheduleSpell();
  };
  constructor(
    parent: HTMLElement,
    text: string,
    language: 'de' | 'en',
    onChange: (text: string) => void,
    onCursor: (line: number, column: number) => void,
    onError: (message: string) => void,
    onSearch: () => void = () => undefined,
    onCloseSearch: () => void = () => undefined,
    onFindInPdf: (line: number, column: number) => void = () => undefined,
    canFindInPdf: () => boolean = () => false,
  ) {
    this.language = language;
    this.spell = new Worker(new URL('../spell/worker.ts', import.meta.url), { type: 'module' });
    this.view = new EditorView({
      parent,
      dispatchTransactions: (transactions, view) => this.foldTransitions.dispatch(transactions, view),
      state: EditorState.create({
        doc: text,
        extensions: [
          germanPhrases,
          lineNumbers(),
          visualFoldGutter,
          foldGapNumbers,
          foldGapWidgets,
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          StreamLanguage.define(stex),
          syntaxHighlighting(colors),
          highlightActiveLine(),
          highlightSelectionMatches(),
          stops,
          environmentFolds,
          environmentFoldService,
          jumpHighlight,
          environmentCompletion,
          autocompletion({ override: [completions] }),
          search({
            createPanel: () => {
              const dom = document.createElement('div');
              dom.className = 'cm-hidden-search-panel';
              return { dom, top: true };
            },
          }),
          keymap.of([
            { key: 'Tab', run: (view) => nextStop(view, 1) },
            { key: 'Shift-Tab', run: (view) => nextStop(view, -1) },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            { key: 'Mod-f', run: () => (onSearch(), true) },
            { key: 'Mod-h', run: () => (onSearch(), true) },
            { key: 'Escape', run: () => (onCloseSearch(), false) },
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': 'LaTeX-Quelltext',
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          this.editable.of(EditorView.editable.of(true)),
          EditorView.theme(
            {
              '&': { height: '100%', fontSize: '16px', backgroundColor: 'transparent', color: theme.text },
              '.cm-scroller': {
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
                lineHeight: '1.85',
              },
              '.cm-content': { padding: '0 0 100px' },
              '.cm-line': { padding: '0 24px 0 12px' },
              '.cm-gutters': {
                background: 'transparent',
                color: theme.faint,
                border: 'none',
                paddingLeft: '10px',
              },
              '.cm-activeLineGutter': { background: theme.activeGutter, color: theme.text },
              '.cm-activeLine': { background: theme.activeLine },
              '.cm-cursor': { borderLeftColor: theme.accent },
              '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
                background: theme.selection,
              },
              '.cm-panels': { background: theme.panel, color: theme.text, borderColor: theme.panelBorder },
              '.cm-tooltip': {
                background: theme.tooltip,
                border: `1px solid ${theme.tooltipBorder}`,
                color: theme.text,
              },
              '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: theme.selected },
              '.cm-searchMatch': { background: theme.search },
              '.cm-searchMatch.cm-searchMatch-selected': { background: theme.searchActive },
              '.cm-foldPlaceholder': { display: 'none' },
            },
            { dark: true },
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (!this.suppressed) onChange(update.state.doc.toString());
              this.scheduleSpell();
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              onCursor(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
    });
    this.spell.onmessage = (event: MessageEvent<SpellResponse>) => {
      const result = event.data;
      if (result.id !== this.spellId) return;
      if (result.error) {
        onError(result.error);
        return;
      }
      const diagnostics: EditorDiagnostic[] = result.issues.map((issue) => ({
        from: issue.from,
        to: issue.to,
        severity: 'info',
        source: this.language === 'de' ? 'Deutsch' : 'English',
        message: `„${issue.word}“ – Schreibweise prüfen`,
        actions: issue.suggestions.map((suggestion) => ({
          name: suggestion,
          apply: (view, from, to) =>
            view.dispatch({ changes: { from, to, insert: suggestion }, userEvent: 'input.spellcheck' }),
        })),
      }));
      this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    };
    this.spell.onerror = () => onError('Die lokale Rechtschreibprüfung konnte nicht gestartet werden.');
    this.contextMenu = new EditorContextMenu(
      parent,
      this.view,
      onFindInPdf,
      canFindInPdf,
      onError,
      this.addToDictionary,
      this.ignoreSpelling,
    );
    this.scheduleSpell();
  }
  private scheduleSpell() {
    clearTimeout(this.spellTimer);
    this.spellId++;
    if (!this.active) return;
    this.spellTimer = setTimeout(() => {
      this.spell.postMessage({
        id: this.spellId,
        source: this.view.state.doc.toString(),
        language: this.language,
        customWords: this.customWords,
        ignoredWords: [...this.ignoredWords],
      } satisfies SpellRequest);
    }, 450);
  }
  setLanguage(language: 'de' | 'en') {
    if (language !== this.language) {
      this.language = language;
      this.scheduleSpell();
    }
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) {
      this.customWords = loadCustomDictionary();
      this.view.requestMeasure();
      this.scheduleSpell();
    }
  }
  setText(text: string) {
    if (text === this.view.state.doc.toString()) return;
    this.suppressed = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      effects: stopEffect.of([]),
    });
    this.suppressed = false;
  }
  snippet(snippet: Snippet) {
    const range = this.view.state.selection.main;
    const insertion = insertMenuSnippet(this.view.state.doc.toString(), range.from, range.to, snippet);
    this.view.dispatch({
      changes: { from: insertion.from, to: insertion.to, insert: insertion.text },
      selection: EditorSelection.range(insertion.stops[0].from, insertion.stops[0].to),
      effects: stopEffect.of(insertion.stops),
      userEvent: 'input.snippet',
    });
    this.view.focus();
  }
  jump(line: number) {
    const target = this.view.state.doc.line(Math.max(1, Math.min(line, this.view.state.doc.lines)));
    clearTimeout(this.jumpTimer);
    this.view.requestMeasure();
    this.view.dispatch({
      selection: { anchor: target.from },
      effects: [jumpHighlightEffect.of(target.from)],
    });
    this.view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
    this.jumpTimer = setTimeout(() => this.view.dispatch({ effects: jumpHighlightEffect.of(null) }), 2500);
    this.view.focus();
  }
  get position() {
    const head = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1 };
  }
  undo() {
    undo(this.view);
    this.view.focus();
  }
  redo() {
    redo(this.view);
    this.view.focus();
  }
  openSearch() {
    openSearchPanel(this.view);
  }
  closeSearch() {
    closeSearchPanel(this.view);
  }
  setQuery(query: SearchState) {
    this.view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: query.search,
          replace: query.replace,
          caseSensitive: query.caseSensitive,
        }),
      ),
    });
  }
  findNext() {
    findNext(this.view);
    this.view.focus();
  }
  findPrevious() {
    findPrevious(this.view);
    this.view.focus();
  }
  replaceNext() {
    replaceNext(this.view);
  }
  replaceAll() {
    replaceAll(this.view);
  }
  matchCount(query: SearchState) {
    if (!query.search) return 0;
    const spec = new SearchQuery({
      search: query.search,
      caseSensitive: query.caseSensitive,
    });
    if (!spec.valid) return 0;
    const cursor = spec.getCursor(this.view.state);
    let count = 0;
    while (!cursor.next().done && count <= 9999) count++;
    return count;
  }
  focus() {
    this.view.focus();
  }
  destroy() {
    clearTimeout(this.spellTimer);
    clearTimeout(this.jumpTimer);
    this.foldTransitions.destroy();
    this.contextMenu.destroy();
    this.spell.terminate();
    this.view.destroy();
  }
}
