import type { Extension } from "@codemirror/state";
import { linter } from "@codemirror/lint";

export type Language =
  | "json"
  | "xml"
  | "html"
  | "text"
  | "shell"
  | "bash"
  | "javascript"
  | "typescript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "php";

export const languageExtensions: Record<string, () => Promise<Extension[]>> = {
  json: async () => {
    const { json, jsonParseLinter } = await import("@codemirror/lang-json");
    return [json(), linter(jsonParseLinter())];
  },
  xml: async () => {
    const { xml } = await import("@codemirror/lang-xml");
    return [xml()];
  },
  html: async () => {
    const { html } = await import("@codemirror/lang-html");
    return [html()];
  },
  javascript: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return [javascript()];
  },
  typescript: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return [javascript({ typescript: true })];
  },
  python: async () => {
    const { python } = await import("@codemirror/lang-python");
    return [python()];
  },
  go: async () => {
    const { go } = await import("@codemirror/lang-go");
    return [go()];
  },
  rust: async () => {
    const { rust } = await import("@codemirror/lang-rust");
    return [rust()];
  },
  java: async () => {
    const { java } = await import("@codemirror/lang-java");
    return [java()];
  },
  php: async () => {
    const { php } = await import("@codemirror/lang-php");
    return [php()];
  },
  shell: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return [StreamLanguage.define(shell)];
  },
  bash: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return [StreamLanguage.define(shell)];
  },
  text: async () => [],
};
