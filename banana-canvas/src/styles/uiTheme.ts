import type { CSSProperties } from "react";

export interface UiTheme {
  isDark: boolean;
  colors: {
    canvas: string;
    panel: string;
    surface: string;
    surfaceRaised: string;
    borderSubtle: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    textDisabled: string;
    primary: string;
    primarySoft: string;
    primaryRing: string;
    creative: string;
    creativeSoft: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    white: string;
  };
  radii: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  shadow: {
    panel: string;
    node: string;
    selected: string;
  };
}

export function getUiTheme(isDark: boolean): UiTheme {
  return {
    isDark,
    colors: {
      canvas: isDark ? "#09090b" : "#f4f4f5",
      panel: isDark ? "#101014" : "#ffffff",
      surface: isDark ? "#1b1b20" : "#ffffff",
      surfaceRaised: isDark ? "#2a2a31" : "#f4f4f5",
      borderSubtle: isDark ? "#303039" : "#e4e4e7",
      border: isDark ? "#3f3f46" : "#d4d4d8",
      borderStrong: isDark ? "#52525b" : "#a1a1aa",
      text: isDark ? "#f4f4f5" : "#18181b",
      textMuted: isDark ? "#a1a1aa" : "#71717a",
      textSubtle: isDark ? "#71717a" : "#a1a1aa",
      textDisabled: isDark ? "#52525b" : "#d4d4d8",
      primary: "#3b82f6",
      primarySoft: isDark ? "rgba(59,130,246,0.16)" : "rgba(59,130,246,0.10)",
      primaryRing: "rgba(59,130,246,0.38)",
      creative: "#f97316",
      creativeSoft: isDark ? "rgba(249,115,22,0.14)" : "rgba(249,115,22,0.10)",
      success: "#22c55e",
      successSoft: isDark ? "rgba(34,197,94,0.14)" : "rgba(34,197,94,0.10)",
      warning: "#facc15",
      warningSoft: isDark ? "rgba(250,204,21,0.14)" : "rgba(250,204,21,0.14)",
      danger: "#ef4444",
      dangerSoft: isDark ? "rgba(239,68,68,0.14)" : "rgba(239,68,68,0.10)",
      white: "#ffffff",
    },
    radii: {
      xs: 4,
      sm: 6,
      md: 8,
      lg: 10,
      full: 999,
    },
    shadow: {
      panel: isDark ? "0 10px 30px rgba(0,0,0,0.42)" : "0 10px 30px rgba(24,24,27,0.12)",
      node: isDark ? "0 10px 24px rgba(0,0,0,0.34)" : "0 10px 24px rgba(24,24,27,0.12)",
      selected: "0 0 0 2px rgba(59,130,246,0.46)",
    },
  };
}

export function toolbarButtonStyle(ui: UiTheme, active = false): CSSProperties {
  return {
    minHeight: 24,
    background: active ? ui.colors.primary : ui.colors.surfaceRaised,
    color: active ? ui.colors.text : ui.colors.textMuted,
    border: `1px solid ${active ? ui.colors.primary : ui.colors.borderSubtle}`,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.2,
    padding: "4px 9px",
    borderRadius: ui.radii.sm,
    whiteSpace: "nowrap",
    boxShadow: ui.isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.9)",
    transition: "background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s",
  };
}

export function iconButtonStyle(
  ui: UiTheme,
  options: { active?: boolean; tone?: "neutral" | "primary" | "danger"; size?: number } = {},
): CSSProperties {
  const active = options.active ?? false;
  const tone = options.tone ?? "neutral";
  const size = options.size ?? 28;
  const toneColor = tone === "danger" ? ui.colors.danger : ui.colors.primary;
  const toneSoft = tone === "danger" ? ui.colors.dangerSoft : ui.colors.primarySoft;

  return {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${active ? toneColor : ui.colors.borderSubtle}`,
    borderRadius: ui.radii.sm,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    background: active ? toneColor : (tone === "danger" ? toneSoft : ui.colors.surfaceRaised),
    color: active ? ui.colors.white : (tone === "danger" ? ui.colors.danger : ui.colors.textMuted),
    boxShadow: ui.isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.9)",
    transition: "background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s",
  };
}

export function inputControlStyle(ui: UiTheme, compact = false): CSSProperties {
  return {
    background: ui.colors.surfaceRaised,
    borderColor: ui.colors.border,
    color: ui.colors.text,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: ui.radii.sm,
    outline: "none",
    fontSize: compact ? 11 : 12,
    lineHeight: 1.35,
  };
}

export function separatorStyle(ui: UiTheme, vertical = true): CSSProperties {
  return vertical
    ? { width: 1, height: 16, background: ui.colors.borderSubtle, margin: "0 2px" }
    : { width: 20, height: 1, background: ui.colors.borderSubtle, margin: "4px 0" };
}

export function statusPillStyle(ui: UiTheme, tone: "success" | "warning" | "danger" | "neutral"): CSSProperties {
  const colors = {
    success: [ui.colors.success, ui.colors.successSoft],
    warning: [ui.colors.creative, ui.colors.creativeSoft],
    danger: [ui.colors.danger, ui.colors.dangerSoft],
    neutral: [ui.colors.textSubtle, ui.colors.surface],
  } as const;
  const [color, background] = colors[tone];

  return {
    fontSize: 10,
    fontWeight: 500,
    color,
    border: `1px solid ${ui.colors.borderSubtle}`,
    borderRadius: ui.radii.full,
    padding: "1px 6px",
    whiteSpace: "nowrap",
    background,
  };
}
