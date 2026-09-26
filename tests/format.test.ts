import { describe, expect, it } from 'vitest';
import { cleanLatex } from '../src/editor/format';

describe('Codebereinigung', () => {
  it('rückt verschachtelte Umgebungen mit zwei Leerzeichen je Ebene ein', () => {
    const source = String.raw`\begin{itemize}
\item Erster Punkt
\begin{enumerate}
\item Innen
\end{enumerate}
\end{itemize}`;

    expect(cleanLatex(source)).toBe(
      String.raw`\begin{itemize}
  \item Erster Punkt
  \begin{enumerate}
    \item Innen
  \end{enumerate}
\end{itemize}`,
    );
  });

  it('baut vorhandene Übereinrückung ab', () => {
    const source = [
      '            \\begin{itemize}',
      '                    \\item Erster Punkt',
      '              \\end{itemize}',
      '        Normaler Text',
    ].join('\n');

    expect(cleanLatex(source)).toBe(
      ['\\begin{itemize}', '  \\item Erster Punkt', '\\end{itemize}', 'Normaler Text'].join('\n'),
    );
  });

  it('entfernt Leerzeichen am Zeilenende', () => {
    expect(cleanLatex('Erste Zeile   \nZweite Zeile\t\t')).toBe('Erste Zeile\nZweite Zeile');
  });

  it('fasst mehrfache Leerzeilen zu einer zusammen', () => {
    expect(cleanLatex('Eins\n\n\n\n\nZwei')).toBe('Eins\n\nZwei');
    expect(cleanLatex('Eins\n\nZwei')).toBe('Eins\n\nZwei');
  });

  it('wandelt führende Tabs in Leerzeichen um', () => {
    expect(cleanLatex('\t\\begin{center}\n\t\tText\n\t\\end{center}')).toBe(
      '\\begin{center}\n  Text\n\\end{center}',
    );
  });

  it('lässt den Inhalt von verbatim-Umgebungen unverändert', () => {
    const source = ['\\begin{verbatim}', '        tief      eingerückt', '', '', '', '\\end{verbatim}'].join(
      '\n',
    );

    expect(cleanLatex(source)).toBe(source);
  });

  it('lässt den Inhalt von lstlisting unverändert und rückt danach wieder normal ein', () => {
    const source = [
      '\\begin{itemize}',
      '\\begin{lstlisting}',
      '    def f():',
      '        return 1',
      '\\end{lstlisting}',
      '\\item Danach',
      '\\end{itemize}',
    ].join('\n');

    expect(cleanLatex(source)).toBe(
      [
        '\\begin{itemize}',
        '  \\begin{lstlisting}',
        '    def f():',
        '        return 1',
        '\\end{lstlisting}',
        '  \\item Danach',
        '\\end{itemize}',
      ].join('\n'),
    );
  });

  it('erzeugt bei unbalanciertem \\end keine negative Einrückung', () => {
    expect(cleanLatex('\\end{itemize}\n\\end{itemize}\nText')).toBe('\\end{itemize}\n\\end{itemize}\nText');
  });

  it('verschiebt das Ergebnis um die Grundeinrückung', () => {
    expect(cleanLatex('\\begin{center}\nText\n\\end{center}', 2)).toBe(
      '    \\begin{center}\n      Text\n    \\end{center}',
    );
  });

  it('verändert Kommentarzeilen nur in der Einrückung', () => {
    expect(cleanLatex('\\begin{center}\n      % \\begin{itemize}   \n\\end{center}')).toBe(
      '\\begin{center}\n  % \\begin{itemize}\n\\end{center}',
    );
  });
});
