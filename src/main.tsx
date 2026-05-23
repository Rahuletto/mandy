import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ui";

async function bootstrap() {
	if (import.meta.env.VITE_E2E === "1") {
		const { setupE2EMocks } = await import("./e2e/setupMocks");
		setupE2EMocks();
	}

	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<ErrorBoundary>
				<App />
			</ErrorBoundary>
		</React.StrictMode>,
	);
}

void bootstrap();
