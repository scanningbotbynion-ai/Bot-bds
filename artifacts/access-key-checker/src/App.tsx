import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useHealthCheck, useVerifyKey } from '@workspace/api-client-react';
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const health = useHealthCheck();
  const verification = useVerifyKey();
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [result, setResult] = useState<'accepted' | 'rejected' | 'unavailable' | 'limited' | null>(null);

  const status = (health.data?.status || '').toLowerCase();
  const serviceOnline = !health.isError && Boolean(health.data) && !['down', 'unavailable', 'offline', 'error'].includes(status);

  function submitKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key.length || verification.isPending) return;
    const candidate = key;
    setKey('');
    setShowKey(false);
    setResult(null);
    verification.mutate(
      { data: { key: candidate } },
      {
        onSuccess: (response) => setResult(response.ok ? 'accepted' : 'rejected'),
        onError: (error) => {
          const apiError = error as { status?: number; response?: { status?: number }; cause?: { status?: number } };
          const code = apiError.status ?? apiError.response?.status ?? apiError.cause?.status;
          if (code === 429) setResult('limited');
          else if (code === undefined || code >= 500) setResult('unavailable');
          else setResult('rejected');
        },
      },
    );
  }

  function resetResult() {
    if (result) setResult(null);
    if (verification.isError) verification.reset();
  }

  const isBusy = verification.isPending;

  return (
    <main className="station-shell">
      <div className="station-content mx-auto flex min-h-[100dvh] max-w-[1320px] flex-col px-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-foreground/10 py-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#263e3b] text-[#f4eee1] shadow-sm">
              <KeyRound size={19} strokeWidth={1.8} />
            </div>
            <div>
              <p className="display text-[18px] font-bold leading-tight tracking-[-0.035em]">Chinese Auto Bot</p>
              <p className="mono mt-1 text-[9px] uppercase tracking-[.19em] text-muted-foreground">Operator tools / access</p>
            </div>
          </div>
          <div className="mono flex items-center gap-2 rounded-full border border-foreground/10 bg-card/50 px-3 py-2 text-[10px] uppercase tracking-[.1em] text-muted-foreground">
            <span className={`relative flex size-2 ${serviceOnline ? '' : 'opacity-70'}`}>
              {serviceOnline && <span className="status-pulse absolute inline-flex size-2 rounded-full bg-[#378069]" />}
              <span className={`relative inline-flex size-2 rounded-full ${serviceOnline ? 'bg-[#378069]' : 'bg-[#c48158]'}`} />
            </span>
            <span data-testid="status-service">{serviceOnline ? 'Service online' : health.isLoading ? 'Checking service' : 'Service unavailable'}</span>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[minmax(280px,.82fr)_minmax(450px,1.18fr)] lg:gap-20 lg:py-20">
          <div className="enter max-w-[440px]">
            <div className="mono mb-6 flex items-center gap-3 text-[10px] uppercase tracking-[.2em] text-[#3f7566]">
              <span className="h-px w-8 bg-[#3f7566]" />
              Secure verification station
            </div>
            <h1 className="display text-[clamp(3rem,6vw,5.6rem)] font-semibold leading-[.98] tracking-[-.065em] text-[#263e3b]">
              One key.
              <br />
              One clear
              <br />
              <span className="relative inline-block text-primary">
                answer<span className="absolute -bottom-2 left-0 h-[3px] w-[86%] bg-primary/35" />.
              </span>
            </h1>
            <p className="mt-7 max-w-[370px] text-[15px] leading-7 text-muted-foreground">
              Verify a candidate access key against the live service. The key is checked once, then cleared from this station.
            </p>

            <div className="mt-12 flex max-w-[380px] items-center gap-4 border-t border-foreground/10 pt-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#dce8df] text-[#376c5d]">
                <ShieldCheck size={19} strokeWidth={1.7} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Private by design</p>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Never saved, logged, or shown in the result.</p>
              </div>
              <div className="ml-auto hidden items-center gap-1.5 text-[#638c7e] sm:flex">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current opacity-60" />
                <span className="h-1 w-1 rounded-full bg-current opacity-30" />
              </div>
            </div>
          </div>

          <div className="enter-delay">
            <div className="relative mx-auto w-full max-w-[610px] overflow-hidden rounded-[20px] border border-[#d5d2c8] bg-[#fbfaf6] shadow-[0_24px_70px_rgba(50,54,49,.10)]">
              <div className="flex items-center justify-between border-b border-[#e7e4dc] px-6 py-5 sm:px-8">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-[#f1e7db] text-[#b45c3d]">
                    <Activity size={17} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold tracking-[-.01em]">Key verification</p>
                    <p className="mono mt-1 text-[9px] uppercase tracking-[.14em] text-muted-foreground">Live endpoint · POST /api/verify-key</p>
                  </div>
                </div>
                <span className="mono text-[10px] text-muted-foreground">01 / 01</span>
              </div>

              <form onSubmit={submitKey} className="px-6 pb-7 pt-7 sm:px-8 sm:pb-8">
                <label htmlFor="candidate-key" className="mb-3 block text-[13px] font-semibold">Candidate key</label>
                <div className={`group flex h-[58px] items-center rounded-xl border bg-white/70 px-4 transition-colors focus-within:border-[#6d998a] focus-within:ring-4 focus-within:ring-[#4b816e]/10 ${key.length > 128 ? 'border-destructive' : 'border-[#dcd9d0]'}`}>
                  <LockKeyhole size={17} className="mr-3 shrink-0 text-[#81918a]" strokeWidth={1.8} />
                  <input
                    id="candidate-key"
                    data-testid="input-candidate-key"
                    className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[14px] tracking-[.04em] text-foreground outline-none placeholder:font-sans placeholder:text-[13px] placeholder:tracking-normal placeholder:text-[#a2a39d]"
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={129}
                    value={key}
                    onChange={(event) => {
                      setKey(event.target.value);
                      resetResult();
                    }}
                    placeholder="Paste or type an access key"
                    aria-describedby="key-guidance"
                    disabled={isBusy}
                  />
                  {key.length > 0 && (
                    <button
                      type="button"
                      data-testid="button-toggle-key-visibility"
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                      onClick={() => setShowKey((visible) => !visible)}
                      className="ml-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  )}
                </div>
                <div id="key-guidance" className="mt-2 flex min-h-5 items-center justify-between text-[11px] text-muted-foreground">
                  <span>1–128 characters · Input is cleared on submit</span>
                  <span className={`mono ${key.length > 128 ? 'text-destructive' : ''}`}>{key.length}/128</span>
                </div>

                <button
                  type="submit"
                  data-testid="button-verify-key"
                  disabled={!key.length || key.length > 128 || isBusy}
                  className="mt-5 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#c45d3e] px-5 text-[13px] font-semibold text-[#fff9ef] shadow-[0_5px_14px_rgba(177,82,55,.17)] transition-[background-color,transform,opacity] hover:bg-[#ad4f34] active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBusy ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                      Checking against service…
                    </>
                  ) : (
                    <>
                      Verify candidate key
                      <ArrowUpRight size={16} strokeWidth={2} />
                    </>
                  )}
                </button>
              </form>

              <div className="mx-6 border-t border-dashed border-[#ddd9d0] sm:mx-8" />

              <div className="px-6 py-6 sm:px-8">
                <div className="mb-4 flex items-center justify-between">
                  <p className="mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Verification result</p>
                  <span className="mono text-[9px] text-[#999a93]">NO KEY DATA RETURNED</span>
                </div>
                {isBusy ? (
                  <div className="rounded-xl border border-[#d8e3db] bg-[#f0f5f0] px-4 py-4" role="status" aria-live="polite" data-testid="status-verification-loading">
                    <div className="flex items-center gap-3">
                      <RefreshCw size={16} className="animate-spin text-[#4d806e]" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-[#315b4d]">Request in progress</p>
                        <p className="mt-1 text-[11px] text-[#638174]">Waiting for the service to confirm.</p>
                      </div>
                      <span className="mono text-[10px] text-[#638174]">LIVE</span>
                    </div>
                    <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-[#d4e3d8]">
                      <div className="scan-line h-full w-full bg-[#5b947c]" />
                    </div>
                  </div>
                ) : result ? (
                  <ResultPanel result={result} onRetry={() => { setResult(null); verification.reset(); }} />
                ) : (
                  <div className="flex min-h-[88px] items-center gap-3 rounded-xl border border-[#e2dfd7] bg-[#f7f5ef] px-4 py-4" data-testid="status-verification-idle">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full border border-[#dedbd2] bg-[#fbfaf6] text-[#999b92]">
                      <span className="mono text-[12px]">—</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#60665f]">Awaiting a candidate</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Your result will appear here.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f1efe8] px-6 py-4 text-[10px] text-muted-foreground sm:px-8">
                <div className="flex items-center gap-2">
                  {serviceOnline ? <CircleCheck size={13} className="text-[#49816d]" /> : <WifiOff size={13} className="text-[#b16a4a]" />}
                  <span data-testid="text-health-detail">{health.isLoading ? 'Connecting to verification service' : serviceOnline ? `Service status: ${health.data?.status}` : 'Could not confirm service availability'}</span>
                </div>
                <button
                  type="button"
                  data-testid="button-refresh-health"
                  onClick={() => void health.refetch()}
                  disabled={health.isFetching}
                  className="inline-flex items-center gap-1.5 rounded px-1 py-1 font-medium text-[#4f6f63] transition-colors hover:text-[#263e3b] disabled:opacity-50"
                >
                  <RefreshCw size={11} className={health.isFetching ? 'animate-spin' : ''} />
                  Refresh status
                </button>
              </div>
            </div>

            <div className="mono mt-5 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[.13em] text-muted-foreground/80">
              <Check size={12} className="text-[#54816f]" />
              Candidate data is not retained by this interface
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 py-4 text-[10px] text-muted-foreground">
          <span className="mono uppercase tracking-[.12em]">Chinese Auto Bot · Operations console</span>
          <span className="mono flex items-center gap-2 uppercase tracking-[.08em]"><span className="size-1.5 rounded-full bg-[#6b9682]" /> Private session</span>
        </footer>
      </div>
    </main>
  );
}

function ResultPanel({
  result,
  onRetry,
}: {
  result: 'accepted' | 'rejected' | 'unavailable' | 'limited';
  onRetry: () => void;
}) {
  const content = {
    accepted: {
      icon: <CircleCheck size={21} strokeWidth={1.8} />,
      title: 'Key accepted',
      description: 'This candidate key is valid for the service.',
      cls: 'border-[#c8ddd0] bg-[#edf5ef] text-[#315c4b]',
      iconCls: 'bg-[#dcebe0] text-[#428066]',
      testId: 'status-key-accepted',
    },
    rejected: {
      icon: <CircleX size={21} strokeWidth={1.8} />,
      title: 'Key not accepted',
      description: 'The service did not recognize this candidate key.',
      cls: 'border-[#ead4cc] bg-[#fbf0eb] text-[#74483b]',
      iconCls: 'bg-[#f3dfd6] text-[#bb6042]',
      testId: 'status-key-rejected',
    },
    unavailable: {
      icon: <WifiOff size={19} strokeWidth={1.8} />,
      title: 'Service unavailable',
      description: 'The check could not be completed. Confirm service availability and try again.',
      cls: 'border-[#e4d4c5] bg-[#f8f1e9] text-[#77543c]',
      iconCls: 'bg-[#efe0cf] text-[#a16d42]',
      testId: 'status-service-unavailable',
    },
    limited: {
      icon: <CircleAlert size={20} strokeWidth={1.8} />,
      title: 'Too many attempts',
      description: 'The service is rate limiting checks. Wait a moment before trying again.',
      cls: 'border-[#e5dabc] bg-[#f8f4e7] text-[#705c30]',
      iconCls: 'bg-[#ede5c9] text-[#987b38]',
      testId: 'status-rate-limited',
    },
  }[result];

  return (
    <div className={`flex min-h-[88px] items-start gap-3 rounded-xl border px-4 py-4 ${content.cls}`} role="status" aria-live="polite" data-testid={content.testId}>
      <div className={`grid size-9 shrink-0 place-items-center rounded-full ${content.iconCls}`}>{content.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{content.title}</p>
        <p className="mt-1 text-[11px] leading-[1.55] opacity-80">{content.description}</p>
      </div>
      {(result === 'unavailable' || result === 'limited') && (
        <button
          type="button"
          data-testid="button-retry-verification"
          onClick={onRetry}
          className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
