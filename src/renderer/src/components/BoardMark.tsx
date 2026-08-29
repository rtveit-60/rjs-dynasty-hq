/** Crosshair beside a recruit's name: this one is on your board. */
export default function BoardMark() {
  return (
    <svg
      className="board-mark"
      viewBox="0 0 12 12"
      width="11"
      height="11"
      role="img"
      aria-label="On your board"
    >
      <title>On your recruiting board</title>
      <circle cx="6" cy="6" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6 0.4v2.4M6 9.2v2.4M0.4 6h2.4M9.2 6h2.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="6" cy="6" r="0.9" fill="currentColor" />
    </svg>
  );
}
