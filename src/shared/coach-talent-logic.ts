/**
 * Coach talent-tree bookkeeping shared by the editor dialog (preview) and the
 * main-process write (truth). Mirrors the state machine observed in the game's
 * own saves (RESEARCH "Coach talent trees"): a node is Owned (2) only under an
 * Owned parent, an Owned node's children are Purchasable (1), everything else
 * is NotOwned (0); the archetype node (index 0) is the gate and reads Locked
 * (3) while its prerequisite is unmet.
 */
import type { CoachTalentSubTree } from './coach-talents.ts';

export const TALENT_NOT_OWNED = 0;
export const TALENT_PURCHASABLE = 1;
export const TALENT_OWNED = 2;
export const TALENT_LOCKED = 3;

/** Node indices currently owned in a subtree's status vector. */
export function ownedSet(status: number[]): Set<number> {
  const out = new Set<number>();
  status.forEach((s, i) => {
    if (s === TALENT_OWNED) out.add(i);
  });
  return out;
}

/** Own a node and every ancestor above it (the game only sells under an owned parent). */
export function withNodeOwned(tree: CoachTalentSubTree, owned: Set<number>, index: number): Set<number> {
  const next = new Set(owned);
  let cur: number | null = index;
  while (cur !== null) {
    next.add(cur);
    cur = tree.nodes[cur]?.parent ?? null;
  }
  return next;
}

/** Release a node and everything that hangs off it. */
export function withNodeReleased(tree: CoachTalentSubTree, owned: Set<number>, index: number): Set<number> {
  const next = new Set(owned);
  const stack = [index];
  while (stack.length) {
    const i = stack.pop()!;
    next.delete(i);
    for (const c of tree.nodes[i]?.children ?? []) stack.push(c);
  }
  return next;
}

/**
 * The full status vector the save should hold for a wanted owned set. Nodes
 * beyond the subtree's node count stay as they were (always 0 in real saves).
 * An unowned archetype node reads Purchasable — the game re-evaluates its
 * gate natively and may relock it if the prerequisite is genuinely unmet.
 */
export function statusesFor(tree: CoachTalentSubTree, previous: number[], owned: Set<number>): number[] {
  const out = previous.slice();
  for (const n of tree.nodes) {
    if (owned.has(n.index)) out[n.index] = TALENT_OWNED;
    else if (n.parent === null || owned.has(n.parent)) out[n.index] = TALENT_PURCHASABLE;
    else out[n.index] = TALENT_NOT_OWNED;
  }
  return out;
}

/** Points the change adds to (or refunds from) the subtree's paid ledger. */
export function costDelta(tree: CoachTalentSubTree, before: Set<number>, after: Set<number>): number {
  let d = 0;
  for (const n of tree.nodes) {
    const was = before.has(n.index);
    const is = after.has(n.index);
    if (is && !was) d += n.cost;
    if (was && !is) d -= n.cost;
  }
  return d;
}

/** True when the wanted set respects the tree (every owned node's parent is owned). */
export function ownedSetIsClosed(tree: CoachTalentSubTree, owned: Set<number>): boolean {
  for (const i of owned) {
    const n = tree.nodes[i];
    if (!n) return false;
    if (n.parent !== null && !owned.has(n.parent)) return false;
  }
  return true;
}
