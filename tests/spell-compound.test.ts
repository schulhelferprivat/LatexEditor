import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import nspell from 'nspell';
import { createCompoundChecker } from '../src/spell/compound';

const read = (extension: string) =>
  readFile(new URL(`../node_modules/dictionary-de/index.${extension}`, import.meta.url), 'utf8');
const dic = await read('dic');
const spell = nspell({ aff: await read('aff'), dic });
const { accepts, suggestTail, stems, misflagged } = createCompoundChecker(dic, (word) => spell.correct(word));
const suggest = (word: string) => spell.suggest(word);

describe('German compound words', () => {
  it('accepts everyday compounds that are not dictionary entries', () => {
    for (const word of [
      'Mittelpunkt',
      'Hausaufgabe',
      'Klassenarbeit',
      'Schulaufgabe',
      'Textaufgabe',
      'Schnittpunkt',
      'Seitenlänge',
      'Flächeninhalt',
      'Koordinatensystem',
      'Dreiecksfläche',
      'Wahrscheinlichkeitsrechnung',
      'Taschenrechner',
    ]) {
      expect(spell.correct(word), `${word} unexpectedly a dictionary entry`).toBe(false);
      expect(accepts(word), word).toBe(true);
    }
  });

  it('accepts three-part compounds and linking morphemes', () => {
    expect(accepts('Schnittpunktberechnung')).toBe(true);
    expect(accepts('Gleichungssystem')).toBe(true);
  });

  it('rejects misspellings', () => {
    for (const word of [
      'Hausaufgabee',
      'Mittelpunktt',
      'Wörterbuchh',
      'Klassnarbeit',
      'xyzabcqwert',
      'Aufgabbe',
      'Schuulaufgabe',
      'Punktt',
      'Klassenarbiet',
      'Mitelpunkt',
    ])
      expect(accepts(word), word).toBe(false);
  });

  it('still accepts plain dictionary words', () => {
    for (const word of ['Mittel', 'Punkt', 'Größe', 'Haus']) expect(accepts(word), word).toBe(true);
  });
});

describe('hyphenated words', () => {
  it('accepts words whose every part is known', () => {
    for (const word of ['Haus-Tür', 'E-Mail-Adresse', 'Nord-Süd', 'Mittelpunkt-Berechnung', 'US-Wirtschaft'])
      expect(accepts(word), word).toBe(true);
  });

  it('rejects unknown parts and empty parts', () => {
    expect(accepts('Blah-Xyzzy')).toBe(false);
    expect(accepts('Haus--Tuer')).toBe(false);
  });

  it('keeps affix-generated trailing-hyphen forms', () => {
    expect(accepts('Haus-')).toBe(true);
  });
});

describe('normalisation', () => {
  it('is composed-form only, so the worker must normalise', () => {
    const composed = 'Größe';
    expect(spell.correct(composed)).toBe(true);
    expect(spell.correct(composed.normalize('NFD'))).toBe(false);
    expect(accepts(composed.normalize('NFD'))).toBe(false);
    expect(accepts(composed.normalize('NFD').normalize('NFC'))).toBe(true);
  });
});

describe('compound suggestions', () => {
  it('repairs the failing tail of a compound', () => {
    expect(suggestTail('Hausaufgabee', suggest)[0]).toBe('Hausaufgabe');
    expect(suggestTail('Mittelpunktt', suggest)[0]).toBe('Mittelpunkt');
  });

  it('gives up when no head is valid', () => {
    expect(suggestTail('Klassnarbeit', suggest)).toEqual([]);
  });
});

describe('words nspell mis-flags as compound-only', () => {
  it('accepts verbs that are listed both plainly and as compound fragments', () => {
    for (const word of [
      'behandeln',
      'rechnen',
      'zeichnen',
      'berechnen',
      'gehen',
      'ändern',
      'abbiegen',
      'abfahrt',
    ]) {
      expect(spell.correct(word), `${word} no longer triggers the nspell bug`).toBe(false);
      expect(accepts(word), word).toBe(true);
    }
  });

  it('keeps genuine compound-only fragments rejected', () => {
    for (const word of ['äpfel', 'äste', 'äbte', 'ähre', 'äquator', 'ästhetik', 'äderchen'])
      expect(accepts(word), word).toBe(false);
  });

  it('rescues only words that also have a standalone entry', () => {
    expect(misflagged.size).toBeGreaterThan(3000);
    expect(misflagged.has('behandeln')).toBe(true);
    expect(misflagged.has('äpfel')).toBe(false);
  });
});

describe('stem extraction', () => {
  it('finds the compound-flagged stems', () => {
    expect(stems.size).toBeGreaterThan(3000);
  });
});
