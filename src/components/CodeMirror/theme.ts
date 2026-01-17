import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const colors = {
    background: "#171313",
    inset: "#1d1919",
    card: "#231f1f",
    inputbox: "#2d2929",
    accent: "#ff6141",
    text: "#f2f2f2",
    muted: "#6e6a6a",
    subtle: "#4a4646",
    selection: "rgba(255, 97, 65, 0.20)",
    cursor: "#ff6141",
    string: "#ffab91",
    keyword: "#ff6141",
    number: "#ffcc80",
    boolean: "#ff8a65",
    null: "#bcaaa4",
    property: "#ffccbc",
    variable: "#f2f2f2",
    function: "#ff7043",
    operator: "#ff6141",
    comment: "#6d6363",
    tag: "#ff6141",
    attribute: "#ffab91",
    attributeValue: "#ffcc80",
    bracket: "#a1887f",
    punctuation: "#8d7b74",
    escape: "#ff8a65",
    regexp: "#ffcc80",
    link: "#ff7043",
    error: "#ef5350",
    lintError: "#ef5350",
    lintWarning: "#ffb74d",
    lintInfo: "#4fc3f7",
};

export const matchstickTheme = EditorView.theme({
    "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: "transparent !important",
        color: colors.text,
    },
    ".cm-scroller": {
        overflow: "auto",
        fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Monaco, 'Cascadia Mono', 'Segoe UI Mono', 'Roboto Mono', monospace",
    },
    ".cm-content": {
        padding: "12px 0",
        caretColor: colors.cursor,
    },
    ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: colors.cursor,
        borderLeftWidth: "2px",
    },
    ".cm-gutters": {
        backgroundColor: colors.inset,
        borderRight: `1px solid ${colors.subtle}`,
        color: colors.muted,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: "12px",
    },
    ".cm-lineNumbers": {
        minWidth: "40px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 12px 0 8px",
        textAlign: "right",
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(255, 97, 65, 0.05)",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "rgba(255, 97, 65, 0.05)",
        color: colors.accent,
    },
    ".cm-selectionBackground, ::selection": {
        backgroundColor: `${colors.selection} !important`,
    },
    "&.cm-focused .cm-selectionBackground": {
        backgroundColor: `${colors.selection} !important`,
    },
    ".cm-matchingBracket": {
        backgroundColor: "rgba(255, 97, 65, 0.30)",
        color: colors.accent,
        outline: "none",
    },
    ".cm-nonmatchingBracket": {
        backgroundColor: "rgba(239, 83, 80, 0.30)",
        color: colors.error,
    },
    ".cm-foldPlaceholder": {
        backgroundColor: colors.inputbox,
        color: colors.accent,
        border: `1px solid ${colors.subtle}`,
        padding: "0 6px",
        borderRadius: "3px",
        margin: "0 4px",
    },
    ".cm-foldGutter .cm-gutterElement": {
        color: colors.muted,
        cursor: "pointer",
        transition: "color 0.15s",
        "&:hover": {
            color: colors.accent,
        },
    },
    ".cm-tooltip": {
        backgroundColor: colors.card,
        border: `1px solid ${colors.subtle}`,
        borderRadius: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    },
    ".cm-tooltip-autocomplete": {
        "& > ul": {
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "12px",
        },
        "& > ul > li": {
            padding: "4px 8px",
        },
        "& > ul > li[aria-selected]": {
            backgroundColor: "rgba(255, 97, 65, 0.15)",
            color: colors.text,
        },
    },
    ".cm-completionIcon": {
        color: colors.accent,
    },
    ".cm-completionLabel": {
        color: colors.text,
    },
    ".cm-completionMatchedText": {
        color: colors.accent,
        fontWeight: "600",
        textDecoration: "none",
    },
    ".cm-searchMatch": {
        backgroundColor: "rgba(255, 97, 65, 0.25)",
        outline: `1px solid ${colors.accent}`,
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "rgba(255, 97, 65, 0.40)",
    },
    ".cm-lintRange-error": {
        backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='m0 3 l2 -2 l1 0 l2 2 l1 0' stroke='%23ef5350' fill='none' stroke-width='1'/></svg>")`,
    },
    ".cm-lintRange-warning": {
        backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='m0 3 l2 -2 l1 0 l2 2 l1 0' stroke='%23ffb74d' fill='none' stroke-width='1'/></svg>")`,
    },
    ".cm-lintRange-info": {
        backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='m0 3 l2 -2 l1 0 l2 2 l1 0' stroke='%234fc3f7' fill='none' stroke-width='1'/></svg>")`,
    },
    ".cm-lint-marker-error": {
        content: '""',
    },
    ".cm-lintPoint-error:after": {
        borderBottomColor: colors.lintError,
    },
    ".cm-lintPoint-warning:after": {
        borderBottomColor: colors.lintWarning,
    },
    ".cm-lintPoint-info:after": {
        borderBottomColor: colors.lintInfo,
    },
    ".cm-diagnostic": {
        padding: "4px 8px",
        borderRadius: "4px",
    },
    ".cm-diagnostic-error": {
        backgroundColor: "rgba(239, 83, 80, 0.15)",
        borderLeft: `3px solid ${colors.lintError}`,
    },
    ".cm-diagnostic-warning": {
        backgroundColor: "rgba(255, 183, 77, 0.15)",
        borderLeft: `3px solid ${colors.lintWarning}`,
    },
    ".cm-diagnostic-info": {
        backgroundColor: "rgba(79, 195, 247, 0.15)",
        borderLeft: `3px solid ${colors.lintInfo}`,
    },
}, { dark: true });

const matchstickHighlightStyle = HighlightStyle.define([
    { tag: t.comment, color: colors.comment, fontStyle: "italic" },
    { tag: t.lineComment, color: colors.comment, fontStyle: "italic" },
    { tag: t.blockComment, color: colors.comment, fontStyle: "italic" },
    { tag: t.string, color: colors.string },
    { tag: t.special(t.string), color: colors.string },
    { tag: t.docString, color: colors.string },
    { tag: t.regexp, color: colors.regexp },
    { tag: t.number, color: colors.number },
    { tag: t.integer, color: colors.number },
    { tag: t.float, color: colors.number },
    { tag: t.bool, color: colors.boolean },
    { tag: t.null, color: colors.null },
    { tag: t.keyword, color: colors.keyword, fontWeight: "500" },
    { tag: t.controlKeyword, color: colors.keyword, fontWeight: "500" },
    { tag: t.definitionKeyword, color: colors.keyword, fontWeight: "500" },
    { tag: t.moduleKeyword, color: colors.keyword, fontWeight: "500" },
    { tag: t.operatorKeyword, color: colors.keyword, fontWeight: "500" },
    { tag: t.operator, color: colors.operator },
    { tag: t.compareOperator, color: colors.operator },
    { tag: t.arithmeticOperator, color: colors.operator },
    { tag: t.logicOperator, color: colors.operator },
    { tag: t.bitwiseOperator, color: colors.operator },
    { tag: t.propertyName, color: colors.property },
    { tag: t.variableName, color: colors.variable },
    { tag: t.definition(t.variableName), color: colors.variable },
    { tag: t.definition(t.propertyName), color: colors.property },
    { tag: t.special(t.variableName), color: colors.function },
    { tag: t.function(t.variableName), color: colors.function },
    { tag: t.function(t.propertyName), color: colors.function },
    { tag: t.labelName, color: colors.property },
    { tag: t.className, color: colors.function },
    { tag: t.typeName, color: colors.function },
    { tag: t.namespace, color: colors.property },
    { tag: t.tagName, color: colors.tag, fontWeight: "500" },
    { tag: t.standard(t.tagName), color: colors.tag, fontWeight: "500" },
    { tag: t.attributeName, color: colors.attribute },
    { tag: t.attributeValue, color: colors.attributeValue },
    { tag: t.angleBracket, color: colors.bracket },
    { tag: t.documentMeta, color: colors.comment },
    { tag: t.processingInstruction, color: colors.comment },
    { tag: t.bracket, color: colors.bracket },
    { tag: t.paren, color: colors.bracket },
    { tag: t.squareBracket, color: colors.bracket },
    { tag: t.brace, color: colors.bracket },
    { tag: t.separator, color: colors.punctuation },
    { tag: t.punctuation, color: colors.punctuation },
    { tag: t.derefOperator, color: colors.punctuation },
    { tag: t.escape, color: colors.escape },
    { tag: t.meta, color: colors.muted },
    { tag: t.invalid, color: colors.error, textDecoration: "underline wavy" },
    { tag: t.atom, color: colors.boolean },
    { tag: t.unit, color: colors.number },
    { tag: t.literal, color: colors.string },
    { tag: t.self, color: colors.keyword },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.heading, fontWeight: "bold", color: colors.accent },
    { tag: t.heading1, fontWeight: "bold", color: colors.accent, fontSize: "1.4em" },
    { tag: t.heading2, fontWeight: "bold", color: colors.accent, fontSize: "1.2em" },
    { tag: t.link, color: colors.link, textDecoration: "underline" },
    { tag: t.url, color: colors.link },
    { tag: t.inserted, color: "#a5d6a7" },
    { tag: t.deleted, color: colors.error },
    { tag: t.changed, color: colors.function },
]);

export const matchstickHighlighting = syntaxHighlighting(matchstickHighlightStyle);

export const matchstickExtension = [matchstickTheme, matchstickHighlighting];
