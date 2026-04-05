import { Component, type ReactNode } from "react";
import { IoWarningOutline } from "react-icons/io5";

interface ErrorBoundaryProps {
	children: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("Error caught by boundary:", error, errorInfo);
	}

	handleReload = () => {
		window.location.reload();
	};

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-screen w-screen items-center justify-center bg-transparent">
					<div className="flex max-w-md flex-col items-center gap-6 p-8 text-center">
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
							<IoWarningOutline size={28} className="text-white/30" />
						</div>

						<div className="flex flex-col gap-2">
							<h1 className="font-semibold text-white text-xl">
								Oops! Something went wrong
							</h1>
							<p className="text-sm text-white/50">
								The app encountered an unexpected error. Try reloading the page
								or relaunching the app.
							</p>
						</div>

						{this.state.error && (
							<details className="w-full text-center">
								<summary className="cursor-pointer text-white/30 text-xs transition-colors hover:text-white/50">
									Show error details
								</summary>
								<pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-white/5 p-3 font-mono text-red text-xs">
									{this.state.error.message}
									{"\n\n"}
									{this.state.error.stack}
								</pre>
							</details>
						)}

						<div className="flex gap-3">
							<button
								type="button"
								onClick={this.handleReload}
								className="rounded-full bg-accent px-4 py-2 font-semibold text-background text-sm transition-colors hover:bg-accent/90"
							>
								Reload App
							</button>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
