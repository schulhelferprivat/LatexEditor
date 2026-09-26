import { describe, it, expect } from 'vitest';
import { clampIssueIndex, nextIssueIndex } from '../src/ui/SpellBar';

describe('spell issue navigation', () => {
  it('walks forward and wraps at the end', () => {
    expect(nextIssueIndex(0, 1, 3)).toBe(1);
    expect(nextIssueIndex(2, 1, 3)).toBe(0);
  });

  it('walks backward and wraps at the start', () => {
    expect(nextIssueIndex(1, -1, 3)).toBe(0);
    expect(nextIssueIndex(0, -1, 3)).toBe(2);
  });

  it('stays at zero without issues', () => {
    expect(nextIssueIndex(0, 1, 0)).toBe(0);
    expect(nextIssueIndex(3, -1, 0)).toBe(0);
  });

  it('pulls the index back when issues disappear', () => {
    expect(clampIssueIndex(5, 3)).toBe(2);
    expect(clampIssueIndex(2, 3)).toBe(2);
    expect(clampIssueIndex(1, 0)).toBe(0);
    expect(clampIssueIndex(-1, 3)).toBe(0);
  });
});
