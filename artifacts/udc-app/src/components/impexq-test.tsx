import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type TestState = 'idle' | 'testing' | 'success' | 'error';
type ImpexqStatus = {
  configured?: boolean;
  mode?: string;
  productionReady?: boolean;
};
type ImpexqTestResponse = {
  ok?: boolean;
  error?: string;
  mock?: boolean;
  callsRemaining?: number | null;
  message?: string;
  retryAfterSeconds?: number;
};

const labels: Record<string, string> = {
  impexq_not_configured: 'ImpexQ key is not configured in the backend.',
  key_rejected_or_inactive: 'ImpexQ rejected the key. Check its activation or expiry in your provider account.',
  provider_quota_or_rate_limit: 'ImpexQ has reached a quota or rate limit. Try later.',
  provider_unavailable: 'ImpexQ did not return a valid sandbox response. Check provider status or key expiry.',
  test_cooldown: 'A test was run recently. Please wait one minute before trying again.',
};

export function ImpexqTestPage() {
  const [configuration, setConfiguration] = useState<ImpexqStatus | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [state, setState] = useState<TestState>('idle');
  const [message, setMessage] = useState('');
  const [mock, setMock] = useState<boolean | null>(null);
  const [callsRemaining, setCallsRemaining] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch('/api/admin/akif/impexq/status', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('not_available');
        const data = (await response.json()) as ImpexqStatus;
        if (mounted) setConfiguration(data);
      } catch {
        if (mounted) setConfigurationError(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const runTest = async () => {
    if (state === 'testing') return;
    setState('testing');
    setMessage('');
    setMock(null);
    setCallsRemaining(null);
    try {
      const response = await fetch('/api/admin/akif/impexq/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: '{}',
      });
      const result = (await response.json()) as ImpexqTestResponse;
      if (!response.ok || result.ok !== true) {
        setState('error');
        setMessage(result.error === 'test_cooldown' && result.retryAfterSeconds
          ? `Please wait ${result.retryAfterSeconds} seconds before trying again.`
          : labels[result.error || ''] || 'The test could not be completed. Please try again.');
        return;
      }
      setMock(result.mock ?? null);
      setCallsRemaining(typeof result.callsRemaining === 'number' ? result.callsRemaining : null);
      setMessage(result.message || 'ImpexQ sandbox responded successfully.');
      setState('success');
    } catch {
      setMessage('Cannot reach UDC backend. Check your connection and try again.');
      setState('error');
    }
  };

  return <div className="mx-auto w-full max-w-2xl" data-testid="impexq-admin-page">
    <div className="mb-5">
      <div className="eyebrow flex items-center gap-2"><Sparkles size={14} /> AKIF / API CONNECTIONS</div>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">ImpexQ connection</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Test your API key from your phone. UDC keeps the key on its server.
      </p>
    </div>
    <section className="panel p-5 sm:p-7" aria-label="ImpexQ sandbox test">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 shrink-0 text-primary" size={21} />
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Test ImpexQ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This sends one sandbox FTA query for basmati rice to UAE. It does not create a deal,
            change verification, or publish trade advice.
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-sm" data-testid="impexq-config">
        {configurationError ? 'Could not load the configuration status.' :
          configuration === null ? 'Checking backend configuration…' :
          configuration.configured ? 'API key setting: configured · Sandbox only' :
            'API key setting: missing'}
      </div>
      <Button
        className="mt-5 w-full min-h-12"
        type="button"
        disabled={state === 'testing' || !configuration?.configured}
        onClick={() => void runTest()}
        data-testid="button-test-impexq"
      >
        {state === 'testing' ? <><RefreshCw className="animate-spin" size={17} /> Testing connection…</> :
          <><Sparkles size={17} /> Test ImpexQ connection</>}
      </Button>
      <div className="mt-4 min-h-14" aria-live="polite" role="status" data-testid="impexq-test-result">
        {state === 'idle' && <p className="text-sm text-muted-foreground">
          No test run yet. Press the button once to check the provider.
        </p>}
        {state === 'testing' && <p className="text-sm">Contacting ImpexQ sandbox…</p>}
        {state === 'success' && <div className="flex items-start gap-2 text-sm">
          <CircleCheck size={19} className="mt-0.5 shrink-0 text-emerald-600" />
          <div><strong>Connection successful</strong><p className="mt-1">{message}</p>
            <p className="mt-1 text-muted-foreground">
              {mock === true ? 'Simulated sandbox response.' : 'Provider reference response; not verified customs advice.'}
              {callsRemaining !== null ? ` Calls remaining (provider reported): ${callsRemaining}.` : ''}
            </p>
          </div>
        </div>}
        {state === 'error' && <div className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert size={19} className="mt-0.5 shrink-0" />
          <div><strong>Connection test did not pass</strong><p className="mt-1">{message}</p></div>
        </div>}
      </div>
    </section>
    <p className="mt-4 text-xs text-muted-foreground">
      ImpexQ sandbox results are for testing only. They must never be treated as verified
      customs rates, eligibility decisions or trade quotations. API keys are not displayed.
    </p>
  </div>;
}
