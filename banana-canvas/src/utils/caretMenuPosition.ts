import type { CSSProperties } from "react";

export interface CaretMenuPosition {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const MENU_WIDTH = 260;
const MENU_GAP = 8;
const MENU_MAX_HEIGHT = 220;

export function getCaretMenuPosition(input: HTMLInputElement | HTMLTextAreaElement): CaretMenuPosition {
  const rect = getCaretClientRect(input);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = clamp(rect.left, 8, Math.max(8, viewportWidth - MENU_WIDTH - 8));
  const spaceBelow = viewportHeight - rect.bottom - MENU_GAP;
  const spaceAbove = rect.top - MENU_GAP;

  if (spaceBelow >= 96 || spaceBelow >= spaceAbove) {
    return {
      left,
      top: Math.min(rect.bottom + MENU_GAP, viewportHeight - 80),
      maxHeight: Math.max(96, Math.min(MENU_MAX_HEIGHT, spaceBelow - 8)),
    };
  }

  return {
    left,
    bottom: Math.max(MENU_GAP, viewportHeight - rect.top + MENU_GAP),
    maxHeight: Math.max(96, Math.min(MENU_MAX_HEIGHT, spaceAbove - 8)),
  };
}

export function caretMenuStyle(
  position: CaretMenuPosition | null,
  colors: { background: string; borderColor: string },
): CSSProperties {
  return {
    position: "fixed",
    zIndex: 500,
    left: position?.left ?? 8,
    width: MENU_WIDTH,
    top: position?.top,
    bottom: position?.bottom,
    maxHeight: position?.maxHeight ?? MENU_MAX_HEIGHT,
    overflowY: "auto",
    overflowX: "hidden",
    background: colors.background,
    borderColor: colors.borderColor,
  };
}

function getCaretClientRect(input: HTMLInputElement | HTMLTextAreaElement): DOMRect {
  if (input instanceof HTMLInputElement) {
    return getInputCaretClientRect(input);
  }
  return getTextareaCaretClientRect(input);
}

function getInputCaretClientRect(input: HTMLInputElement): DOMRect {
  const rect = input.getBoundingClientRect();
  const selectionStart = input.selectionStart ?? input.value.length;
  const textBefore = input.value.slice(0, selectionStart);
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return rect;
  const style = window.getComputedStyle(input);
  context.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
  const paddingLeft = parseFloat(style.paddingLeft || "0");
  const paddingTop = parseFloat(style.paddingTop || "0");
  const scrollLeft = input.scrollLeft;
  const x = rect.left + paddingLeft + context.measureText(textBefore).width - scrollLeft;
  const y = rect.top + paddingTop;
  return new DOMRect(x, y, 1, rect.height);
}

function getTextareaCaretClientRect(textarea: HTMLTextAreaElement): DOMRect {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const properties = [
    "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth",
    "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight",
    "fontFamily", "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing",
    "wordSpacing", "tabSize",
  ] as const;

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  for (const property of properties) {
    mirror.style[property] = style[property];
  }

  const selectionStart = textarea.selectionStart ?? textarea.value.length;
  mirror.textContent = textarea.value.slice(0, selectionStart);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(selectionStart, selectionStart + 1) || "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const left = textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
  const top = textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
  const rect = new DOMRect(left, top, markerRect.width || 1, markerRect.height || parseFloat(style.lineHeight || "16"));
  document.body.removeChild(mirror);
  return rect;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
