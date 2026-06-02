import type { StreamParser } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";

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
	| "kotlin"
	| "php"
	| "graphql"
	| "protobuf"
	| "c"
	| "csharp"
	| "clojure"
	| "dart"
	| "fsharp"
	| "objectivec"
	| "ocaml"
	| "powershell"
	| "r"
	| "ruby"
	| "swift"
	| "http";

async function legacyStreamLanguage(
	load: () => Promise<object>,
	key: string,
): Promise<Extension[]> {
	const { StreamLanguage } = await import("@codemirror/language");
	const mod = (await load()) as Record<string, StreamParser<unknown>>;
	return [StreamLanguage.define(mod[key])];
}

export const languageExtensions: Record<Language, () => Promise<Extension[]>> = {
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
	kotlin: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/clike"),
			"kotlin",
		),
	php: async () => {
		const { php } = await import("@codemirror/lang-php");
		// Snippets are often bare PHP (e.g. Laravel Http facade) without an opening tag.
		return [php({ plain: true })];
	},
	shell: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/shell"),
			"shell",
		),
	bash: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/shell"),
			"shell",
		),
	c: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/clike"),
			"c",
		),
	csharp: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/clike"),
			"csharp",
		),
	clojure: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/clojure"),
			"clojure",
		),
	dart: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/clike"),
			"dart",
		),
	fsharp: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/mllike"),
			"fSharp",
		),
	objectivec: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/clike"),
			"objectiveC",
		),
	ocaml: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/mllike"),
			"oCaml",
		),
	powershell: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/powershell"),
			"powerShell",
		),
	r: async () =>
		legacyStreamLanguage(() => import("@codemirror/legacy-modes/mode/r"), "r"),
	ruby: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/ruby"),
			"ruby",
		),
	swift: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/swift"),
			"swift",
		),
	http: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/http"),
			"http",
		),
	text: async () => [],
	graphql: async () => {
		const { graphql } = await import("cm6-graphql");
		return [graphql()];
	},
	protobuf: async () =>
		legacyStreamLanguage(
			() => import("@codemirror/legacy-modes/mode/protobuf"),
			"protobuf",
		),
};
