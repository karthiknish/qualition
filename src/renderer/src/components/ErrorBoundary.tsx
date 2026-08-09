import React from 'react'

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-red-500/20 bg-zinc-900 p-6 text-center">
            <p className="text-sm font-medium text-red-300">Something went wrong</p>
            <p className="mt-2 text-xs text-zinc-500 break-all">{this.state.error?.message ?? 'Unknown error'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="ml-2 rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
