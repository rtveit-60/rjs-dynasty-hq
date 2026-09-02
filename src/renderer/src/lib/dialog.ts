import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus discipline for an overlay panel: focus moves into the panel
 * when it opens, Tab cycles inside it, and focus returns to whatever opened
 * it when it closes. The panel carries tabIndex={-1} so it can hold focus
 * itself and a reader announces its label before any control.
 *
 * Listeners are native and scoped to the panel node, so a dialog rendered
 * elsewhere in the DOM (InfoDot portals to body) runs its own trap untouched,
 * and a dialog nested inside another (the editor inside a profile) claims the
 * Tab key before the outer panel sees it.
 *
 * onEscape, when given, closes on Esc at the capture phase — the same
 * discipline the other dialogs hand-roll — deferring to an open info dialog.
 */
export function useDialog(
  panel: RefObject<HTMLElement | null>,
  open = true,
  onEscape?: () => void
): void {
  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.focus({ preventScroll: true });

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // This panel owns the key from here down; an enclosing dialog must not
      // also wrap on it.
      e.stopPropagation();
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.getClientRects().length > 0
      );
      if (!items.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && el.contains(active) && active !== el;
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onTab);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !onEscape) return;
      if (document.querySelector('.info-overlay')) return;
      e.stopPropagation();
      onEscape();
    };
    if (onEscape) window.addEventListener('keydown', onKey, true);

    return () => {
      el.removeEventListener('keydown', onTab);
      if (onEscape) window.removeEventListener('keydown', onKey, true);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
