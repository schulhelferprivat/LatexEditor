import { useState } from 'react';
import { defaultPreamble, type PreambleSettings } from '../domain/app';
import { Dialog } from './Dialog';

export function Preamble({
  settings,
  onApply,
  onCancel,
}: {
  settings: PreambleSettings;
  onApply: (settings: PreambleSettings) => void;
  onCancel: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [text, setText] = useState(settings.text);
  return (
    <Dialog title="Präambel" onCancel={onCancel} wide>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Gemeinsame Präambel verwenden
      </label>
      <p className="dialog-intro">
        Dokumentklasse und Pakete hier einfügen. Im Haupteditor können reiner Dokumentinhalt oder eigene
        Befehle vor einem selbst geschriebenen \begin{'{document}'} / \end{'{document}'} stehen. Ohne eigene
        Dokumentbegrenzungen werden diese beim Kompilieren ergänzt. Für vollständige Dokumente mit eigener
        Dokumentklasse die gemeinsame Präambel ausschalten.
      </p>
      <label>
        LaTeX-Präambel
        <textarea
          className="preamble-input"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="dialog-footer">
        <span className="muted">Gilt für alle Dokumente und wird in diesem Browser gespeichert.</span>
        <button
          className="button subtle"
          disabled={text === defaultPreamble}
          onClick={() => setText(defaultPreamble)}
        >
          Vorlage wiederherstellen
        </button>
        <button className="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button className="button primary" onClick={() => onApply({ enabled, text })}>
          Übernehmen
        </button>
      </div>
    </Dialog>
  );
}
