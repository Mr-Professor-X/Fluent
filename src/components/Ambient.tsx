/**
 * Background motion: four drifting neon lights plus small bubbles rising like a fluid.
 * Pure CSS animation, so it costs almost nothing and pauses for reduced-motion users.
 */
const bubbles = [
  { size: 18, left: '8%', dur: 17, delay: 0, sway: 40 },
  { size: 10, left: '19%', dur: 13, delay: 4, sway: -30 },
  { size: 26, left: '31%', dur: 22, delay: 2, sway: 55 },
  { size: 12, left: '44%', dur: 15, delay: 8, sway: -45 },
  { size: 34, left: '57%', dur: 26, delay: 5, sway: 35 },
  { size: 14, left: '68%', dur: 14, delay: 1, sway: -25 },
  { size: 22, left: '79%', dur: 20, delay: 9, sway: 50 },
  { size: 9, left: '88%', dur: 12, delay: 3, sway: -35 },
  { size: 16, left: '95%', dur: 18, delay: 11, sway: -50 },
];

export default function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="glow g1" />
      <span className="glow g2" />
      <span className="glow g3" />
      <span className="glow g4" />
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{ '--size': `${b.size}px`, '--left': b.left, '--dur': `${b.dur}s`, '--delay': `${b.delay}s`, '--sway': `${b.sway}px` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
