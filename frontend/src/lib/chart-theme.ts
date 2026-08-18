"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * One palette for CSS and for Plotly.
 *
 * Plotly draws SVG and cannot resolve `var(--churn)` itself, so the tokens are read off the
 * document at runtime instead of being copied into a second list of hex codes. That is what makes
 * "churn is always the same colour" (CONVENTIONS.md) true by construction rather than by
 * discipline — and it follows the theme without a second dark-mode palette.
 */
export interface ChartTheme {
  /** Always "leaving". Never used for anything else. */
  churn: string;
  /** Always "staying". */
  retained: string;
  /** Third series, and reference/ideal lines. */
  sand: string;
  /** Structure: connectors, baselines, the perfect-calibration diagonal. */
  base: string;
  /** Axis labels and tick text. */
  text: string;
}

/**
 * Used before hydration and in jsdom, where `getComputedStyle` returns nothing for custom
 * properties. These are the light-theme tokens converted to sRGB.
 */
const FALLBACK: ChartTheme = {
  churn: "#c04a2f",
  retained: "#3f8f88",
  sand: "#cfb790",
  base: "#8b8f99",
  text: "#5b6068",
};

const TOKENS: Record<keyof ChartTheme, string> = {
  churn: "--churn",
  retained: "--retained",
  sand: "--sand",
  base: "--chart-5",
  text: "--muted-foreground",
};

function readTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const entries = Object.entries(TOKENS).map(([key, token]) => {
    const value = styles.getPropertyValue(token).trim();
    return [key, value || FALLBACK[key as keyof ChartTheme]];
  });
  return Object.fromEntries(entries) as ChartTheme;
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    setTheme(readTheme());
  }, [resolvedTheme]);

  return theme;
}
