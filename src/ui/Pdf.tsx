import { useEffect, useRef } from 'react';
import { Maximize } from 'lucide-react';
import { PdfViewer } from '../pdf/viewer';
import type { SyncLocation } from '../domain/types';
export function Pdf({
  url,
  stale,
  target,
  onSync,
  onError,
}: {
  url?: string;
  stale: boolean;
  target?: SyncLocation;
  onSync: (location: SyncLocation) => void;
  onError: (error: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<PdfViewer | null>(null);
  const staleRef = useRef(stale);
  staleRef.current = stale;
  const sync = useRef(onSync);
  const error = useRef(onError);
  sync.current = onSync;
  error.current = onError;
  useEffect(() => {
    if (!host.current) return;
    const instance = new PdfViewer(
      host.current,
      () => undefined,
      (point) => sync.current(point),
      (message) => error.current(message),
      () => !staleRef.current,
    );
    viewer.current = instance;
    if (url) void instance.load(url);
    return () => {
      instance.destroy();
      viewer.current = null;
    };
  }, [url]);
  useEffect(() => {
    if (target) viewer.current?.show(target);
  }, [target]);
  return (
    <section className="pdf-pane">
      <div className="pdf-surface">
        <div
          ref={host}
          className="pdf-scroll"
          hidden={!url}
          aria-label="PDF-Vorschau"
          title="Lupe: linke Maustaste gedrückt halten. Zum Quelltext: Strg/Cmd + Klick."
        />
        {url && (
          <button
            className="pdf-fit-page"
            title="An Seite anpassen"
            aria-label="An Seite anpassen"
            onClick={() => viewer.current?.fit('page')}
          >
            <Maximize size={16} />
          </button>
        )}
        {!url && (
          <div className="pdf-empty">
            <div className="paper-outline">
              <span />
              <span />
              <i />
              <span />
              <span />
              <span />
              <i />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
