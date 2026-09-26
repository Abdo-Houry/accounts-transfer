import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useI18n } from '@/context/i18n-context';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary - pass the route path. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render error from one screen.
 *
 * Without this, a single bad component unmounts the entire React tree and the
 * operator is left staring at a blank white page with no way back - which is
 * exactly how a small rendering bug becomes "the whole system is down". Here it
 * degrades to one broken panel with a way out.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props): void {
    // A navigation clears the error so the next screen gets a clean mount.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Screen crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <CrashPanel error={this.state.error} onReset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function CrashPanel({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useI18n();

  return (
    <Card className="mx-auto max-w-2xl p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-negative-soft)] text-[var(--color-negative)]">
          <AlertOctagon className="size-5" aria-hidden />
        </span>
        <p className="text-lg font-medium">{t('common.errorTitle')}</p>
        <p className="text-sm text-[var(--text-muted)]">{t('error.screenCrashed')}</p>

        {import.meta.env.DEV ? (
          <pre
            dir="ltr"
            className="surface-muted mt-2 max-h-48 w-full overflow-auto rounded-lg p-3 text-start text-xs"
          >
            {error.message}
          </pre>
        ) : null}

        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={onReset}>
            {t('common.retry')}
          </Button>
          <Button onClick={() => window.location.assign('/')}>{t('feedback.goHome')}</Button>
        </div>
      </div>
    </Card>
  );
}
