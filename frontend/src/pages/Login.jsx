import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { useToast } from "../components/UX.jsx";

const CLASSES = ["6", "7", "8", "9", "10", "11", "12"];
const VERIFY_ERROR = "Unable to verify the provided account details.";
const RESET_SUCCESS = "Password changed successfully. You can now sign in with your new password.";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState("signin");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [recovery, setRecovery] = useState({ username: "", roll_number: "", class_level: "10", student_id: "", new_password: "", confirm_password: "" });
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

  async function verifyRecovery(event) {
    event.preventDefault();
    setRecoveryBusy(true);
    setRecoveryMessage("");
    try {
      const result = await api("/auth/forgot-password/verify/", { method: "POST", body: JSON.stringify(recovery) });
      setResetToken(result.reset_token);
      setRecoveryStep("reset");
    } catch {
      setRecoveryMessage(VERIFY_ERROR);
      toast?.show(VERIFY_ERROR, "error");
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function resetRecovery(event) {
    event.preventDefault();
    if (recovery.new_password !== recovery.confirm_password) {
      setRecoveryMessage("Passwords do not match.");
      toast?.show("Passwords do not match.", "error");
      return;
    }
    setRecoveryBusy(true);
    setRecoveryMessage("");
    try {
      const result = await api("/auth/forgot-password/reset/", {
        method: "POST",
        body: JSON.stringify({ reset_token: resetToken, new_password: recovery.new_password, confirm_password: recovery.confirm_password }),
      });
      setRecoveryMessage(result.message || RESET_SUCCESS);
      toast?.show(RESET_SUCCESS);
      setRecoveryStep("done");
    } catch (err) {
      const safeMessage = err.message === "Passwords do not match." ? err.message : err.message || VERIFY_ERROR;
      setRecoveryMessage(safeMessage);
      toast?.show(safeMessage, "error");
    } finally {
      setRecoveryBusy(false);
    }
  }

  function backToSignIn() {
    setRecoveryStep("signin");
    setRecoveryMessage("");
    setResetToken("");
    setRecovery({ username: "", roll_number: "", class_level: "10", student_id: "", new_password: "", confirm_password: "" });
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="brand large">
          <div className="brand-mark">
            <span className="redhero-logo" aria-hidden="true" />
          </div>
          <div>
            <strong>RedHero</strong>
            <span>Maharashtra Board SSC & HSC</span>
          </div>
        </div>
        <h1>Welcome back</h1>
        <p>Use your approved RedHero email and password to continue.</p>
        {recoveryStep === "signin" && <form onSubmit={submit} autoComplete="off" noValidate>
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
          <button className="ghost-icon reveal" type="button" style={{ width: "fit-content", minWidth: 0, padding: "0 2px", justifySelf: "end" }} onClick={() => { setRecoveryStep("verify"); setRecoveryMessage(""); }}>
            Forgot Password?
          </button>
          <button className="primary" disabled={busy}>
            {busy && <Loader2 className="spin" size={18} />}
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>}
        {recoveryStep === "verify" && <form onSubmit={verifyRecovery} autoComplete="off" noValidate>
          <label>Username
            <span className="input-wrap">
              <Mail size={18} />
              <input value={recovery.username} onChange={(event) => setRecovery({ ...recovery, username: event.target.value })} required />
            </span>
          </label>
          <label>Roll Number
            <span className="input-wrap">
              <input value={recovery.roll_number} onChange={(event) => setRecovery({ ...recovery, roll_number: event.target.value })} required />
            </span>
          </label>
          <label>Class
            <span className="input-wrap">
              <select value={recovery.class_level} onChange={(event) => setRecovery({ ...recovery, class_level: event.target.value })}>{CLASSES.map((item) => <option key={item}>{item}</option>)}</select>
            </span>
          </label>
          <label>Student ID
            <span className="input-wrap">
              <input value={recovery.student_id} onChange={(event) => setRecovery({ ...recovery, student_id: event.target.value.toUpperCase() })} placeholder="R00001" required />
            </span>
          </label>
          {recoveryMessage && <div className="error">{recoveryMessage}</div>}
          <button className="primary" disabled={recoveryBusy}>{recoveryBusy && <Loader2 className="spin" size={18} />} Verify Account</button>
          <button className="secondary" type="button" onClick={backToSignIn}>Back to Sign In</button>
        </form>}
        {recoveryStep === "reset" && <form onSubmit={resetRecovery} autoComplete="off" noValidate>
          <label>New Password
            <span className="input-wrap">
              <LockKeyhole size={18} />
              <input value={recovery.new_password} onChange={(event) => setRecovery({ ...recovery, new_password: event.target.value })} type="password" autoComplete="new-password" required />
            </span>
          </label>
          <label>Confirm New Password
            <span className="input-wrap">
              <LockKeyhole size={18} />
              <input value={recovery.confirm_password} onChange={(event) => setRecovery({ ...recovery, confirm_password: event.target.value })} type="password" autoComplete="new-password" required />
            </span>
          </label>
          {recoveryMessage && <div className="error">{recoveryMessage}</div>}
          <button className="primary" disabled={recoveryBusy}>{recoveryBusy && <Loader2 className="spin" size={18} />} Reset Password</button>
          <button className="secondary" type="button" onClick={backToSignIn}>Back to Sign In</button>
        </form>}
        {recoveryStep === "done" && <form autoComplete="off">
          <div className="error">{recoveryMessage || RESET_SUCCESS}</div>
          <button className="primary" type="button" onClick={backToSignIn}>Back to Sign In</button>
        </form>}
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
