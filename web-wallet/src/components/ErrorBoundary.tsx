import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // TODO: Send error to logging service in production
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h1>Bir Hata Olustu</h1>
            <p>Uygulama beklenmedik bir hatayla karsilasti.</p>

            {import.meta.env.DEV && this.state.error && (
              <details className="error-details">
                <summary>Hata Detaylari</summary>
                <pre>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <pre>{this.state.errorInfo.componentStack}</pre>
                )}
              </details>
            )}

            <div className="error-actions">
              <button onClick={this.handleReset} className="btn btn-secondary">
                Tekrar Dene
              </button>
              <button onClick={this.handleReload} className="btn btn-primary">
                Sayfayi Yenile
              </button>
            </div>
          </div>

          <style>{`
            .error-boundary {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 2rem;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            }
            .error-boundary-content {
              max-width: 600px;
              padding: 2rem;
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
              text-align: center;
            }
            .error-boundary h1 {
              color: #ff6b6b;
              margin-bottom: 1rem;
            }
            .error-boundary p {
              color: rgba(255,255,255,0.7);
              margin-bottom: 1.5rem;
            }
            .error-details {
              text-align: left;
              margin: 1rem 0;
              padding: 1rem;
              background: rgba(0,0,0,0.2);
              border-radius: 8px;
              color: rgba(255,255,255,0.8);
            }
            .error-details summary {
              cursor: pointer;
              font-weight: bold;
              margin-bottom: 0.5rem;
              color: #ffd93d;
            }
            .error-details pre {
              overflow-x: auto;
              font-size: 0.8rem;
              margin: 0.5rem 0;
              white-space: pre-wrap;
              word-break: break-word;
              color: rgba(255,255,255,0.6);
            }
            .error-actions {
              display: flex;
              gap: 1rem;
              justify-content: center;
            }
            .error-actions .btn {
              padding: 0.75rem 1.5rem;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              font-size: 1rem;
              transition: all 0.2s;
            }
            .error-actions .btn-primary {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .error-actions .btn-secondary {
              background: rgba(255,255,255,0.1);
              color: white;
              border: 1px solid rgba(255,255,255,0.2);
            }
            .error-actions .btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
