import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface CaretMenuPortalProps {
  children: ReactNode;
}

export function CaretMenuPortal({ children }: CaretMenuPortalProps) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
