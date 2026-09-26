import { rawEnvironments } from './latex';

const indentUnit = '\t';
const flatEnvironments = new Set(['document']);
const beginPattern = /^\\begin\{([^}]*)\}/;
const endPattern = /^\\end\{([^}]*)\}/;

export function cleanLatex(source: string, baseIndent = 0): string {
  const result: string[] = [];
  let level = 0;
  let blank = 0;
  let raw: string | undefined;
  for (const original of source.split('\n')) {
    if (raw !== undefined) {
      result.push(original.replace(/\s+$/, ''));
      if (endPattern.exec(original.trim())?.[1] === raw) {
        raw = undefined;
        level = Math.max(0, level - 1);
      }
      continue;
    }
    const content = original.trim();
    if (!content) {
      blank++;
      continue;
    }
    if (blank && result.length) result.push('');
    blank = 0;
    const ended = endPattern.exec(content)?.[1];
    if (ended !== undefined && !flatEnvironments.has(ended)) level = Math.max(0, level - 1);
    result.push(indentUnit.repeat(baseIndent + level) + content);
    const begun = beginPattern.exec(content)?.[1];
    if (begun !== undefined && !flatEnvironments.has(begun)) {
      level++;
      if (rawEnvironments.has(begun)) raw = begun;
    }
  }
  return result.join('\n') + (blank ? '\n' : '');
}
