import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const keyDecoration = Decoration.mark({ class: "cm-curl-key" });
const valueDecoration = Decoration.mark({ class: "cm-curl-value" });
const jsonKeyDecoration = Decoration.mark({ class: "cm-curl-json-key" });
const jsonValueDecoration = Decoration.mark({ class: "cm-curl-json-value" });

function getCurlDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();

  const headerRegex = /(--header|-H)\s+['"]([^:]+):\s*([^'"]+)['"]/g;
  let match;
  while ((match = headerRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const key = match[2];
    const value = match[3];

    const keyOffset = fullMatch.indexOf(key);
    const start = match.index + keyOffset;
    const keyEnd = start + key.length;

    const valueOffset = fullMatch.indexOf(value, keyOffset + key.length);
    const valueStart = match.index + valueOffset;
    const valueEnd = valueStart + value.length;

    if (start < keyEnd) builder.add(start, keyEnd, keyDecoration);
    if (valueStart < valueEnd)
      builder.add(valueStart, valueEnd, valueDecoration);
  }

  const jsonBlockRegex = /(--data|-d)\s+['"](\{[\s\S]*?\}|\[[\s\S]*?\])['"]/g;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const bodyWithQuotes = match[2];
    const bodyStart = match.index + fullMatch.indexOf(bodyWithQuotes);

    const innerKeyRegex = /"([^"]+)"\s*:/g;
    let innerMatch;
    while ((innerMatch = innerKeyRegex.exec(bodyWithQuotes)) !== null) {
      const key = innerMatch[1];
      const start = bodyStart + innerMatch.index + 1;
      const end = start + key.length;
      if (start < end) builder.add(start, end, jsonKeyDecoration);
    }

    const innerValueRegex = /:\s*("([^"]*)"|(-?\d+\.?\d*)|true|false|null)/g;
    while ((innerMatch = innerValueRegex.exec(bodyWithQuotes)) !== null) {
      const rawValue = innerMatch[1];
      if (!rawValue) continue;

      const isString = rawValue.startsWith('"');
      const startOffset = innerMatch[0].indexOf(rawValue);
      const start =
        bodyStart + innerMatch.index + startOffset + (isString ? 1 : 0);
      const end = start + rawValue.length - (isString ? 2 : 0);

      if (start < end) builder.add(start, end, jsonValueDecoration);
    }
  }

  return builder.finish();
}

export const curlHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getCurlDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getCurlDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
