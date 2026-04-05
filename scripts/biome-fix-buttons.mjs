import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function walkTsx(dir, out = []) {
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, name.name);
		if (name.isDirectory()) walkTsx(p, out);
		else if (name.isFile() && (p.endsWith(".tsx") || p.endsWith(".jsx")))
			out.push(p);
	}
	return out;
}

/** Insert `type="button"` on native <button> opens that omit `type`. */
function fixButtons(content) {
	let i = 0;
	let out = "";
	while (i < content.length) {
		const idx = content.indexOf("<button", i);
		if (idx === -1) {
			out += content.slice(i);
			break;
		}
		out += content.slice(i, idx);
		const afterTag = idx + 7;
		const next = content[afterTag];
		// Skip custom elements like <Button or <buttonX
		if (next && /[A-Za-z]/.test(next)) {
			out += "<button";
			i = afterTag;
			continue;
		}
		const gt = content.indexOf(">", idx);
		if (gt === -1) {
			out += content.slice(idx);
			break;
		}
		const openTag = content.slice(idx, gt + 1);
		if (/\btype\s*=/.test(openTag)) {
			out += openTag;
		} else {
			out += `<button type="button"${openTag.slice(7)}`;
		}
		i = gt + 1;
	}
	return out;
}

const root = join(__dirname, "..", "src");
let changed = 0;
for (const file of walkTsx(root)) {
	const before = readFileSync(file, "utf8");
	const after = fixButtons(before);
	if (after !== before) {
		writeFileSync(file, after, "utf8");
		changed++;
	}
}
console.log(`Updated ${changed} files`);
