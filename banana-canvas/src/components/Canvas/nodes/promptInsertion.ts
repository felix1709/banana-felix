export interface TextSelectionRange {
  start: number;
  end: number;
}

export interface AtQueryRange {
  index: number;
  text?: string;
}

export function readTextareaSelection(
  textarea: HTMLTextAreaElement | null,
  fallbackLength: number,
): TextSelectionRange {
  if (!textarea) return { start: fallbackLength, end: fallbackLength };
  return {
    start: textarea.selectionStart ?? fallbackLength,
    end: textarea.selectionEnd ?? textarea.selectionStart ?? fallbackLength,
  };
}

export function restoreTextareaSelection(
  textarea: HTMLTextAreaElement | null,
  cursor: number,
): void {
  const restore = () => {
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  };

  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 0);
}

export function insertMentionAtSelection(
  currentText: string,
  refName: string,
  selection: TextSelectionRange,
  atQuery?: AtQueryRange | null,
): { nextText: string; cursor: number } {
  const mention = `@${refName} `;
  const start = atQuery ? atQuery.index : selection.start;
  const queryEnd = atQuery
    ? atQuery.index + 1 + (atQuery.text?.length ?? Math.max(0, selection.start - atQuery.index - 1))
    : selection.end;
  const end = atQuery ? queryEnd : selection.end;
  const before = currentText.slice(0, start);
  const after = currentText.slice(end);
  const prefix = !atQuery && before.length > 0 && !/\s$/.test(before) ? " " : "";
  const nextText = `${before}${prefix}${mention}${after}`;

  return {
    nextText,
    cursor: before.length + prefix.length + mention.length,
  };
}
