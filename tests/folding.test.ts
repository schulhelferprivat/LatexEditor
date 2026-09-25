import { describe, expect, it } from 'vitest';
import { environmentFoldRangeAtLine, environmentFoldRanges } from '../src/editor/folding';

describe('LaTeX-Umgebungen einklappen', () => {
  it('blendet den Inhalt einer mehrzeiligen Umgebung aus', () => {
    const source = '\\begin{itemize}\n  \\item Eintrag\n\\end{itemize}';
    const ranges = environmentFoldRanges(source);
    const range = ranges[0]!;

    expect(ranges).toHaveLength(1);
    expect(range).toEqual({ lineStart: 0, from: source.indexOf('\n'), to: source.lastIndexOf('\n') });
    expect(environmentFoldRangeAtLine([range], 0, source.indexOf('\n'))).toEqual(range);
  });

  it('liefert unabhängige Bereiche für verschachtelte Umgebungen', () => {
    const source =
      '\\begin{itemize}\n  \\begin{enumerate}\n    \\item Eintrag\n  \\end{enumerate}\n\\end{itemize}';

    expect(environmentFoldRanges(source)).toHaveLength(2);
  });

  it('ignoriert unvollständige und nicht zeilenweise Umgebungen', () => {
    expect(environmentFoldRanges('Text \\begin{itemize}\n\\end{itemize}')).toEqual([]);
    expect(environmentFoldRanges('\\begin{itemize}\n\\end{itemize}')).toEqual([]);
    expect(environmentFoldRanges('\\begin{itemize}\n\\item Eintrag')).toEqual([]);
    expect(environmentFoldRanges('% \\begin{itemize}\n\\end{itemize}')).toEqual([]);
  });
});
