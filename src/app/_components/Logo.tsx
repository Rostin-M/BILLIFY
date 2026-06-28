import Image from "next/image";

type LogoSize = "sm" | "md" | "lg";

const sizeMap: Record<LogoSize, number> = {
  sm: 28,
  md: 56,
  lg: 128,
};

export function Logo({ size = "md", className }: { size?: LogoSize; className?: string }) {
  const px = sizeMap[size];
  return (
    <Image
      src="/logo.png"
      alt="BILLIFY"
      width={px}
      height={px}
      className={`logo-eagle object-contain${className ? ` ${className}` : ""}`}
      priority={size !== "sm"}
    />
  );
}
