import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ClearWinter render boundary caught an error:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen bg-[#F6F7F8] flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h1 className="font-display text-xl font-semibold text-slate-900">
              Something went wrong displaying this view
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your saved household profile and selections remain safe in your browser. Reload the view to continue.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors cursor-pointer"
            >
              Reload Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
