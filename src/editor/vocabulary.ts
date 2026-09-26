import defaultPreambleText from '../default-preamble.tex?raw';
import { snippets, type Snippet } from './snippets';

export type Vocabulary = { commands: Set<string>; environments: Set<string> };

export const documentBoost = 60;
export const snippetBoost = 30;
export const preambleBoost = 15;

const definitionPattern =
  /\\(?:newcommand|providecommand|NewDocumentCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))/g;
const environmentDefinitionPattern =
  /\\(?:newtheorem|newenvironment|NewDocumentEnvironment)\*?\s*\{\s*([A-Za-z@*]+)\s*\}/g;
const usagePattern = /\\([A-Za-z@]+)/g;
const beginPattern = /\\begin\{([A-Za-z@*]+)\}/g;

const structural = new Set(['begin', 'end', 'item', 'task', 'fi', 'else', 'or']);

function usable(name: string) {
  return !name.includes('@') && !structural.has(name);
}

function collect(pattern: RegExp, source: string, group: (match: RegExpMatchArray) => string | undefined) {
  const names = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    const name = group(match);
    if (name && usable(name)) names.add(name);
  }
  return names;
}

export function preambleVocabulary(source: string): Vocabulary {
  return {
    commands: collect(definitionPattern, source, (match) => match[1] ?? match[2]),
    environments: collect(environmentDefinitionPattern, source, (match) => match[1]),
  };
}

export function documentVocabulary(source: string): Vocabulary {
  return {
    commands: collect(usagePattern, source, (match) => match[1]),
    environments: collect(beginPattern, source, (match) => match[1]),
  };
}

export function snippetVocabulary(entries: Snippet[]): Vocabulary {
  const commands = new Set<string>();
  const environments = new Set<string>();
  for (const entry of entries)
    for (const part of entry.parts) {
      if (typeof part !== 'string') continue;
      const found = documentVocabulary(part);
      for (const name of found.commands) commands.add(name);
      for (const name of found.environments) environments.add(name);
    }
  return { commands, environments };
}

const preamble = preambleVocabulary(defaultPreambleText);
const snippetUsage = snippetVocabulary(snippets);

export const preferredCommands = [...new Set([...preamble.commands, ...snippetUsage.commands])];
export const preferredEnvironments = [...new Set([...preamble.environments, ...snippetUsage.environments])];

function boost(name: string, used: Set<string>, inSnippets: Set<string>, inPreamble: Set<string>) {
  return Math.max(
    used.has(name) ? documentBoost : 0,
    inSnippets.has(name) ? snippetBoost : 0,
    inPreamble.has(name) ? preambleBoost : 0,
  );
}

export function commandBoost(name: string, document: Vocabulary) {
  return boost(name, document.commands, snippetUsage.commands, preamble.commands);
}

export function environmentBoost(name: string, document: Vocabulary) {
  return boost(name, document.environments, snippetUsage.environments, preamble.environments);
}
