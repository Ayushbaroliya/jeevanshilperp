import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, maxWidth: 640, margin: '40px auto', backgroundColor: 'var(--bg-secondary)', borderRadius: 16, border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20, color: 'var(--text-primary)' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={this.handleReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={16} /> Reload View
            </button>
            <button className="btn-secondary" onClick={() => window.location.href = '/'}>
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
