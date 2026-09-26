import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { closeBrackets, insertBracket } from '@codemirror/autocomplete';

function create(doc: string, anchor: number, head = anchor) {
  return EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: [
      StreamLanguage.define(stex),
      closeBrackets(),
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{', '$'] } }]),
    ],
  });
}

function type(state: EditorState, keys: string[]) {
  for (const key of keys) {
    const transaction = insertBracket(state, key);
    state = transaction
      ? transaction.state
      : state.update({
          changes: { from: state.selection.main.from, to: state.selection.main.to, insert: key },
          selection: EditorSelection.cursor(state.selection.main.from + key.length),
        }).state;
  }
  const text = state.doc.toString();
  const head = state.selection.main.head;
  return `${text.slice(0, head)}|${text.slice(head)}`;
}

describe('dollar completion', () => {
  it('inserts a pair', () => {
    expect(type(create('', 0), ['$'])).toBe('$|$');
  });
  it('skips the closing dollar instead of doubling it', () => {
    expect(type(create('', 0), ['$', '$'])).toBe('$$|');
  });
  it('closes around typed content', () => {
    expect(type(create('', 0), ['$', 'x', '$'])).toBe('$x$|');
  });
  it('wraps a selection', () => {
    expect(type(create('a+b', 0, 3), ['$'])).toBe('$a+b|$');
  });
  it('still pairs plain braces without spaces', () => {
    expect(type(create('\\textbf', 7), ['{'])).toBe('\\textbf{|}');
  });
});
