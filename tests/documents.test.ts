import { beforeEach, describe, it, expect, vi } from 'vitest';
const fs = vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => {} },
    configurable: true,
  });
  return {
    permission: vi.fn(async () => {}),
    write: vi.fn(async (_handle: FileSystemFileHandle, _data: string | Blob) => {}),
    lastDocument: vi.fn(async () => undefined),
    readConfig: vi.fn(),
    optionalText: vi.fn(async (): Promise<string | null> => null),
    collectFiles: vi.fn(),
    fileTypes: [],
    ConflictError: Error,
  };
});
vi.mock('../src/infra/files', () => fs);
import { AppController, dirty, type Document } from '../src/domain/app';
import { defaultConfig, simplifyConfig, type BuildResult } from '../src/domain/types';
function document(name = 'main.tex', text = 'saved'): Document {
  const config = defaultConfig();
  const file = {
    name,
    queryPermission: vi.fn(async () => 'granted'),
    getFile: vi.fn(async () => new File([text], name)),
    isSameEntry: vi.fn(async () => false),
  } as unknown as FileSystemFileHandle;
  return {
    id: name,
    name,
    text,
    saved: text,
    file,
    config,
    configRaw: null,
    savedConfig: JSON.stringify(config),
    revision: 0,
  };
}
function controller(doc = document()) {
  const app = new AppController();
  app.state.preamble = { enabled: false, text: '' };
  app.state.documents = [doc];
  app.state.active = doc.id;
  vi.spyOn(app.bridge, 'connect').mockResolvedValue({
    version: '1',
    engines: ['lualatex'],
    tools: ['lualatex'],
  });
  return app;
}
function finalController(results: BuildResult['results']) {
  const doc = document();
  const getFileHandle = vi.fn(async (name: string) => ({ name }) as FileSystemFileHandle);
  doc.dir = {
    resolve: async () => [doc.name],
    getFileHandle,
  } as unknown as FileSystemDirectoryHandle;
  const app = controller(doc);
  app.state.preamble = { enabled: true, text: '\\documentclass{article}' };
  vi.mocked(app.bridge.connect).mockResolvedValue({
    version: '1',
    engines: ['lualatex'],
    tools: ['lualatex'],
    preamble: true,
  });
  fs.collectFiles.mockResolvedValue([{ path: doc.name, file: new File([doc.text], doc.name) }]);
  vi.spyOn(app.bridge, 'workspace').mockResolvedValue({ id: 'workspace' });
  vi.spyOn(app.bridge, 'upload').mockResolvedValue(undefined);
  const build = vi.spyOn(app.bridge, 'build').mockResolvedValue({ id: 'job' });
  vi.spyOn(app.bridge, 'status').mockResolvedValue({ id: 'job', state: 'done', progress: 'Fertig', results });
  vi.spyOn(app.bridge, 'pdf').mockImplementation(async (_job, variant) => new Blob([variant]));
  vi.spyOn(app.bridge, 'release').mockResolvedValue({});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  const ask = vi.spyOn(app, 'ask').mockResolvedValue(0);
  return { app, doc, build, ask, getFileHandle };
}
beforeEach(() => {
  vi.clearAllMocks();
  fs.permission.mockResolvedValue(undefined);
  fs.write.mockResolvedValue(undefined);
  fs.lastDocument.mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
});
describe('Explizites Speichern', () => {
  it('ändert beim Schreiben nur den Arbeitsspeicher', () => {
    const app = controller();
    app.edit('main.tex', 'edited');
    expect(dirty(app.active!)).toBe(true);
    expect(fs.write).not.toHaveBeenCalled();
  });
  it('schreibt erst auf ausdrücklichen Aufruf', async () => {
    const app = controller();
    app.edit('main.tex', 'edited');
    await app.save();
    expect(fs.write).toHaveBeenCalledWith(app.active!.file, 'edited');
    expect(dirty(app.active!)).toBe(false);
  });
  it('behält während des Speicherns neu eingegebene Änderungen', async () => {
    const app = controller();
    app.edit('main.tex', 'first');
    fs.write.mockImplementationOnce(async () => {
      app.edit('main.tex', 'second');
    });
    await app.save();
    expect(app.active!.saved).toBe('first');
    expect(app.active!.text).toBe('second');
    expect(dirty(app.active!)).toBe(true);
  });
  it('verhindert überlappende Speicheroperationen', async () => {
    const app = controller();
    app.edit('main.tex', 'edited');
    let finish!: () => void;
    fs.write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = app.save();
    await vi.waitFor(() => expect(fs.write).toHaveBeenCalledOnce());
    await app.save();
    expect(fs.write).toHaveBeenCalledOnce();
    finish();
    await first;
  });
  it('überschreibt externe Änderungen nicht nach Abbrechen', async () => {
    const app = controller();
    app.edit('main.tex', 'edited');
    vi.mocked(app.active!.file!.getFile).mockResolvedValue(new File(['external'], 'main.tex'));
    vi.spyOn(app, 'ask').mockResolvedValue(0);
    await app.save();
    expect(fs.write).not.toHaveBeenCalled();
    expect(dirty(app.active!)).toBe(true);
  });
  it('bricht bei extern geänderten Varianten auch ohne eigene Variantenänderung ab', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    const app = controller(doc);
    fs.optionalText.mockResolvedValueOnce('external' as never);
    vi.spyOn(app, 'ask').mockResolvedValue(0);
    const build = vi.spyOn(app.bridge, 'build');
    await app.build('draft');
    expect(fs.write).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });
  it('lädt externe Varianten ausdrücklich ohne den Quelltext zu speichern', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    const app = controller(doc);
    const external = defaultConfig();
    external.variants[0].name = 'Extern';
    fs.optionalText.mockResolvedValueOnce('external' as never);
    fs.readConfig.mockResolvedValueOnce({ config: external, raw: 'external' });
    vi.spyOn(app, 'ask').mockResolvedValue(1);
    await app.save();
    expect(doc.config.variants[0].name).toBe('Extern');
    expect(fs.write).not.toHaveBeenCalled();
  });
  it('lädt externe Änderungen ohne Schreiboperation', async () => {
    const app = controller();
    app.edit('main.tex', 'edited');
    vi.mocked(app.active!.file!.getFile).mockResolvedValue(new File(['external'], 'main.tex'));
    vi.spyOn(app, 'ask').mockResolvedValue(1);
    await app.save();
    expect(app.active!.text).toBe('external');
    expect(fs.write).not.toHaveBeenCalled();
  });
  it.each([{ finals: ['loesung'] }, { finals: [] as string[] }])(
    'schreibt die ältere Auswahl $finals beim nächsten Speichern als festes Paar',
    async ({ finals }) => {
      const doc = document();
      const legacy = { ...defaultConfig(), finals, engine: 'xelatex' as const, shellEscape: false };
      doc.config = simplifyConfig(legacy);
      doc.savedConfig = JSON.stringify(doc.config);
      doc.configRaw = JSON.stringify(legacy);
      doc.dir = {
        resolve: async () => [doc.name],
        getFileHandle: async (name: string) => ({ name }),
      } as unknown as FileSystemDirectoryHandle;
      fs.optionalText.mockResolvedValueOnce(doc.configRaw);
      const app = controller(doc);
      await app.save();
      expect(doc.config.finals).toEqual(['arbeitsblatt', 'loesung']);
      expect(doc.config.engine).toBe('xelatex');
      expect(doc.config.shellEscape).toBe(false);
      expect(fs.write).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'main.latexapp.json' }),
        JSON.stringify(doc.config, null, 2) + '\n',
      );
    },
  );
});
describe('Build-Grenzen', () => {
  it('startet bei fehlgeschlagenem Speichern keinen Build', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    const app = controller(doc);
    app.edit(doc.id, 'edited');
    fs.write.mockRejectedValueOnce(new Error('Disk full'));
    const build = vi.spyOn(app.bridge, 'build');
    await expect(app.build('draft')).rejects.toThrow('Disk full');
    expect(build).not.toHaveBeenCalled();
    expect(app.state.busy).toBe(false);
    expect(dirty(doc)).toBe(true);
  });
  it('bricht vor dem Schreiben ab, wenn die Ordnerkonfiguration abgebrochen wird', async () => {
    const doc = document();
    doc.config.variants[0].name = 'Edited';
    const app = controller(doc);
    const dir = { resolve: vi.fn(async () => ['main.tex']) };
    Object.assign(window, { showDirectoryPicker: vi.fn(async () => dir) });
    fs.readConfig.mockResolvedValue({ config: defaultConfig(), raw: 'existing' });
    vi.spyOn(app, 'ask').mockResolvedValue(2);
    await expect(app.build('draft')).rejects.toMatchObject({ name: 'AbortError' });
    expect(fs.write).not.toHaveBeenCalled();
    expect(doc.dir).toBeUndefined();
  });
  it('speichert vor Upload und verwendet den gespeicherten Snapshot', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    const app = controller(doc);
    app.edit(doc.id, 'snapshot');
    const sequence: string[] = [];
    fs.write.mockImplementationOnce(async () => {
      sequence.push('save');
      app.edit(doc.id, 'new unsaved edit');
    });
    fs.collectFiles.mockResolvedValue([{ path: doc.name, file: new File(['stale'], doc.name) }]);
    vi.spyOn(app.bridge, 'workspace').mockResolvedValue({ id: 'workspace' });
    const upload = vi.spyOn(app.bridge, 'upload').mockImplementation(async (_id, _path, file) => {
      sequence.push('upload');
      expect(await file.text()).toBe('snapshot');
    });
    vi.spyOn(app.bridge, 'build').mockImplementation(async (request) => {
      sequence.push('build');
      expect(request.variants).toHaveLength(1);
      return { id: 'job' };
    });
    vi.spyOn(app.bridge, 'status').mockResolvedValue({
      id: 'job',
      state: 'done',
      progress: 'Fertig',
      results: [],
    });
    vi.spyOn(app.bridge, 'release').mockResolvedValue({});
    await app.build('draft');
    expect(sequence).toEqual(['save', 'upload', 'build']);
    expect(upload).toHaveBeenCalledOnce();
    expect(dirty(doc)).toBe(true);
  });
});
describe('Endversion', () => {
  it('baut und exportiert beide Ausgaben nach gemeinsamer Überschreibbestätigung', async () => {
    const { app, build, ask } = finalController([
      { variant: 'arbeitsblatt', ok: true, diagnostics: [], log: '' },
      { variant: 'loesung', ok: true, diagnostics: [], log: '' },
    ]);
    await app.build('final');
    expect(build.mock.lastCall?.[0].variants.map((variant) => variant.id)).toEqual([
      'arbeitsblatt',
      'loesung',
    ]);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'PDFs ersetzen' }));
    expect(fs.write.mock.calls.map(([handle]) => handle.name)).toEqual([
      'main.tex',
      'main (Arbeitsblatt).pdf',
      'main (Lösung).pdf',
    ]);
    expect(app.state.status).toBe('Fertig');
  });
  it('belässt vorhandene PDFs bei einem Teilerfolg unangetastet', async () => {
    const { app, ask, getFileHandle } = finalController([
      { variant: 'arbeitsblatt', ok: true, diagnostics: [], log: '' },
      { variant: 'loesung', ok: false, diagnostics: [], log: 'Fehler' },
    ]);
    await app.build('final');
    expect(getFileHandle).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(fs.write.mock.calls.map(([handle]) => handle.name)).toEqual(['main.tex']);
    expect(app.state.status).toBe('Teilweise fehlgeschlagen');
    expect(app.active?.preview?.variant).toBe('arbeitsblatt');
  });
});
describe('Tabs und Wiederöffnung', () => {
  it('persistiert nur die letzte Referenz ohne Dokumentinhalt', async () => {
    const doc = document();
    const app = controller(doc);
    app.edit(doc.id, 'secret');
    app.activate(doc.id);
    await vi.waitFor(() => expect(fs.lastDocument).toHaveBeenCalled());
    expect(fs.lastDocument).toHaveBeenLastCalledWith({ file: doc.file, dir: undefined });
  });
  it('lädt nur den gespeicherten letzten Tab', async () => {
    const doc = document();
    const app = controller();
    app.state.documents = [];
    fs.lastDocument.mockResolvedValue({ file: doc.file } as never);
    await app.init();
    expect(app.state.documents).toHaveLength(1);
    expect(app.active?.text).toBe('saved');
  });
  it('schließt bei Abbrechen keinen ungespeicherten Tab', async () => {
    const app = controller();
    app.edit('main.tex', 'edited');
    vi.spyOn(app, 'ask').mockResolvedValue(2);
    await app.close('main.tex');
    expect(app.state.documents).toHaveLength(1);
    expect(fs.write).not.toHaveBeenCalled();
  });
  it('vergisst einen verworfenen Tab ohne Recovery-Daten', async () => {
    const app = controller();
    app.edit('main.tex', 'secret');
    vi.spyOn(app, 'ask').mockResolvedValue(1);
    await app.close('main.tex');
    expect(app.state.documents).toHaveLength(0);
    expect(fs.write).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(fs.lastDocument).toHaveBeenLastCalledWith(null));
  });
});

describe('Diagnose-Sprünge', () => {
  it('springt bei einer Diagnose der aktiven Datei in deren Zeile', () => {
    const app = controller();

    app.jump({ severity: 'error', message: 'Fehler', file: 'main.tex', line: 3 });

    expect(app.state.jump).toMatchObject({ id: 'main.tex', line: 3 });
  });

  it('ignoriert Diagnosen aus nicht geöffneten Dateien', () => {
    const app = controller();

    app.jump({ severity: 'error', message: 'Fehler', file: 'fremd.tex', line: 3 });

    expect(app.state.jump).toBeUndefined();
  });
});

describe('Gemeinsame Präambel', () => {
  it('speichert die Präambel global und verwirft die Aktualität aller Vorschauen', () => {
    const app = controller();
    app.state.documents.push(document('second.tex'));
    const configurations = app.state.documents.map((doc) => JSON.stringify(doc.config));
    const store = vi.spyOn(localStorage, 'setItem');
    app.setPreamble({ enabled: true, text: '\\documentclass{article}' });
    expect(store).toHaveBeenCalledWith('preamble', JSON.stringify(app.state.preamble));
    expect(app.state.documents.every((doc) => doc.revision === 1)).toBe(true);
    expect(app.state.documents.map((doc) => JSON.stringify(doc.config))).toEqual(configurations);
    expect(app.state.documents.some(dirty)).toBe(false);
    expect(fs.write).not.toHaveBeenCalled();
  });
  it('verhindert Builds mit leerer aktiver Präambel vor dem Speichern', async () => {
    const app = controller();
    app.state.preamble = { enabled: true, text: '  ' };
    await expect(app.build('draft')).rejects.toThrow('Präambel');
    expect(fs.write).not.toHaveBeenCalled();
    expect(app.bridge.connect).not.toHaveBeenCalled();
  });
  it('verhindert den neuen Build bei einer älteren Bridge', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    const app = controller(doc);
    app.state.preamble = { enabled: true, text: '\\documentclass{article}' };
    await expect(app.build('draft')).rejects.toThrow('Bridge aktualisieren');
    expect(fs.collectFiles).not.toHaveBeenCalled();
  });
  it('sendet den Lösungsschalter nur für Entwürfe ohne Änderung der Variantenkonfiguration', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    const app = controller(doc);
    app.state.preamble = { enabled: true, text: '\\documentclass{article}' };
    vi.mocked(app.bridge.connect).mockResolvedValue({
      version: '1',
      engines: ['lualatex'],
      tools: [],
      preamble: true,
    });
    fs.collectFiles.mockResolvedValue([{ path: doc.name, file: new File([doc.text], doc.name) }]);
    vi.spyOn(app.bridge, 'workspace').mockResolvedValue({ id: 'workspace' });
    vi.spyOn(app.bridge, 'upload').mockResolvedValue(undefined);
    const build = vi.spyOn(app.bridge, 'build').mockResolvedValue({ id: 'job' });
    vi.spyOn(app.bridge, 'status').mockResolvedValue({
      id: 'job',
      state: 'done',
      progress: 'Fertig',
      results: [],
    });
    vi.spyOn(app.bridge, 'release').mockResolvedValue({});
    await app.build('draft');
    expect(build).toHaveBeenLastCalledWith(
      expect.objectContaining({ preamble: app.state.preamble.text, shellEscape: true, solution: false }),
    );
    app.setSolution(true);
    expect(doc.revision).toBe(1);
    await app.build('draft');
    expect(build).toHaveBeenLastCalledWith(expect.objectContaining({ solution: true }));
    await app.build('final');
    expect(build.mock.lastCall?.[0]).not.toHaveProperty('solution');
    expect(build.mock.lastCall?.[0].variants.map((variant) => variant.solution)).toEqual([false, true]);
    expect(doc.config).not.toHaveProperty('preamble');
    expect(doc.config).not.toHaveProperty('solution');
    expect(fs.write).toHaveBeenCalledTimes(3);
  });
  it('deaktiviert den Lösungsschalter ohne gemeinsame Präambel', () => {
    const app = controller();
    app.setSolution(true);
    expect(app.state.solution).toBe(false);
    expect(app.active!.revision).toBe(0);
  });
  it('überträgt nur die von der Bridge angeforderten Dateien', async () => {
    const doc = document();
    doc.dir = { resolve: async () => [doc.name] } as unknown as FileSystemDirectoryHandle;
    doc.preview = { job: 'previous-job', workspace: 'previous-workspace', variant: 'student', revision: 0 };
    const app = controller(doc);
    app.state.preamble = { enabled: false, text: '' };
    fs.collectFiles.mockResolvedValue([
      { path: doc.name, file: new File([doc.text], doc.name) },
      { path: 'image.pdf', file: new File(['unchanged'], 'image.pdf') },
    ]);
    const workspace = vi
      .spyOn(app.bridge, 'workspace')
      .mockResolvedValue({ id: 'next', missing: [doc.name] });
    const upload = vi.spyOn(app.bridge, 'upload').mockResolvedValue(undefined);
    vi.spyOn(app.bridge, 'build').mockResolvedValue({ id: 'job' });
    vi.spyOn(app.bridge, 'status').mockResolvedValue({
      id: 'job',
      state: 'done',
      progress: 'Fertig',
      results: [],
    });
    vi.spyOn(app.bridge, 'release').mockResolvedValue({});
    await app.build('draft');
    expect(workspace).toHaveBeenCalledWith('previous-workspace', [
      expect.objectContaining({ path: doc.name, hash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      expect.objectContaining({ path: 'image.pdf', size: 9, hash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith('next', doc.name, expect.any(Blob));
  });
  it('legt neue Dokumente mit leerer Dokumentumgebung ohne Präambel an', () => {
    const app = controller();
    app.newDocument();
    expect(app.active!.text).toBe('\\begin{document}\n\\end{document}\n');
    expect(app.active!.config).not.toHaveProperty('preamble');
  });
});
