export type DelimiterEdit = { insert: string; anchor: number };

const closers: Record<string, string> = { '[': ']', '(': ')', '{': '}' };

function precedingBackslashes(source: string, from: number) {
  let count = 0;
  for (let i = from - 1; i >= 0 && source[i] === '\\'; i--) count++;
  return count;
}

export function mathDelimiterEdit(
  source: string,
  from: number,
  to: number,
  text: string,
): DelimiterEdit | undefined {
  const closing = closers[text];
  if (!closing) return;
  if (precedingBackslashes(source, from) % 2 === 0) return;
  const selection = source.slice(from, to);
  return {
    insert: `${text} ${selection} \\${closing}`,
    anchor: from + text.length + 1 + selection.length,
  };
}
