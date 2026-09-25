import { describe, expect, it } from 'vitest';
import { snippetGroups, snippets } from '../src/editor/snippets';
import { nextMenuItemIndex } from '../src/ui/SnippetToolbar';

describe('Snippet-Menüs', () => {
  it('ordnet jedes Snippet genau einer Kategorie zu', () => {
    const grouped = snippetGroups.flatMap((group) => group.snippets);

    expect(grouped).toHaveLength(snippets.length);
    expect(new Set(grouped).size).toBe(snippets.length);
    expect(new Set(grouped)).toEqual(new Set(snippets.map((snippet) => snippet.id)));
  });

  it('navigiert zyklisch durch geöffnete Menüeinträge', () => {
    expect(nextMenuItemIndex(0, 4, 'ArrowDown')).toBe(1);
    expect(nextMenuItemIndex(0, 4, 'ArrowUp')).toBe(3);
    expect(nextMenuItemIndex(3, 4, 'ArrowDown')).toBe(0);
    expect(nextMenuItemIndex(2, 4, 'Home')).toBe(0);
    expect(nextMenuItemIndex(1, 4, 'End')).toBe(3);
  });
});
