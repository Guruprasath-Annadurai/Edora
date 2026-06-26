import { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

// ── Global error boundary (wraps entire app) ─────────────────────────────────
interface Props  { children: ReactNode; }
interface State  { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full px-8 gap-6" style={{ background: 'linear-gradient(180deg, #F5F7FF 0%, #EEF0FF 100%)' }}>
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
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            Restart App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Per-route error boundary (lighter — lets user navigate away) ─────────────
interface RouteProps { children: ReactNode; label?: string; }
interface RouteState { error: Error | null; }

export class RouteErrorBoundary extends Component<RouteProps, RouteState> {
  state: RouteState = { error: null };

  static getDerivedStateFromError(error: Error): RouteState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      extra: { route: this.props.label, componentStack: info.componentStack },
    });
    console.error(`[RouteErrorBoundary:${this.props.label}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 px-8 gap-5 py-16">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'rgba(239,68,68,0.1)' }}>⚠️</div>
          <div className="text-center">
            <h3 className="font-heading text-lg font-bold text-foreground mb-1">Page Error</h3>
            <p className="text-sm text-muted-foreground">
              This page ran into a problem. Try going back.
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
