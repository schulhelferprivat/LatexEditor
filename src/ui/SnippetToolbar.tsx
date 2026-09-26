import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { snippetGroups, snippets, type Snippet } from '../editor/snippets';

type SnippetToolbarProps = {
  active: boolean;
  documentId: string | null;
  icons: Record<string, ComponentType<{ size?: number }>>;
  onInsert: (snippet: Snippet) => void;
};

export function nextMenuItemIndex(current: number, count: number, key: string) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (current + 1 + count) % count;
  if (key === 'ArrowUp') return (current - 1 + count) % count;
  return current;
}

export function SnippetToolbar({ active, documentId, icons, onInsert }: SnippetToolbarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const menuItems = useRef(new Map<string, HTMLButtonElement[]>());

  useEffect(() => {
    setOpen(null);
  }, [active, documentId]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, []);

  function focusItem(groupId: string, index: number) {
    requestAnimationFrame(() => menuItems.current.get(groupId)?.[index]?.focus());
  }

  function close(groupId: string) {
    setOpen(null);
    requestAnimationFrame(() => triggers.current.get(groupId)?.focus());
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>, groupId: string, count: number) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(groupId);
      focusItem(groupId, event.key === 'ArrowDown' ? 0 : count - 1);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(null);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>, groupId: string, count: number) {
    const items = menuItems.current.get(groupId) ?? [];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextMenuItemIndex(current < 0 ? 0 : current, count, event.key);
    if (next !== current && next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close(groupId);
    }
  }

  return (
    <div className="snippet-menu-list" ref={root} role="toolbar" aria-label="LaTeX-Snippets">
      {snippetGroups.map((group) => {
        const entries = group.snippets
          .map((id) => snippets.find((snippet) => snippet.id === id))
          .filter(Boolean) as Snippet[];
        const expanded = open === group.id;
        return (
          <div key={group.id} className="snippet-menu">
            <button
              ref={(element) => {
                if (element) triggers.current.set(group.id, element);
                else triggers.current.delete(group.id);
              }}
              className={expanded ? 'snippet-menu-trigger pressed' : 'snippet-menu-trigger'}
              type="button"
              disabled={!active}
              aria-expanded={expanded}
              aria-haspopup="menu"
              aria-controls={`snippet-menu-${group.id}`}
              onClick={() => setOpen((current) => (current === group.id ? null : group.id))}
              onKeyDown={(event) => onTriggerKeyDown(event, group.id, entries.length)}
            >
              {group.label}
            </button>
            {expanded && (
              <div
                id={`snippet-menu-${group.id}`}
                className="snippet-popover"
                role="menu"
                aria-label={group.label}
                onKeyDown={(event) => onMenuKeyDown(event, group.id, entries.length)}
              >
                {entries.map((snippet, index) => {
                  const Icon = icons[snippet.icon];
                  return (
                    <button
                      key={snippet.id}
                      ref={(element) => {
                        const items = menuItems.current.get(group.id) ?? [];
                        if (element) items[index] = element;
                        else items.splice(index, 1);
                        menuItems.current.set(group.id, items);
                      }}
                      className="snippet-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onInsert(snippet);
                        close(group.id);
                      }}
                    >
                      {group.showIcons !== false && (
                        <span className="snippet-menu-item-icon">
                          {snippet.id === 'gap' ? (
                            <span className="gap-snippet-icon">AB....CD</span>
                          ) : (
                            <Icon size={16} />
                          )}
                        </span>
                      )}
                      <span>{snippet.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
