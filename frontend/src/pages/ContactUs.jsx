import { Loader2, Mail, MessageSquareText, Phone, Send, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { EmptyState, useToast } from "../components/UX.jsx";

const ISSUE_TYPES = ["Login Issue", "Learning Issue", "Operations Issue", "AI Tutor Issue", "Technical Issue", "Feedback", "Other"];
const STATUS_OPTIONS = ["New", "In Review", "Resolved"];
const ERROR_MESSAGE = "Unable to send your message right now. Please try again later.";

export function ContactUs() {
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    name: "",
    student_id: "",
    email: "",
    issue_type: "Technical Issue",
    message: "",
    rating: "",
    feedback: "",
  });
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name: profile?.name || user?.name || "",
      student_id: profile?.student_id || "",
      email: profile?.email || user?.email || "",
    }));
  }, [profile, user]);

  useEffect(() => {
    api("/contact-messages/").then((result) => setItems(result.results || [])).catch(() => setItems([]));
  }, []);

  if (user.role === "super_admin") return <AdminContactMessages items={items} setItems={setItems} />;
  if (user.role !== "student") return <Navigate to="/403" replace />;

  function validate() {
    if (!form.issue_type) return ERROR_MESSAGE;
    if (!form.message.trim()) return ERROR_MESSAGE;
    if (form.message.length > 2000) return "Message must be 2000 characters or fewer.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email address.";
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      toast?.show(validationError, "error");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/contact-messages/", { method: "POST", body: JSON.stringify(form) });
      setMessage(result.message || "Your message has been sent successfully.");
      toast?.show("Your message has been sent successfully.");
      setItems((current) => [result.contact, ...current].filter(Boolean));
      setForm((current) => ({ ...current, issue_type: "Technical Issue", message: "", rating: "", feedback: "" }));
    } catch {
      setMessage(ERROR_MESSAGE);
      toast?.show(ERROR_MESSAGE, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="contact-page">
      <style>{contactStyles}</style>
      <div className="contact-grid">
        <section className="panel contact-info-panel">
          <span className="contact-kicker"><MessageSquareText size={15} /> RedHero Support</span>
          <h2>Contact Us</h2>
          <p>Reach the RedHero team for account, learning, operations, AI Tutor, or technical help.</p>
          <div className="contact-methods">
            <a href="mailto:raunaksin9890@gmail.com"><Mail size={20} /><span>Email</span><strong>raunaksin9890@gmail.com</strong></a>
            <a href="tel:8451874361"><Phone size={20} /><span>Phone</span><strong>8451874361</strong></a>
          </div>
        </section>

        <section className="panel contact-form-panel">
          <h2><Send size={20} /> Send Message</h2>
          <form className="contact-form" onSubmit={submit}>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Student ID<input value={form.student_id} readOnly /></label>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Subject / Issue Type<select value={form.issue_type} onChange={(event) => setForm({ ...form, issue_type: event.target.value })}>{ISSUE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="full">Message<textarea maxLength="2000" placeholder="Describe your issue or feedback..." value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required /></label>
            <div className="feedback-box full">
              <strong>How was your RedHero experience?</strong>
              <div className="rating-row">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button className={Number(form.rating) >= value ? "active" : ""} type="button" key={value} onClick={() => setForm({ ...form, rating: String(value) })} aria-label={`${value} star rating`}>
                    <Star size={18} />
                  </button>
                ))}
              </div>
              <textarea maxLength="1000" placeholder="Additional Feedback" value={form.feedback} onChange={(event) => setForm({ ...form, feedback: event.target.value })} />
            </div>
            {message && <div className="contact-message full">{message}</div>}
            <button className="primary full" disabled={busy}>{busy && <Loader2 className="spin" size={18} />} Send Message</button>
          </form>
        </section>

        <section className="panel contact-history-panel">
          <h2>My Requests</h2>
          <div className="contact-history">
            {items.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.issue_type}</strong>
                  <span>{new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <em>{item.status}</em>
              </article>
            ))}
            {items.length === 0 && <EmptyState title="No contact requests yet" message="Your submitted requests will appear here." />}
          </div>
        </section>
      </div>
    </section>
  );
}

function AdminContactMessages({ items, setItems }) {
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const toast = useToast();

  async function updateStatus(item, statusValue) {
    const previous = items;
    setBusyId(item.id);
    setMessage("");
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: statusValue } : row));
    try {
      const result = await api("/contact-messages/", { method: "PUT", body: JSON.stringify({ id: item.id, status: statusValue }) });
      setItems((current) => current.map((row) => row.id === item.id ? result.message : row));
      toast?.show("Contact request updated.");
    } catch (err) {
      setItems(previous);
      setMessage(err.message || "Unable to update contact request.");
      toast?.show(err.message || "Unable to update contact request.", "error");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="contact-page">
      <style>{contactStyles}</style>
      <section className="panel contact-history-panel admin-contact-panel">
        <h2>Contact Messages</h2>
        <div className="admin-contact-table">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Issue</th>
                <th>Message</th>
                <th>Rating</th>
                <th>Feedback</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name || "-"}</strong><span>{item.student_id || "-"}</span><span>{item.email || "-"}</span></td>
                  <td>{item.issue_type}</td>
                  <td>{item.message}</td>
                  <td>{item.rating || "-"}</td>
                  <td>{item.feedback || "-"}</td>
                  <td>{formatContactDate(item.created_at)}</td>
                  <td>
                    <select value={item.status || "New"} disabled={busyId === item.id} onChange={(event) => updateStatus(item, event.target.value)}>
                      {STATUS_OPTIONS.map((statusValue) => <option key={statusValue} value={statusValue}>{statusValue}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <EmptyState title="No contact requests yet" message="Student submitted requests will appear here." />}
        </div>
        {message && <div className="contact-message">{message}</div>}
      </section>
    </section>
  );
}

function formatContactDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const contactStyles = `
.contact-page {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(16px, 2.4vw, 28px);
  border-radius: 28px;
  color: #f8fafc;
  background:
    radial-gradient(circle at 16% 6%, rgba(214,31,58,.24), transparent 30%),
    radial-gradient(circle at 88% 8%, rgba(148,163,184,.12), transparent 28%),
    linear-gradient(145deg, #101216, #171922 48%, #111318);
  animation: contactPageIn 340ms ease both;
}
.contact-grid {
  display: grid;
  grid-template-columns: minmax(260px, .8fr) minmax(0, 1.4fr);
  gap: 18px;
}
.contact-page .panel {
  color: #f8fafc;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
  box-shadow: 0 24px 80px rgba(0,0,0,.26), 0 0 46px rgba(214,31,58,.10);
  backdrop-filter: blur(22px);
}
.contact-info-panel {
  min-height: 430px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.contact-kicker {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  color: #fecdd3;
  background: rgba(214,31,58,.16);
  border: 1px solid rgba(254,205,211,.2);
  font-weight: 900;
}
.contact-page h2 {
  color: #ffffff;
}
.contact-info-panel h2 {
  margin: 18px 0 8px;
  font-size: clamp(38px, 5vw, 64px);
  line-height: .96;
}
.contact-info-panel p,
.contact-history span,
.contact-page label,
.feedback-box strong {
  color: #aeb6c4;
}
.contact-methods {
  display: grid;
  gap: 12px;
  margin-top: 26px;
}
.contact-methods a,
.contact-history article,
.feedback-box {
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 18px;
  background: rgba(9,11,17,.52);
}
.contact-methods a {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
  align-items: center;
  padding: 14px;
  color: #f8fafc;
}
.contact-methods svg {
  grid-row: span 2;
  color: #fb7185;
}
.contact-methods span {
  color: #aeb6c4;
  font-size: 13px;
}
.contact-methods strong {
  color: #ffffff;
  overflow-wrap: anywhere;
}
.contact-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.contact-form .full,
.contact-history-panel {
  grid-column: 1 / -1;
}
.contact-form input,
.contact-form select,
.contact-form textarea {
  color: #f8fafc;
  background: rgba(10,12,18,.58);
  border-color: rgba(255,255,255,.12);
}
.contact-form input[readonly] {
  color: #aeb6c4;
}
.contact-form textarea {
  min-height: 128px;
}
.feedback-box {
  display: grid;
  gap: 12px;
  padding: 14px;
}
.rating-row {
  display: flex;
  gap: 8px;
}
.rating-row button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  color: #aeb6c4;
  background: rgba(255,255,255,.08);
  cursor: pointer;
}
.rating-row button.active {
  color: #ffffff;
  background: linear-gradient(135deg, #d61f3a, #8f1026);
  border-color: rgba(214,31,58,.42);
}
.contact-message {
  color: #ffffff;
  font-weight: 850;
}
.contact-history {
  display: grid;
  gap: 10px;
}
.contact-history article {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
}
.contact-history strong {
  display: block;
  color: #ffffff;
}
.contact-history em {
  align-self: start;
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0 10px;
  color: #fecdd3;
  background: rgba(214,31,58,.16);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}
.contact-page .empty-state {
  color: #aeb6c4;
}
.contact-page .empty-state strong {
  color: #ffffff;
}
.admin-contact-panel {
  display: grid;
  gap: 12px;
}
.admin-contact-table {
  overflow: auto;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 18px;
  background: rgba(9,11,17,.52);
}
.admin-contact-table table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}
.admin-contact-table th,
.admin-contact-table td {
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,.10);
  color: #f8fafc;
  text-align: left;
  vertical-align: top;
}
.admin-contact-table th {
  color: #0f172a;
  font-size: 12px;
  text-transform: uppercase;
}
.admin-contact-table td strong {
  color: #ffffff;
}
.admin-contact-table td span {
  display: block;
  margin-top: 4px;
  color: #cbd5e1;
  font-size: 12px;
}
.admin-contact-table tbody tr:hover td {
  color: #111827;
}
.admin-contact-table tbody tr:hover td strong {
  color: #111827;
}
.admin-contact-table tbody tr:hover td span {
  color: #374151;
}
.admin-contact-table select {
  min-width: 128px;
  color: #f8fafc;
  background: rgba(10,12,18,.58);
  border-color: rgba(255,255,255,.12);
}
@keyframes contactPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 980px) {
  .contact-grid,
  .contact-form {
    grid-template-columns: 1fr;
  }
  .contact-info-panel {
    min-height: 300px;
  }
}
@media (max-width: 680px) {
  .contact-page {
    margin: 0;
    padding: 14px;
    border-radius: 20px;
  }
}

html[data-theme="light"] .contact-page {
  color: #172033;
  background:
    radial-gradient(circle at 16% 6%, rgba(214,31,58,.11), transparent 30%),
    radial-gradient(circle at 88% 8%, rgba(37,99,235,.08), transparent 28%),
    linear-gradient(145deg, #f8fafc, #ffffff 48%, #f7f9fc);
  border: 1px solid rgba(203,213,225,.78);
  box-shadow: 0 24px 70px rgba(15,23,42,.08);
}
html[data-theme="light"] .contact-page .panel {
  color: #172033;
  border-color: rgba(203,213,225,.82);
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
  box-shadow: 0 20px 58px rgba(15,23,42,.09), 0 0 40px rgba(214,31,58,.06);
}
html[data-theme="light"] .contact-page h2,
html[data-theme="light"] .contact-page .contact-methods strong,
html[data-theme="light"] .contact-page .contact-history strong,
html[data-theme="light"] .contact-page .empty-state strong { color: #172033; }
html[data-theme="light"] .contact-page .contact-info-panel p,
html[data-theme="light"] .contact-page .contact-history span,
html[data-theme="light"] .contact-page label,
html[data-theme="light"] .contact-page .feedback-box strong,
html[data-theme="light"] .contact-page .contact-methods span,
html[data-theme="light"] .contact-page .empty-state { color: #64748b; }
html[data-theme="light"] .contact-page .contact-kicker,
html[data-theme="light"] .contact-page .contact-history em { color: #9d1430; background: #fff1f2; border-color: #fecdd3; }
html[data-theme="light"] .contact-page .contact-methods a,
html[data-theme="light"] .contact-page .contact-history article,
html[data-theme="light"] .contact-page .feedback-box {
  color: #172033;
  background: #f8fafc;
  border-color: rgba(203,213,225,.76);
}
html[data-theme="light"] .contact-page .contact-form input,
html[data-theme="light"] .contact-page .contact-form select,
html[data-theme="light"] .contact-page .contact-form textarea {
  color: #172033;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .contact-page .contact-form input[readonly] { color: #64748b; background: #f1f5f9; }
html[data-theme="light"] .contact-page .rating-row button { color: #64748b; background: #ffffff; border-color: rgba(203,213,225,.9); }
html[data-theme="light"] .contact-page .rating-row button.active { color: #ffffff; background: linear-gradient(135deg, #d61f3a, #8f1026); border-color: rgba(214,31,58,.42); }
html[data-theme="light"] .contact-page .contact-message { color: #172033; }
`;
