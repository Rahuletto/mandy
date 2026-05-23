import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	test: {
		environment: "happy-dom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["e2e/**", "node_modules/**", "src-tauri/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/bindings.ts",
				"src/**/*.d.ts",
				"src/test/**",
				"src/e2e/**",
			],
		},
		testTimeout: 15_000,
	},
});
