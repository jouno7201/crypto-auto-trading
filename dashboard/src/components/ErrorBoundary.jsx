import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="err-boundary">
          <h3>오류가 발생했습니다</h3>
          <p>{this.state.error?.message || '알 수 없는 오류'}</p>
          <button className="btn btn-outline" onClick={() => this.setState({ hasError: false, error: null })}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
