import { useEffect, useMemo, useRef } from 'react';
import type { CoachTalentSubTree } from '../../../shared/coach-talents.ts';
import { branchLevel, branchesOf, withBranchLevel, withNodeOwned, withNodeReleased } from '../../../shared/coach-talent-logic.ts';
import { useDialog } from '../lib/dialog.ts';
import { Stepper } from './EditPlayerModal.tsx';

/**
 * One subtree of a coach's talent tree as a pop-up over the coach editor: the
 * archetype node as an unlock switch, then a tile per perk branch with a
 * stepper for its level (how many links of the branch are owned). Levels
 * above zero own the archetype node too; lowering a level releases the links
 * above it. Changes flow back to the editor's staged owned set; nothing is
 * written until the editor saves.
 */
export default function TalentTreeModal({
  tree,
  owned,
  locked,
  onChange,
  onClose
}: {
  tree: CoachTalentSubTree;
  owned: Set<number>;
  /** The save holds the archetype node Locked (prerequisite unmet) and nothing is staged. */
  locked: boolean;
  onChange: (next: Set<number>) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.info-overlay')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const branches = useMemo(() => branchesOf(tree), [tree]);
  const root = tree.nodes[0];
  const rootOwned = owned.has(0);
  const spent = tree.nodes.reduce((a, n) => a + (owned.has(n.index) ? n.cost : 0), 0);
  const total = tree.nodes.reduce((a, n) => a + n.cost, 0);

  return (
    <div className="ed-overlay tt-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel ed-panel-wide tt-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${tree.name} talent tree`}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">{tree.name}</span>
          <span className="ed-who">
            {tree.type}
            {tree.desc ? ` · ${tree.desc}` : ''}
          </span>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="tt-root">
          <label className="ed-toggle">
            <input
              type="checkbox"
              checked={rootOwned}
              onChange={() => onChange(rootOwned ? withNodeReleased(tree, owned, 0) : withNodeOwned(tree, owned, 0))}
            />
            <span>
              {root?.name ? `${root.name} (archetype node)` : `${tree.name} archetype node`}
              {root?.cost ? ` · ${root.cost} pts` : ''}
            </span>
            <small>
              {root?.desc && root.desc !== '---' ? root.desc : 'Unlocks the tree.'}
              {locked && tree.prereq?.desc ? ` The save holds it locked: ${tree.prereq.desc}.` : ''}
            </small>
          </label>
          <span className="tt-ledger">
            {owned.size}/{tree.nodes.length} owned · {spent}/{total} pts
          </span>
        </div>

        <div className="tt-grid">
          {branches.map((b) => {
            const level = branchLevel(owned, b);
            const next = level < b.chain.length ? tree.nodes[b.chain[level]] : null;
            return (
              <div key={b.chain[0]} className={`tt-tile ${level > 0 ? 'lit' : ''}`}>
                <div className="tt-tile-head">
                  <span className="tt-tile-title">{b.title}</span>
                  <Stepper
                    value={level}
                    min={0}
                    max={b.chain.length}
                    changed={false}
                    label={`${b.title} level`}
                    onChange={(n) => onChange(withBranchLevel(tree, owned, b, n))}
                  />
                </div>
                <ol className="tt-steps">
                  {b.chain.map((i, k) => {
                    const n = tree.nodes[i];
                    return (
                      <li key={i} className={k < level ? 'owned' : k === level ? 'next' : ''} title={n.desc}>
                        <span className="tt-step-name">{n.name}</span>
                        <span className="tt-step-cost">{n.cost}</span>
                      </li>
                    );
                  })}
                </ol>
                <div className="tt-tile-desc">
                  {level > 0 ? tree.nodes[b.chain[level - 1]].desc : next ? `Next: ${next.desc}` : ''}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ed-foot">
          <span className="ed-target">Changes stay staged in the coach editor until you save there.</span>
          <button type="button" className="btn primary ed-save" onClick={onClose}>
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
