/**
 * Background motion: small neon shapes, each on its own looping path.
 * - "wave" items combine two sine motions (X and Y at different speeds) = Lissajous curves and figure-eights
 * - "orbit" items circle a point at constant speed
 * Outlined shapes also spin slowly. Every loop ends where it starts, so nothing ever jumps.
 * Pure CSS transforms, so it stays smooth.
 */
type Color = 'pink' | 'green' | 'orange' | 'yellow' | 'blue' | 'sky' | 'purple' | 'cyan';
type Shape = 'dot' | 'ring' | 'triangle' | 'square' | 'diamond' | 'plus' | 'hexagon';
type Common = { x: string; y: string; size: number; color: Color; shape: Shape; pulse: number; delay: number; spin?: number; ccw?: boolean };
type Item =
  | (Common & { pattern: 'wave'; ax: string; ay: string; dx: number; dy: number })
  | (Common & { pattern: 'orbit'; r: string; dur: number; reverse?: boolean });

const items: Item[] = [
  { pattern: 'wave', shape: 'triangle', color: 'pink', x: '12%', y: '20%', size: 20, ax: '9vw', ay: '7vh', dx: 11, dy: 7.3, pulse: 3.1, delay: -2, spin: 14 },
  { pattern: 'wave', shape: 'dot', color: 'green', x: '78%', y: '16%', size: 8, ax: '7vw', ay: '11vh', dx: 9, dy: 18, pulse: 2.6, delay: -5 },
  { pattern: 'orbit', shape: 'square', color: 'yellow', x: '26%', y: '72%', size: 16, r: '8vmin', dur: 22, pulse: 2.2, delay: -7, spin: 18, ccw: true },
  { pattern: 'wave', shape: 'ring', color: 'sky', x: '55%', y: '84%', size: 18, ax: '12vw', ay: '5vh', dx: 16, dy: 10.7, pulse: 4, delay: -3 },
  { pattern: 'orbit', shape: 'diamond', color: 'orange', x: '87%', y: '62%', size: 16, r: '12vmin', dur: 30, reverse: true, pulse: 1.8, delay: -11, spin: 20 },
  { pattern: 'wave', shape: 'dot', color: 'blue', x: '40%', y: '10%', size: 9, ax: '6vw', ay: '6vh', dx: 8.5, dy: 12.75, pulse: 2.9, delay: -1 },
  { pattern: 'orbit', shape: 'hexagon', color: 'purple', x: '7%', y: '52%', size: 20, r: '6vmin', dur: 18, pulse: 3.4, delay: -4, spin: 24 },
  { pattern: 'wave', shape: 'plus', color: 'cyan', x: '66%', y: '38%', size: 14, ax: '15vw', ay: '9vh', dx: 21, dy: 13, pulse: 2.1, delay: -9, spin: 16, ccw: true },
  { pattern: 'orbit', shape: 'dot', color: 'pink', x: '48%', y: '48%', size: 7, r: '24vmin', dur: 46, pulse: 2.4, delay: -20 },
  { pattern: 'wave', shape: 'triangle', color: 'green', x: '22%', y: '38%', size: 14, ax: '5vw', ay: '10vh', dx: 7, dy: 14, pulse: 1.7, delay: -6, spin: 12, ccw: true },
  { pattern: 'orbit', shape: 'ring', color: 'orange', x: '70%', y: '88%', size: 14, r: '9vmin', dur: 26, reverse: true, pulse: 3, delay: -13 },
  { pattern: 'wave', shape: 'square', color: 'blue', x: '92%', y: '30%', size: 18, ax: '4vw', ay: '12vh', dx: 13, dy: 17, pulse: 4.4, delay: -8, spin: 22 },
  { pattern: 'wave', shape: 'dot', color: 'yellow', x: '34%', y: '90%', size: 8, ax: '10vw', ay: '4vh', dx: 12, dy: 6, pulse: 2.3, delay: -10 },
  { pattern: 'orbit', shape: 'diamond', color: 'sky', x: '60%', y: '12%', size: 13, r: '7vmin', dur: 15, pulse: 1.9, delay: -5, spin: 10, ccw: true },
  { pattern: 'wave', shape: 'hexagon', color: 'pink', x: '84%', y: '82%', size: 16, ax: '6vw', ay: '8vh', dx: 10, dy: 15, pulse: 3.6, delay: -12, spin: 26, ccw: true },
  { pattern: 'orbit', shape: 'plus', color: 'yellow', x: '16%', y: '86%', size: 12, r: '10vmin', dur: 34, pulse: 2.7, delay: -16, spin: 14 },
  { pattern: 'wave', shape: 'dot', color: 'purple', x: '4%', y: '14%', size: 10, ax: '5vw', ay: '9vh', dx: 12.5, dy: 8.3, pulse: 3.3, delay: -3 },
  { pattern: 'wave', shape: 'triangle', color: 'orange', x: '96%', y: '50%', size: 15, ax: '3vw', ay: '14vh', dx: 9.5, dy: 19, pulse: 2.5, delay: -7, spin: 17 },
];

function Glyph({ shape }: { shape: Shape }) {
  switch (shape) {
    case 'triangle': return <svg viewBox="0 0 24 24"><polygon points="12,3 21.5,19.5 2.5,19.5" /></svg>;
    case 'square': return <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2.5" /></svg>;
    case 'diamond': return <svg viewBox="0 0 24 24"><polygon points="12,2.5 21.5,12 12,21.5 2.5,12" /></svg>;
    case 'plus': return <svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" /></svg>;
    case 'hexagon': return <svg viewBox="0 0 24 24"><polygon points="12,2.5 20.5,7.25 20.5,16.75 12,21.5 3.5,16.75 3.5,7.25" /></svg>;
    default: return null; // dot and ring are drawn with CSS
  }
}

export default function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="glow g1" />
      <span className="glow g2" />
      {items.map((item, i) => {
        const node = (
          <span
            className={`fx-dot ${item.shape} c-${item.color} ${item.ccw ? 'ccw' : ''}`}
            style={{ '--size': `${item.size}px`, '--pulse': `${item.pulse}s`, '--delay': `${item.delay}s`, '--spin': `${item.spin ?? 20}s` } as React.CSSProperties}
          >
            <Glyph shape={item.shape} />
          </span>
        );
        return item.pattern === 'wave' ? (
          <span key={i} className="fx-x" style={{ left: item.x, top: item.y, '--ax': item.ax, '--dx': `${item.dx}s`, '--delay': `${item.delay}s` } as React.CSSProperties}>
            <span className="fx-y" style={{ '--ay': item.ay, '--dy': `${item.dy}s`, '--delay': `${item.delay}s` } as React.CSSProperties}>{node}</span>
          </span>
        ) : (
          <span key={i} className="fx-anchor" style={{ left: item.x, top: item.y }}>
            <span className={`fx-orbit ${item.reverse ? 'rev' : ''}`} style={{ '--r': item.r, '--dur': `${item.dur}s`, '--delay': `${item.delay}s` } as React.CSSProperties}>{node}</span>
          </span>
        );
      })}
    </div>
  );
}
