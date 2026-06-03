import { Component, ErrorInfo, ReactNode } from 'react';

interface Props  { children: ReactNode; }
interface State  { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-background px-8 gap-6">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl"
            style={{ background: 'rgba(239,68,68,0.15)' }}>
            ⚠️
          </div>
          <div className="text-center">
            <h2 className="font-heading text-xl font-bold text-foreground mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/home'; }}
            className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
            Restart App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
