import { describe, expect, it } from 'vitest';
import { mathDelimiterEdit } from '../src/editor/delimiters';

function applied(source: string, from: number, to: number, text: string) {
  const edit = mathDelimiterEdit(source, from, to, text);
  if (!edit) return undefined;
  const result = source.slice(0, from) + edit.insert + source.slice(to);
  return `${result.slice(0, edit.anchor)}|${result.slice(edit.anchor)}`;
}

describe('mathDelimiterEdit', () => {
  it('completes display math', () => {
    expect(applied('\\', 1, 1, '[')).toBe('\\[ | \\]');
  });
  it('completes inline math', () => {
    expect(applied('\\', 1, 1, '(')).toBe('\\( | \\)');
  });
  it('completes escaped braces', () => {
    expect(applied('\\', 1, 1, '{')).toBe('\\{ | \\}');
  });
  it('ignores a bracket without a backslash', () => {
    expect(mathDelimiterEdit('a', 1, 1, '[')).toBeUndefined();
  });
  it('ignores a bracket at the document start', () => {
    expect(mathDelimiterEdit('', 0, 0, '[')).toBeUndefined();
  });
  it('ignores an escaped backslash', () => {
    expect(mathDelimiterEdit('\\\\', 2, 2, '[')).toBeUndefined();
  });
  it('applies after an odd number of backslashes', () => {
    expect(applied('\\\\\\', 3, 3, '[')).toBe('\\\\\\[ | \\]');
  });
  it('wraps a selection', () => {
    expect(applied('\\x+1', 1, 4, '[')).toBe('\\[ x+1| \\]');
  });
  it('ignores other characters', () => {
    expect(mathDelimiterEdit('\\', 1, 1, '$')).toBeUndefined();
    expect(mathDelimiterEdit('\\', 1, 1, 'a')).toBeUndefined();
  });
});
