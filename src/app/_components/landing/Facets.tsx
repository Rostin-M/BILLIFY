/**
 * Facetas low-poly, el mismo lenguaje del águila del logo. Decorativo.
 * Se usa solo en el hero y en el CTA final.
 */
export function Facets({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <polygon points="0,0 180,0 90,120" fill="#6d28d9" opacity="0.55" />
      <polygon points="180,0 90,120 260,150" fill="#4f46e5" opacity="0.5" />
      <polygon points="180,0 360,0 260,150" fill="#2563eb" opacity="0.45" />
      <polygon points="360,0 260,150 430,170" fill="#1d4ed8" opacity="0.5" />
      <polygon points="360,0 600,0 430,170" fill="#0ea5e9" opacity="0.35" />
      <polygon points="600,0 430,170 600,210" fill="#22d3ee" opacity="0.4" />
      <polygon points="0,0 90,120 0,220" fill="#0a1f7a" opacity="0.6" />
      <polygon points="90,120 0,220 150,280" fill="#312e81" opacity="0.45" />
      <polygon points="90,120 260,150 150,280" fill="#3730a3" opacity="0.35" />
      <polygon points="260,150 150,280 340,300" fill="#2563eb" opacity="0.25" />
      <polygon points="260,150 430,170 340,300" fill="#0284c7" opacity="0.3" />
      <polygon points="430,170 600,210 340,300" fill="#22d3ee" opacity="0.2" />
      <polygon points="600,210 340,300 600,400" fill="#0ea5e9" opacity="0.15" />
      <polygon points="0,220 150,280 0,400" fill="#1e1b4b" opacity="0.35" />
    </svg>
  );
}
