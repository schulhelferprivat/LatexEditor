import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  onCancel,
  children,
  wide = false,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      aria-label={title}
    >
      <div className="dialog-title">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onCancel} title="Schließen" aria-label="Schließen">
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
