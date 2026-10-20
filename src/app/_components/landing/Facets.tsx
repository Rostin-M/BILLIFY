/**
 * Facetas low-poly, el mismo lenguaje del águila del logo. Decorativo.
 * Los colores salen de las variables --ala-* (ver styles/landing.css).
 */
const POLYGONS = [
  ["0,0 180,0 90,120", "fill-ala-violet", 0.55],
  ["180,0 90,120 260,150", "fill-ala-indigo", 0.5],
  ["180,0 360,0 260,150", "fill-ala-blue", 0.45],
  ["360,0 260,150 430,170", "fill-ala-blue", 0.6],
  ["360,0 600,0 430,170", "fill-ala-cyan", 0.3],
  ["600,0 430,170 600,210", "fill-ala-cyan", 0.4],
  ["0,0 90,120 0,220", "fill-ala-navy", 0.6],
  ["90,120 0,220 150,280", "fill-ala-indigo", 0.45],
  ["90,120 260,150 150,280", "fill-ala-indigo", 0.35],
  ["260,150 150,280 340,300", "fill-ala-blue", 0.25],
  ["260,150 430,170 340,300", "fill-ala-blue", 0.3],
  ["430,170 600,210 340,300", "fill-ala-cyan", 0.2],
  ["600,210 340,300 600,400", "fill-ala-cyan", 0.15],
  ["0,220 150,280 0,400", "fill-ala-navy", 0.35],
] as const;

export function Facets({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      {POLYGONS.map(([points, fill, opacity]) => (
        <polygon
          key={points}
          points={points}
          className={fill}
          opacity={opacity}
        />
      ))}
    </svg>
  );
}
