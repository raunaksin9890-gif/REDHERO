import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { useToast } from "../components/UX.jsx";

const passwordRules = [
  ["8+ characters", (value) => value.length >= 8],
  ["uppercase", (value) => /[A-Z]/.test(value)],
  ["lowercase", (value) => /[a-z]/.test(value)],
  ["number", (value) => /\d/.test(value)],
  ["special", (value) => /[^A-Za-z0-9]/.test(value)],
];

export function ChangePassword() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const toast = useToast();

  function validate() {
    if (!oldPassword) return "Please enter your current password.";
    if (!newPassword) return "Please enter a new password.";
    const failed = passwordRules.find(([, test]) => !test(newPassword));
    if (failed) return `New password must include ${failed[0]}.`;
    if (newPassword !== confirmPassword) return "Confirm password does not match.";
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      toast?.show(validationError, "error");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password/", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword }),
      });
      const me = await api("/auth/me/");
      setUser(me.user);
      localStorage.setItem("redhero_user", JSON.stringify(me.user));
      toast?.show("Password updated successfully");
      navigate("/", { replace: true });
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function passwordInput(name, value, setValue, label) {
    return (
      <label>
        {label}
        <span className="input-wrap">
          <LockKeyhole size={18} />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type={visible[name] ? "text" : "password"}
            autoComplete="new-password"
            required
          />
          <button className="ghost-icon reveal" type="button" aria-label={visible[name] ? "Hide password" : "Show password"} onClick={() => setVisible((state) => ({ ...state, [name]: !state[name] }))}>
            {visible[name] ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
    );
  }

  return (
    <div className="auth-page compact">
      <section className="auth-panel">
        <div className="brand large">
          <div className="brand-mark">R</div>
          <div>
            <strong>RedHero</strong>
            <span>First login password change</span>
          </div>
        </div>
        <h1>Set a new password</h1>
        <p>Your dashboard unlocks after replacing the temporary password.</p>
        <form onSubmit={submit} autoComplete="off">
          {passwordInput("old", oldPassword, setOldPassword, "Current password")}
          {passwordInput("new", newPassword, setNewPassword, "New password")}
          {passwordInput("confirm", confirmPassword, setConfirmPassword, "Confirm password")}
          <div className="password-rules">
            {passwordRules.map(([label, test]) => <span className={test(newPassword) ? "met" : ""} key={label}>{label}</span>)}
          </div>
          {message && <div className="error">{message}</div>}
          <button className="primary" disabled={busy}>
            {busy && <Loader2 className="spin" size={18} />}
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}
