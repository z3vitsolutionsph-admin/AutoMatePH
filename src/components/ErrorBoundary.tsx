import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AutoMatePH Uncaught Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen w-full bg-[#0A0C10] flex items-center justify-center p-6 relative overflow-hidden font-sans">
          {/* Ambient Glassmorphism Backdrops */}
          <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-[#FF6F00]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-[#1D9E75]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Frosted Glass Recovery Card */}
          <div className="relative z-10 max-w-md w-full bg-[#141210]/80 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-8 shadow-[0_16px_48px_rgba(0,0,0,0.6)] text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.2)]">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold font-mono tracking-tight text-[#FAF7F2]">
                System Interface Recovery
              </h2>
              <p className="text-xs font-mono text-[#7A736E] leading-relaxed">
                An unexpected interface anomaly was intercepted. Local offline data and system state remain securely intact.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 rounded-lg bg-[#0A0C10]/70 border border-white/[0.08] text-[11px] font-mono text-red-400 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                onClick={this.handleReset}
                className="flex-1 bg-[#FF6F00] hover:bg-[#FF6F00]/90 text-[#0A0C10] font-bold font-mono text-xs uppercase tracking-wider h-10 shadow-[0_0_15px_rgba(255,111,0,0.25)] flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Reload System
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
