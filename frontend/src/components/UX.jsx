import { AlertTriangle, CheckCircle2, Info, Search, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ToastContext = createContext(null);
const LoadingOverlaySuppressedContext = createContext(false);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  function show(message, type = "success") {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  }

  const value = useMemo(() => ({ show }), []);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast ${toast.type}`} key={toast.id}>
            {toast.type === "error" || toast.type === "warning" ? <AlertTriangle size={18} /> : toast.type === "info" ? <Info size={18} /> : <CheckCircle2 size={18} />}
            <span>{toast.message}</span>
            <button aria-label="Dismiss notification" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>
              <X size={16} />
            </button>
            <i aria-hidden="true" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      setReduced(query.matches);
    }
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function AnimatedValue({ value, duration = 420 }) {
  const reducedMotion = useReducedMotion();
  const text = String(value ?? "");
  const numeric = typeof value === "number" ? value : Number(text.replace(/[^0-9.-]/g, ""));
  const prefix = text.match(/^[^\d.-]+/)?.[0] || "";
  const suffix = text.match(/[^\d.]+$/)?.[0] || "";
  const decimals = Number.isFinite(numeric) && String(numeric).includes(".") ? 1 : 0;
  const grouped = text.includes(",");
  const [display, setDisplay] = useState(Number.isFinite(numeric) && !reducedMotion ? 0 : value);

  useEffect(() => {
    if (!Number.isFinite(numeric) || reducedMotion) {
      setDisplay(value);
      return undefined;
    }
    const start = performance.now();
    let frame;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Number((numeric * eased).toFixed(decimals));
      setDisplay(grouped ? next.toLocaleString("en-IN") : next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [decimals, duration, grouped, numeric, reducedMotion, value]);

  if (!Number.isFinite(numeric)) return <>{value}</>;
  return <>{prefix}{display}{suffix}</>;
}

export function LoadingOverlaySuppressor({ active, children }) {
  return <LoadingOverlaySuppressedContext.Provider value={active}>{children}</LoadingOverlaySuppressedContext.Provider>;
}

export function PageLoader({ label = "Loading RedHero" }) {
  const suppressed = useContext(LoadingOverlaySuppressedContext);
  if (suppressed) return null;
  return <LogoLoadingOverlay label={label} />;
}

export function LoadingOverlay({ show, label = "Working" }) {
  const suppressed = useContext(LoadingOverlaySuppressedContext);
  const [visible, setVisible] = useState(show);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setLeaving(false);
      return undefined;
    }
    if (!visible) return undefined;
    setLeaving(true);
    const removeTimer = window.setTimeout(() => setVisible(false), 360);
    return () => window.clearTimeout(removeTimer);
  }, [show, visible]);

  if (!visible || suppressed) return null;
  return <LogoLoadingOverlay label={label} leaving={leaving} />;
}

export function LogoLoadingOverlay({ label = "Loading...", leaving = false }) {
  return (
    <div className={`loading-overlay logo-loading-overlay ${leaving ? "is-leaving" : ""}`} role="status" aria-live="polite" aria-label={label}>
      <div className="logo-loader-mark">
        <span aria-hidden="true" />
        <i className="redhero-logo" aria-hidden="true" />
      </div>
      {label && <strong>{label}</strong>}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="page-grid">
      {Array.from({ length: count }).map((_, index) => <div className="skeleton-card" key={index} />)}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", message = "New records will appear here automatically." }) {
  return (
    <div className="empty-state">
      <Search size={26} />
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function RouteMessage({ code, title, message }) {
  return (
    <div className="route-message">
      <div className="brand large">
        <div className="brand-mark">
          <span className="redhero-logo" aria-hidden="true" />
        </div>
        <div>
          <strong>RedHero</strong>
          <span>Learning Portal</span>
        </div>
      </div>
      <span>{code}</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <a className="primary route-link" href="/">Go to dashboard</a>
    </div>
  );
}
