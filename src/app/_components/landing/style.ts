import type { CSSProperties } from "react";

/** Variables CSS en línea (--i, --delay, --depth…) con el tipo que espera `style`. */
export const cssVars = (vars: Record<`--${string}`, string | number>) =>
  vars as CSSProperties;
