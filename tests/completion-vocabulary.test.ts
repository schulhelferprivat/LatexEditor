import { describe, expect, it } from 'vitest';
import defaultPreamble from '../src/default-preamble.tex?raw';
import { snippets } from '../src/editor/snippets';
import {
  commandBoost,
  documentBoost,
  documentVocabulary,
  preambleBoost,
  preambleVocabulary,
  preferredCommands,
  preferredEnvironments,
  snippetBoost,
  snippetVocabulary,
} from '../src/editor/vocabulary';

describe('preambleVocabulary', () => {
  it('reads a braced definition', () => {
    expect(preambleVocabulary('\\newcommand{\\luecke}[1]{x}').commands).toContain('luecke');
  });
  it('reads a bare definition', () => {
    expect(preambleVocabulary('\\NewDocumentCommand\\punkt{m}{x}').commands).toContain('punkt');
  });
  it('reads a bare definition with an optional argument', () => {
    expect(preambleVocabulary('\\newcommand\\Overline[2][1pt]{x}').commands).toContain('Overline');
  });
  it('reads a starred definition', () => {
    expect(preambleVocabulary('\\newcommand*\\centermathcell[1]{x}').commands).toContain('centermathcell');
  });
  it('skips internal names', () => {
    expect(preambleVocabulary('\\NewDocumentCommand{\\lsg@short}{m}{x}').commands.size).toBe(0);
  });
  it('skips renewcommand targets', () => {
    expect(preambleVocabulary('\\renewcommand{\\familydefault}{x}').commands.size).toBe(0);
  });
  it('reads theorem environments', () => {
    expect(preambleVocabulary('\\newtheorem{Aufgabe}{Aufgabe}').environments).toContain('Aufgabe');
  });
  it('reads document environments', () => {
    expect(preambleVocabulary('\\NewDocumentEnvironment{lsg}{O{0cm}}{a}{b}').environments).toContain('lsg');
  });
  it('covers the shipped preamble', () => {
    const vocabulary = preambleVocabulary(defaultPreamble);
    expect(vocabulary.commands.size).toBe(39);
    expect(vocabulary.commands).toContain('N');
    expect(vocabulary.commands).toContain('R');
    expect([...vocabulary.environments].sort()).toEqual([
      'Aufgabe',
      'Definition',
      'Satz',
      'lsg',
      'schnipsel',
    ]);
    expect([...vocabulary.commands].some((name) => name.includes('@'))).toBe(false);
  });
});

describe('snippetVocabulary', () => {
  const vocabulary = snippetVocabulary(snippets);
  it('finds template commands', () => {
    expect(vocabulary.commands).toContain('punkt');
    expect(vocabulary.commands).toContain('luecke');
    expect(vocabulary.commands).toContain('janein');
  });
  it('skips structural commands', () => {
    expect(vocabulary.commands).not.toContain('begin');
    expect(vocabulary.commands).not.toContain('end');
    expect(vocabulary.commands).not.toContain('item');
  });
  it('finds template environments', () => {
    expect(vocabulary.environments).toContain('tasks');
    expect(vocabulary.environments).toContain('framed');
    expect(vocabulary.environments).toContain('tikzpicture');
  });
  it('contains no escape artefacts', () => {
    expect(vocabulary.commands).not.toContain('t');
    expect(vocabulary.commands).not.toContain('n');
    expect([...vocabulary.commands].some((name) => name.startsWith('nHallo'))).toBe(false);
  });
});

describe('documentVocabulary', () => {
  it('finds commands inside math', () => {
    expect(documentVocabulary('$\\punkt{1,2}$').commands).toContain('punkt');
  });
  it('finds used environments', () => {
    expect(documentVocabulary('\\begin{Aufgabe}\\end{Aufgabe}').environments).toContain('Aufgabe');
  });
});

describe('boosts', () => {
  const empty = { commands: new Set<string>(), environments: new Set<string>() };
  it('ranks a document command highest', () => {
    expect(commandBoost('textbf', documentVocabulary('\\textbf{x}'))).toBe(documentBoost);
  });
  it('ranks a template command above a preamble command', () => {
    expect(commandBoost('luecke', empty)).toBe(snippetBoost);
    expect(commandBoost('LastPageNumber', empty)).toBe(preambleBoost);
    expect(snippetBoost).toBeGreaterThan(preambleBoost);
  });
  it('leaves an unknown command unboosted', () => {
    expect(commandBoost('documentclass', empty)).toBe(0);
  });
  it('combines sources by maximum, not by sum', () => {
    expect(commandBoost('punkt', documentVocabulary('\\punkt{1}'))).toBe(documentBoost);
  });
});

describe('preferred lists', () => {
  it('contains no duplicates', () => {
    expect(preferredCommands.length).toBe(new Set(preferredCommands).size);
    expect(preferredEnvironments.length).toBe(new Set(preferredEnvironments).size);
  });
  it('offers the worksheet vocabulary', () => {
    expect(preferredCommands).toContain('luecke');
    expect(preferredCommands).toContain('punkt');
    expect(preferredEnvironments).toContain('lsg');
    expect(preferredEnvironments).toContain('Aufgabe');
  });
});
