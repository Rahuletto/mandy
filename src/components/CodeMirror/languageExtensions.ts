export type Language = "json" | "xml" | "html" | "text";

import { json, jsonParseLinter } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";

const jsonLinter = linter(jsonParseLinter());

export const languageExtensions: Record<Language, () => Extension[]> = {
    json: () => [json(), jsonLinter],
    xml: () => [xml()],
    html: () => [html()],
    text: () => [],
};
