import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useHealthCheck, useVerifyKey } from '@workspace/api-client-react';
import {
  Activity, ArrowRight, Brain, ChartNoAxesColumnIncreasing, Check, CheckCircle2,
  ChevronRight, CircleAlert, Eye, EyeOff, FileText, Headphones, KeyRound,
  LockKeyhole, ShieldCheck, Sparkles, Zap,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const scanLabels = [
  'Connecting to neural engine…',
  'Verifying credentials…',
  'Scanning markets…',
  'Activating signal feed…',
  'Generating login token…',
];
const pillLabels = ['CONNECTING…', 'VERIFYING…', 'SCANNING MARKETS…', 'ACTIVATING FEED…', 'GENERATING TOKEN…'];
const thresholds = [3, 8, 18, 25, 30];

function Home() {
  const health = useHealthCheck();
  const verifyKey = useVerifyKey();
  const [, setLocation] = useLocation();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const online = !health.isError && !!health.data &&
    !['down', 'unavailable', 'offline', 'error'].includes(health.data.status.toLowerCase());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key.trim() || pending) return;
    const candidate = key;
    setPending(true);
    setError('');
    verifyKey.mutate({ data: { key: candidate } }, {
      onSuccess: (result) => {
        setPending(false);
        setKey('');
        if (result.ok) setLocation('/login');
        else setError(result.error || 'Invalid access key. Please try again.');
      },
      onError: (err) => {
        const e = err as { status?: number; response?: { status?: number } };
        setPending(false);
        setError((e.status ?? e.response?.status) === 429
          ? 'Too many attempts. Please wait a moment and try again.'
          : 'Unable to verify your key. Please try again.');
      },
    });
  }

  return (
    <main className="access-screen">
      <div className="access-frame">
        <header className="access-header">
          <img src="/assets/logo.png" alt="Chinese Auto Bot" className="brand-logo" />
          <span className="brand-divider" />
          <div className="brand-wordmark"><b>CHINESE</b><strong>AUTO BOT</strong></div>
          <ShieldCheck className="secure-mark" size={22} aria-label="Secure" />
          <button type="button" className="menu-button" aria-label="Menu" onClick={() => setLocation('/test-key')}>
            <span /><span /><span />
          </button>
        </header>

        <section className="access-hero">
          <img src="/assets/hero.jpg" alt="Armored Chinese Auto Bot trading assistant" className="hero-image" />
          <div className="hero-copy">
            <h1>Chinese<br /><em>Auto Bot</em></h1>
            <p>AI-Powered Trading<br />Automation</p>
            <ul>
              <li>Smart Analysis <CheckCircle2 /></li>
              <li>Auto Trading <CheckCircle2 /></li>
              <li>Faster Execution <CheckCircle2 /></li>
            </ul>
          </div>
        </section>

        <section className="key-panel">
          <h2><KeyRound size={23} />Access Key</h2>
          <form onSubmit={submit}>
            <label className={`key-input ${error ? 'has-error' : ''}`}>
              <KeyRound size={17} aria-hidden="true" />
              <span />
              <input
                aria-label="Access key"
                data-testid="input-access-key"
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(''); }}
                placeholder="Enter your access key…"
                autoComplete="off"
                maxLength={128}
                disabled={pending}
              />
            </label>
            {error && <p className="key-error" role="alert"><CircleAlert size={15} />{error}</p>}
            <button className="activate-button" type="submit" data-testid="button-activate" disabled={!key.trim() || pending}>
              <Activity size={24} />
              <span>{pending ? 'Verifying…' : 'Activate Bot'}</span>
              <ArrowRight size={19} />
            </button>
          </form>
        </section>

        <section className="feature-grid" aria-label="Features">
          <Feature icon={<Brain />} title="AI Analysis" detail="Smarter Decisions" />
          <Feature icon={<Zap />} title="Auto Execution" detail="Instant Trades" />
          <Feature icon={<ShieldCheck />} title="High Security" detail="Your Data Safe" />
          <Feature icon={<ChartNoAxesColumnIncreasing />} title="24/7 Trading" detail="Non-Stop Operations" />
        </section>
        <footer className="access-footer">
          <a href="#help" onClick={(e) => e.preventDefault()}><Headphones />Help &amp; Support</a>
          <i />
          <a href="#terms" onClick={(e) => e.preventDefault()}><FileText />Terms &amp; Risk Disclosure</a>
        </footer>
        <div className="health-note" data-testid="status-api-health">
          <span className={online ? 'health-dot online' : 'health-dot'} />
          {health.isLoading ? 'Connecting to service' : online ? 'Service connected' : 'Service status unavailable'}
        </div>
      </div>
    </main>
  );
}

function Feature({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <article className="feature-card"><div className="feature-icon">{icon}</div><strong>{title}</strong><span>{detail}</span></article>;
}

function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  return (
    <main className="login-screen">
      <div className="login-art" aria-hidden="true"><svg viewBox="0 0 390 728"><polygon points="54,571 90,571 74,590" fill="#1b202d" /><polyline points="0,623 58,604 117,631 176,594 232,620 293,585 352,610 390,590" /></svg></div>
      <header className="login-header"><img src="/assets/logo2.png" alt="Chinese Auto Bot" /><div><b>CHINESE</b><strong>AUTO BOT</strong></div></header>
      <h1>Sign In To Your Account</h1>
      <p className="login-subtitle">Use your Chinese Auto Bot account to continue</p>
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); setLocation('/countdown'); }}>
        <label className="floating-field"><span>Email Address</span><input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="floating-field"><span>Account Password</span><input type={showPassword ? 'text' : 'password'} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button>
        </label>
        <div className="login-options"><button type="button" className={`remember-box ${remember ? 'checked' : ''}`} aria-label="Remember me" aria-pressed={remember} onClick={() => setRemember(!remember)}>{remember && <Check size={20} />}</button><span>Remember me</span><a href="#forgot" onClick={(e) => e.preventDefault()}>Forgot your password?</a></div>
        <button className="signin-button" type="submit">Sign in <span><ChevronRight /></span></button>
      </form>
      <div className="flag-rule" />
      <p className="risk-copy">Risk warning: trading involves significant risk. Signals on this platform use a simulated DEMO feed.</p>
      <p className="copyright">© Chinese Auto Bot, 2026. All rights reserved.</p>
    </main>
  );
}

function Countdown({ second = false }: { second?: boolean }) {
  const [, setLocation] = useLocation();
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (seconds === 0 && !second) {
      const timeout = window.setTimeout(() => setLocation('/pin'), 600);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [seconds, second, setLocation]);
  const elapsed = 30 - seconds;
  const activeIndex = thresholds.findIndex((threshold) => elapsed < threshold);
  const pill = activeIndex < 0 ? 'READY' : pillLabels[activeIndex];
  return (
    <main className="countdown-screen">
      <div className="count-glow" /><div className="count-dots" />
      <svg className="circuit-lines" viewBox="0 0 390 693" aria-hidden="true">
        <g><path d="M0 41 12 54v66l28 28v84l-18 20v48M0 150l28 28v67M6 240v90l28 28" /><circle cx="62" cy="150" r="1.6" /><circle cx="32" cy="200" r="1.6" /><circle cx="60" cy="290" r="1.6" /></g>
        <g transform="translate(390 0) scale(-1 1)"><path d="M0 41 12 54v66l28 28v84l-18 20v48M0 150l28 28v67M6 240v90l28 28" /><circle cx="62" cy="150" r="1.6" /><circle cx="32" cy="200" r="1.6" /><circle cx="60" cy="290" r="1.6" /></g>
      </svg>
      <div className="system-active"><i />SYSTEM ACTIVE</div>
      <h1>Chinese bot</h1><div className="title-underline" />
      <svg className="count-ring" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="110" className="ring-dotted" />
        <circle cx="150" cy="150" r="101.5" className="ring-thin" />
        <circle cx="150" cy="150" r="80" className="ring-core" />
        <circle cx="150" cy="150" r="87" className="ring-track" />
        <circle cx="150" cy="150" r="87" className="ring-progress" style={{ strokeDashoffset: 546.64 * (seconds / 30) }} />
      </svg>
      <div className="seconds">{seconds}</div><div className="seconds-label">SEC</div>
      <section className="scan-panel">
        <div className="scan-heading"><i />SCAN PROTOCOL</div>
        {scanLabels.map((label, index) => {
          const done = elapsed >= thresholds[index];
          const active = index === activeIndex;
          return <div className={`scan-row ${done ? 'done' : active ? 'active' : ''}`} key={label}>
            <span className="scan-icon">{done ? <Check size={18} /> : index === 4 && !active ? <Sparkles size={16} /> : <i />}</span>
            <span>{label}</span>{active && <b />}
          </div>;
        })}
      </section>
      <div className="status-pill"><i />{pill}</div>
      <svg className="floor-rings" viewBox="0 0 390 60" aria-hidden="true"><ellipse cx="195" cy="42" rx="125" ry="20" /><ellipse cx="195" cy="42" rx="100" ry="15" /><ellipse cx="195" cy="42" rx="70" ry="9" /></svg>
      {second && <div className="countdown-final">Signal sequence complete</div>}
    </main>
  );
}

function Pin() {
  const [, setLocation] = useLocation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  return <main className="pin-screen">
    <h1>Welcome back!</h1>
    <p className="pin-intro">Please enter the PIN-Code</p>
    <label className={`pin-field ${error ? 'pin-error' : ''}`}><span>Code</span><input aria-label="PIN code" type="text" inputMode="numeric" maxLength={6} autoComplete="off" placeholder="Enter 6-digit code…" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(false); }} /></label>
    <p className="pin-help">Enter 6-digit pin code</p>
    <button className="pin-submit" type="button" onClick={() => pin.length === 6 ? setLocation('/countdown-2') : setError(true)}>Sign in <span><ChevronRight /></span></button>
    {error && <p className="pin-validation" role="alert">Please enter a 6-digit code.</p>}
    <button className="go-back" type="button" onClick={() => setLocation('/login')}>Go back</button>
  </main>;
}

function TestKey() {
  const [, setLocation] = useLocation();
  const health = useHealthCheck();
  const verify = useVerifyKey();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'accepted' | 'rejected' | 'error' | null>(null);
  const online = !!health.data && !health.isError && !['down', 'unavailable', 'offline', 'error'].includes(health.data.status.toLowerCase());
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim() || verify.isPending) return;
    const candidate = value;
    setValue('');
    setResult(null);
    verify.mutate({ data: { key: candidate } }, {
      onSuccess: (response) => setResult(response.ok ? 'accepted' : 'rejected'),
      onError: () => setResult('error'),
    });
  }
  return <main className="test-screen"><section className="test-card"><button className="test-back" type="button" onClick={() => setLocation('/')}>← Chinese Auto Bot</button><div className="test-eyebrow"><LockKeyhole size={16} />TEMPORARY API TOOL</div><h1>Access key check</h1><p>Standalone live check. Only the access key is sent to the verification endpoint.</p>
    <form onSubmit={submit}><label htmlFor="test-key">Candidate key</label><input id="test-key" data-testid="input-test-key" value={value} maxLength={128} autoComplete="off" onChange={(e) => { setValue(e.target.value); setResult(null); }} placeholder="Enter an access key" /><button type="submit" disabled={!value.trim() || verify.isPending}>{verify.isPending ? 'Checking…' : 'Verify key'}<ArrowRight size={16} /></button></form>
    {result && <div className={`test-result ${result}`} role="status">{result === 'accepted' ? 'Key accepted' : result === 'rejected' ? 'Key not accepted' : 'Verification service unavailable'}</div>}
    <div className="test-service"><span className={online ? 'health-dot online' : 'health-dot'} />{health.isLoading ? 'Checking service…' : online ? `Service status: ${health.data?.status}` : 'Service unavailable'}<button type="button" onClick={() => void health.refetch()} disabled={health.isFetching}>Refresh</button></div>
  </section></main>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Home} />
    <Route path="/login" component={Login} />
    <Route path="/countdown" component={() => <Countdown />} />
    <Route path="/pin" component={Pin} />
    <Route path="/countdown-2" component={() => <Countdown second />} />
    <Route path="/test-key" component={TestKey} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
