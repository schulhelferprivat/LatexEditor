import { analyzeLatex } from './latex';

export type EnvironmentFoldRange = { lineStart: number; from: number; to: number };

export function environmentFoldRanges(source: string): EnvironmentFoldRange[] {
  return analyzeLatex(source)
    .environments.flatMap((environment) => {
      const lineStart = source.lastIndexOf('\n', environment.from - 1) + 1;
      const lineEnd = source.indexOf('\n', environment.from);
      const closeLineStart = source.lastIndexOf('\n', environment.closeStart - 1) + 1;
      const end = lineEnd < 0 ? source.length : lineEnd;
      if (
        end + 1 >= closeLineStart ||
        source.slice(lineStart, environment.from).trim() ||
        source.slice(closeLineStart, environment.closeStart).trim()
      )
        return [];
      return [{ lineStart, from: end, to: closeLineStart - 1 }];
    })
    .sort((a, b) => a.lineStart - b.lineStart);
}

export function environmentFoldRangeAtLine(
  ranges: readonly EnvironmentFoldRange[],
  lineStart: number,
  lineEnd: number,
) {
  return ranges.find((range) => range.lineStart === lineStart && range.from === lineEnd) ?? null;
}
