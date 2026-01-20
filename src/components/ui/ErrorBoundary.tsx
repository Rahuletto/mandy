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
        <div className="h-screen w-screen flex items-center justify-center bg-transparent">
          <div className="flex flex-col items-center gap-6 p-8 max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <IoWarningOutline size={28} className="text-white/30" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold text-white">
                Oops! Something went wrong
              </h1>
              <p className="text-sm text-white/50">
                The app encountered an unexpected error. Try reloading the page
                or relaunching the app.
              </p>
            </div>

            {this.state.error && (
              <details className="w-full text-center">
                <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors">
                  Show error details
                </summary>
                <pre className="mt-2 p-3 bg-white/5 rounded-lg text-xs text-red-400 overflow-auto max-h-32 font-mono">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-background font-semibold rounded-full text-sm transition-colors"
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
