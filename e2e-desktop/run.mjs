/**
 * Real Tauri binary E2E via tauri-driver + Selenium WebDriver.
 * Linux/Windows only (macOS has no WKWebView WebDriver). Skips elsewhere.
 */
import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Builder, By, Capabilities, until } from "selenium-webdriver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const SUPPORTED = new Set(["linux", "win32"]);
if (!SUPPORTED.has(process.platform)) {
	console.log(
		`[desktop-e2e] skip: platform ${process.platform} (use Linux CI or Windows for real binary tests)`,
	);
	process.exit(0);
}

const binaryName = process.platform === "win32" ? "Mandy.exe" : "Mandy";
const defaultBinary = path.join(
	rootDir,
	"src-tauri",
	"target",
	"debug",
	binaryName,
);

function resolveApplication() {
	const fromEnv = process.env.MANDY_BINARY?.trim();
	if (fromEnv) {
		return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(rootDir, fromEnv);
	}
	return defaultBinary;
}

let driver;
let tauriDriver;
let exitClean = false;

function cargoBin(name) {
	const ext = process.platform === "win32" ? ".exe" : "";
	return path.join(os.homedir(), ".cargo", "bin", `${name}${ext}`);
}

async function closeSession() {
	exitClean = true;
	try {
		await driver?.quit();
	} catch {
		/* ignore */
	}
	tauriDriver?.kill();
}

function onShutdown(fn) {
	const run = () => {
		try {
			fn();
		} finally {
			process.exit();
		}
	};
	for (const sig of ["exit", "SIGINT", "SIGTERM", "SIGHUP"]) {
		process.on(sig, run);
	}
}

onShutdown(() => {
	void closeSession();
});

async function main() {
	const application = resolveApplication();
	const reuseBinary = Boolean(process.env.MANDY_BINARY?.trim());

	if (reuseBinary) {
		console.log(`[desktop-e2e] using existing binary: ${application}`);
	} else {
		console.log("[desktop-e2e] building debug binary (no bundle)…");
		const build = spawnSync(
			"bun",
			["run", "tauri", "build", "--debug", "--no-bundle"],
			{ cwd: rootDir, stdio: "inherit", shell: false },
		);
		if (build.status !== 0) {
			process.exit(build.status ?? 1);
		}
	}

	if (!fs.existsSync(application)) {
		console.error(`[desktop-e2e] binary not found: ${application}`);
		process.exit(1);
	}

	const driverBin = cargoBin("tauri-driver");
	if (!fs.existsSync(driverBin)) {
		console.error(
			"[desktop-e2e] tauri-driver not installed. Run: cargo install tauri-driver --locked",
		);
		process.exit(1);
	}

	console.log("[desktop-e2e] starting tauri-driver…");
	tauriDriver = spawn(driverBin, [], {
		stdio: [null, process.stdout, process.stderr],
	});
	tauriDriver.on("error", (err) => {
		console.error("[desktop-e2e] tauri-driver error:", err);
		process.exit(1);
	});
	tauriDriver.on("exit", (code) => {
		if (!exitClean) {
			console.error("[desktop-e2e] tauri-driver exited:", code);
			process.exit(1);
		}
	});

	await new Promise((r) => setTimeout(r, 1500));

	const capabilities = new Capabilities();
	capabilities.set("tauri:options", { application });
	capabilities.setBrowserName("wry");

	driver = await new Builder()
		.withCapabilities(capabilities)
		.usingServer("http://127.0.0.1:4444/")
		.build();

	await driver.manage().setTimeouts({ implicit: 15_000 });

	await driver.executeScript("localStorage.clear();");

	const welcome = await driver.wait(
		until.elementLocated(By.css('[data-testid="welcome-page"]')),
		20_000,
	);
	assert.ok(await welcome.isDisplayed(), "welcome page visible");

	const projectSelector = await driver.findElement(
		By.css('[data-testid="project-selector"]'),
	);
	await projectSelector.click();

	const createMenu = await driver.findElement(
		By.css('[data-testid="create-project-menu"]'),
	);
	await createMenu.click();

	const blank = await driver.findElement(
		By.css('[data-testid="new-project-source-blank"]'),
	);
	await blank.click();

	const nameInput = await driver.findElement(
		By.css('[data-testid="new-project-name"]'),
	);
	await nameInput.clear();
	await nameInput.sendKeys("Desktop E2E");

	const submit = await driver.findElement(
		By.css('[data-testid="new-project-submit"]'),
	);
	await submit.click();

	const sidebar = await driver.wait(
		until.elementLocated(By.css('[data-testid="sidebar"]')),
		15_000,
	);
	assert.ok(
		await sidebar.isDisplayed(),
		"sidebar visible after project create",
	);

	const newRequest = await driver.findElement(
		By.css('[data-testid="new-request-button"]'),
	);
	await newRequest.click();

	const restType = await driver.findElement(
		By.css('[data-testid="request-type-request"]'),
	);
	await restType.click();

	const restEditor = await driver.wait(
		until.elementLocated(By.css('[data-testid="rest-editor"]')),
		15_000,
	);
	assert.ok(await restEditor.isDisplayed(), "REST editor opens in real app");

	console.log("[desktop-e2e] passed");
	await closeSession();
}

main().catch(async (err) => {
	console.error("[desktop-e2e] failed:", err);
	await closeSession();
	process.exit(1);
});
