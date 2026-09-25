import { type Range, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, lineNumberWidgetMarker } from '@codemirror/view';
import { foldEffect, foldGutter, foldState, foldedRanges, unfoldEffect } from '@codemirror/language';

const fadeDuration = 160;

class FoldGapMarker extends GutterMarker {
  elementClass = 'cm-fold-gap-gutter';

  constructor(private foldRange: { from: number; to: number }) {
    super();
  }

  eq(other: GutterMarker) {
    return (
      other instanceof FoldGapMarker &&
      this.foldRange.from === other.foldRange.from &&
      this.foldRange.to === other.foldRange.to
    );
  }

  toDOM(view: EditorView) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'cm-fold-gap-marker';
    marker.textContent = '⋮';
    marker.title = 'Eingeklappten Bereich ausklappen';
    marker.setAttribute('aria-label', marker.title);
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      view.dispatch({ effects: unfoldEffect.of(this.foldRange) });
    });
    return marker;
  }
}

class FoldGapWidget extends WidgetType {
  constructor(readonly range: { from: number; to: number }) {
    super();
  }

  eq(widget: FoldGapWidget) {
    return (
      widget instanceof FoldGapWidget &&
      this.range.from === widget.range.from &&
      this.range.to === widget.range.to
    );
  }

  get estimatedHeight() {
    return 18;
  }

  toDOM() {
    const spacer = document.createElement('div');
    spacer.className = 'cm-fold-gap-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }
}

export const foldGapWidgets = EditorView.decorations.compute([foldState], (state) => {
  const widgets: Range<Decoration>[] = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    widgets.push(
      Decoration.widget({ widget: new FoldGapWidget({ from, to }), block: true, side: -1 }).range(to + 1),
    );
  });
  return Decoration.set(widgets, true);
});

export const foldGapNumbers = lineNumberWidgetMarker.of((_view, widget) =>
  widget instanceof FoldGapWidget ? new FoldGapMarker(widget.range) : null,
);

export const visualFoldGutter = foldGutter({
  markerDOM(open) {
    const marker = document.createElement('span');
    marker.className = 'cm-fold-toggle';
    marker.title = open ? 'Umgebung einklappen' : 'Umgebung ausklappen';
    marker.setAttribute('aria-label', marker.title);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    triangle.setAttribute('d', open ? 'M3.5 5.5h9L8 11z' : 'M5.5 3.5v9L11 8z');
    triangle.setAttribute('fill', 'currentColor');
    icon.append(triangle);
    marker.append(icon);
    return marker;
  },
});

type FoldRange = { from: number; to: number };

function visibleLines(view: EditorView, ranges: readonly FoldRange[]) {
  return [...view.dom.querySelectorAll<HTMLElement>('.cm-content .cm-line')].filter((line) => {
    const position = view.posAtDOM(line);
    return ranges.some((range) => position >= range.from && position < range.to);
  });
}

export class FoldTransitions {
  private pending: ReturnType<typeof setTimeout> | undefined;
  private animations = new Set<Animation>();

  private animate(lines: HTMLElement[], from: number, to: number) {
    for (const line of lines) {
      const animation = line.animate([{ opacity: from }, { opacity: to }], {
        duration: fadeDuration,
        easing: 'ease-in-out',
        fill: from === 1 ? 'forwards' : 'none',
      });
      this.animations.add(animation);
      animation.onfinish = () => this.animations.delete(animation);
      animation.oncancel = () => this.animations.delete(animation);
    }
  }

  private cancel() {
    clearTimeout(this.pending);
    this.pending = undefined;
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }

  dispatch(transactions: readonly Transaction[], view: EditorView) {
    const folding = transactions.flatMap((transaction) =>
      transaction.effects.filter((effect) => effect.is(foldEffect)).map((effect) => effect.value),
    );
    const unfolding = transactions.flatMap((transaction) =>
      transaction.effects.filter((effect) => effect.is(unfoldEffect)).map((effect) => effect.value),
    );
    const changed = transactions.some((transaction) => transaction.docChanged);
    if (changed || folding.length || unfolding.length) this.cancel();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (folding.length && !changed && !reduceMotion) {
      const lines = visibleLines(view, folding);
      if (lines.length) {
        this.animate(lines, 1, 0);
        this.pending = setTimeout(() => {
          this.pending = undefined;
          if (!view.dom.isConnected) return this.cancel();
          view.update([view.state.update({ effects: folding.map((range) => foldEffect.of(range)) })]);
          this.cancel();
        }, fadeDuration);
        return;
      }
    }
    view.update(transactions);
    if (unfolding.length && !changed && !reduceMotion) this.animate(visibleLines(view, unfolding), 0, 1);
  }

  destroy() {
    this.cancel();
  }
}
