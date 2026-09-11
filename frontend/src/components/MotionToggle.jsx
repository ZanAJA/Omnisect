// Header toggle for reduced motion. Visible to keyboard users; useful for
// anyone bothered by the parallax/birds/flow animations.

export default function MotionToggle({ reduced, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!reduced)}
      className="theme-toggle"
      aria-pressed={reduced}
      aria-label={reduced ? 'Enable motion' : 'Reduce motion'}
      title={reduced ? 'Motion off - click to re-enable' : 'Motion on - click to reduce'}
    >
      <span>{reduced ? 'Motion Off' : 'Motion On'}</span>
    </button>
  );
}
