import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider.jsx";
import { useToast } from "../components/UX.jsx";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();

  useEffect(() => {
    setEmail("");
    setPassword("");
  }, []);

  function validate() {
    if (!email.trim()) return "Please enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address.";
    if (!password) return "Please enter your password.";
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      toast?.show(validationError, "error");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const user = await login(email, password);
      toast?.show("Signed in successfully");
      navigate(user.first_login || user.force_password_change ? "/change-password" : "/", { replace: true });
    } catch (err) {
      setError(err.message);
      toast?.show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="brand large">
          <div className="brand-mark">R</div>
          <div>
            <strong>RedHero</strong>
            <span>Maharashtra Board SSC & HSC</span>
          </div>
        </div>
        <h1>Welcome back</h1>
        <p>Use your approved RedHero email and password to continue.</p>
        <form onSubmit={submit} autoComplete="off" noValidate>
          <input className="hidden-autofill" type="text" name="username" autoComplete="username" tabIndex="-1" aria-hidden="true" />
          <input className="hidden-autofill" type="password" name="password" autoComplete="new-password" tabIndex="-1" aria-hidden="true" />
          <label>
            Email
            <span className="input-wrap">
              <Mail size={18} />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                name="redhero-email"
                autoComplete="off"
                inputMode="email"
                required
              />
            </span>
          </label>
          <label>
            Password
            <span className="input-wrap">
              <LockKeyhole size={18} />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                name="redhero-passcode"
                autoComplete="new-password"
                required
              />
              <button className="ghost-icon reveal" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy}>
            {busy && <Loader2 className="spin" size={18} />}
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
      <section className="auth-art">
        <div>
          <h2>Learn with discipline. Grow with confidence.</h2>
          <p>Class-wise content, attendance, marks, assignments, notices, and AI doubt solving in one secure portal.</p>
        </div>
      </section>
    </div>
  );
}
