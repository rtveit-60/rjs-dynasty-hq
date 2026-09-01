/**
 * Poll-movement chip: a drawn arrow glyph and tabular count on tinted glass,
 * replacing the bare unicode triangles. Positive delta rises green, negative
 * falls red, zero renders a quiet flat dash, and `state` covers the poll's
 * entry/exit rows (NEW in the highlight gold, OUT in the fall red).
 */
export default function Delta({
  delta,
  state,
  size
}: {
  delta?: number;
  state?: 'new' | 'out';
  size?: 'sm';
}) {
  const sm = size === 'sm' ? ' sm' : '';
  if (state === 'new') return <span className={`mv new${sm}`}>NEW</span>;
  if (state === 'out') return <span className={`mv dn${sm}`}>OUT</span>;
  const d = delta ?? 0;
  if (d > 0) {
    return (
      <span className={`mv up${sm}`}>
        <i className="mv-g up" aria-hidden="true" />
        {d}
      </span>
    );
  }
  if (d < 0) {
    return (
      <span className={`mv dn${sm}`}>
        <i className="mv-g dn" aria-hidden="true" />
        {-d}
      </span>
    );
  }
  return (
    <span className={`mv flat${sm}`}>
      <i className="mv-g flat" aria-hidden="true" />
    </span>
  );
}
