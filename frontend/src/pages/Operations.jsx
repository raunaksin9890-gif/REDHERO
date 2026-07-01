import { Activity, CalendarClock, CalendarDays, ClipboardCheck, IndianRupee, ListChecks, Lock, Pencil, Save, Timer, Trash2, Trophy, Unlock, WalletCards, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { ConfirmDialog, EmptyState, LoadingOverlay, useToast } from "../components/UX.jsx";

export function Operations() {
  const { user } = useAuth();
  const [data, setData] = useState({ attendance: [], marks: [], assignments: [], timetables: [], fees: [], students: [], audit: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      setBusy(true);
      const requests = [
        api("/attendance/"),
        api("/marks/"),
        api("/assignments/"),
        api("/timetables/"),
        api("/fees/"),
        user.role !== "student" ? api("/students/") : Promise.resolve({ results: [] }),
        user.role === "super_admin" ? api("/attendance/audit/") : Promise.resolve({ results: [] }),
      ];
      const [attendance, marks, assignments, timetables, fees, students, audit] = await Promise.all(requests);
      setData({
        attendance: attendance.results || [],
        marks: marks.results || [],
        assignments: assignments.results || [],
        timetables: timetables.results || [],
        fees: fees.results || [],
        students: students.results || [],
        audit: audit.results || [],
      });
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="operations-center">
      <style>{operationsCenterStyles}</style>
      <OperationsInsights data={data} />
      <div className="operations-workspace">
        {user.role !== "student" && <AttendanceForm students={data.students} onSaved={load} setMessage={setMessage} />}
        {user.role !== "student" && <MarksForm students={data.students} onSaved={load} setMessage={setMessage} />}
        {user.role !== "student" && <AssignmentForm onSaved={load} setMessage={setMessage} />}
        {user.role === "super_admin" && <TimetableForm onSaved={load} setMessage={setMessage} />}
        {user.role === "super_admin" && <FeeForm onSaved={load} setMessage={setMessage} />}
        <AttendancePanel user={user} items={data.attendance} onSaved={load} setMessage={setMessage} />
        <MarksPanel user={user} items={data.marks} onSaved={load} setMessage={setMessage} />
        <AssignmentPanel user={user} items={data.assignments} onSaved={load} setMessage={setMessage} />
        <TimetablePanel user={user} items={data.timetables} onSaved={load} setMessage={setMessage} />
        <FeePanel user={user} items={data.fees} onSaved={load} setMessage={setMessage} />
        {user.role === "super_admin" && <AuditPanel items={data.audit} />}
      </div>
      <LoadingOverlay show={busy} label="Loading operations" />
      {message && <div className="inline-message">{message}</div>}
    </div>
  );
}

function OperationsInsights({ data }) {
  const attendancePercent = getAttendancePercent(data.attendance);
  const marksSummary = getMarksSummary(data.marks);
  const nextAssignments = [...data.assignments]
    .sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0))
    .slice(0, 3);
  const todayPeriods = data.timetables.flatMap((row) => (row.periods || []).map((period) => ({ ...period, class_level: row.class_level }))).slice(0, 4);
  const fee = data.fees[0];
  const feeAmount = Number(fee?.annual_fee || 0);
  const feePaid = feeAmount ? Math.round(feeAmount * 0.62) : 0;
  const feeProgress = feeAmount ? Math.round((feePaid / feeAmount) * 100) : 0;

  return (
    <section className="ops-hero">
      <div className="ops-title">
        <span><Activity size={15} /> RedHero Command Desk</span>
        <h1>Operations Center</h1>
        <p>Attendance, marks, assignments, timetable, and fee workflows presented as a modern analytics workspace.</p>
      </div>

      <article className="ops-card attendance-analytics">
        <header><ClipboardCheck size={20} /><span>Attendance</span></header>
        <div className="ops-ring" style={{ "--value": attendancePercent }}>
          <strong>{attendancePercent}%</strong>
          <span>Attendance</span>
        </div>
        <div className="kinetic-words" aria-hidden="true">
          <span>Today</span>
          <span>On Time</span>
          <span>Weekly Report</span>
        </div>
        <div className="ops-mini-grid">
          <span>Weekly report <strong>{Math.max(0, attendancePercent - 3)}%</strong></span>
          <span>Monthly report <strong>{attendancePercent}%</strong></span>
          <span>Today's status <strong>{attendancePercent >= 75 ? "Healthy" : "Watch"}</strong></span>
        </div>
      </article>

      <article className="ops-card marks-analytics">
        <header><Trophy size={20} /><span>Marks</span></header>
        <div className="line-chart" aria-label="Marks trend">
          <i style={{ height: `${Math.max(18, marksSummary.average)}%` }} />
          <i style={{ height: `${Math.max(22, marksSummary.highest - 12)}%` }} />
          <i style={{ height: `${Math.max(26, marksSummary.average + 8)}%` }} />
          <i style={{ height: `${Math.max(30, marksSummary.highest)}%` }} />
        </div>
        <div className="ops-mini-grid">
          <span>Highest marks <strong>{marksSummary.highest}%</strong></span>
          <span>Average marks <strong>{marksSummary.average}%</strong></span>
          <span>Latest test <strong>{marksSummary.latest || "Pending"}</strong></span>
        </div>
      </article>

      <article className="ops-card assignments-analytics">
        <header><ListChecks size={20} /><span>Next Assignments</span></header>
        <div className="assignment-preview-list">
          {nextAssignments.map((item) => (
            <div className="assignment-preview" key={item.id}>
              <span className={isDueToday(item.deadline) ? "due-today" : "priority"}>{isDueToday(item.deadline) ? "Due today" : "Priority"}</span>
              <strong>{item.title}</strong>
              <em><Timer size={13} /> {countdown(item.deadline)}</em>
            </div>
          ))}
          {nextAssignments.length === 0 && <div className="assignment-preview empty-preview">No upcoming assignments</div>}
        </div>
      </article>

      <article className="ops-card timetable-analytics">
        <header><CalendarClock size={20} /><span>Today's Schedule</span></header>
        <div className="timeline">
          {todayPeriods.map((period, index) => (
            <div className={index === 0 ? "current" : ""} key={`${period.day}-${period.time}-${index}`}>
              <strong>{period.time}</strong>
              <span>{period.subject} · Class {period.class_level}</span>
            </div>
          ))}
          {todayPeriods.length === 0 && <div><strong>No schedule</strong><span>Timetable entries will appear here</span></div>}
        </div>
      </article>

      <article className="ops-card fee-analytics">
        <header><WalletCards size={20} /><span>Fee Structure</span></header>
        <div className="fee-copy">
          <strong>{feeAmount ? `Rs ${feePaid.toLocaleString("en-IN")}` : "Not set"}</strong>
          <span>Paid amount</span>
        </div>
        <div className="fee-progress"><span style={{ width: `${feeProgress}%` }} /></div>
        <div className="ops-mini-grid">
          <span>Remaining <strong>{feeAmount ? `Rs ${(feeAmount - feePaid).toLocaleString("en-IN")}` : "-"}</strong></span>
          <span>Status <strong>{feeProgress >= 60 ? "On Track" : "Open"}</strong></span>
        </div>
      </article>
    </section>
  );
}

function getAttendancePercent(items) {
  if (!items.length) return 0;
  const present = items.filter((item) => String(item.status).toLowerCase() === "present").length;
  return Math.round((present / items.length) * 100);
}

function getMarksSummary(items) {
  if (!items.length) return { highest: 0, average: 0, latest: "" };
  const percentages = items.map((item) => Number(item.percentage ?? (Number(item.marks_obtained) / Number(item.max_marks || 1)) * 100)).filter(Number.isFinite);
  const highest = Math.round(Math.max(...percentages, 0));
  const average = Math.round(percentages.reduce((sum, value) => sum + value, 0) / Math.max(percentages.length, 1));
  return { highest, average, latest: items[0]?.exam_type || items[0]?.subject || "" };
}

function isDueToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function countdown(value) {
  if (!value) return "No deadline";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "Due now";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  return `${Math.max(hours, 1)}h left`;
}

function AttendanceForm({ students, onSaved, setMessage }) {
  const [form, setForm] = useState({ student: "", date: new Date().toISOString().slice(0, 10), status: "present" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    try {
      await api("/attendance/", { method: "POST", body: JSON.stringify(form) });
      setMessage("Attendance saved");
      toast?.show("Attendance saved");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel wide">
      <h2><ClipboardCheck size={20} /> Add Attendance</h2>
      <form className="content-form" onSubmit={submit}>
        <select value={form.student} onChange={(event) => setForm({ ...form, student: event.target.value })} required>
          <option value="">Select student</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name} - Class {student.class_level}</option>)}
        </select>
        <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
        </select>
        <button className="primary">Save Attendance</button>
      </form>
    </section>
  );
}

function MarksForm({ students, onSaved, setMessage }) {
  const [form, setForm] = useState({ student: "", subject: "Mathematics", exam_type: "Unit Test", marks_obtained: "", max_marks: "100" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    if (Number(form.marks_obtained) > Number(form.max_marks)) {
      toast?.show("Marks cannot exceed max marks", "error");
      return;
    }
    try {
      await api("/marks/", { method: "POST", body: JSON.stringify(form) });
      setMessage("Marks saved");
      toast?.show("Marks saved");
      setForm({ student: "", subject: "Mathematics", exam_type: "Unit Test", marks_obtained: "", max_marks: "100" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel wide">
      <h2><Trophy size={20} /> Add Marks</h2>
      <form className="content-form" onSubmit={submit}>
        <select value={form.student} onChange={(event) => setForm({ ...form, student: event.target.value })} required>
          <option value="">Select student</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name} - Class {student.class_level}</option>)}
        </select>
        <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
        <select value={form.exam_type} onChange={(event) => setForm({ ...form, exam_type: event.target.value })}>
          <option>Unit Test</option>
          <option>Semester Exam</option>
          <option>Final Exam</option>
        </select>
        <input placeholder="Marks" value={form.marks_obtained} onChange={(event) => setForm({ ...form, marks_obtained: event.target.value })} required />
        <input placeholder="Max Marks" value={form.max_marks} onChange={(event) => setForm({ ...form, max_marks: event.target.value })} required />
        <button className="primary">Save Marks</button>
      </form>
    </section>
  );
}

function AssignmentForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ title: "", description: "", class_level: "10", subject: "Mathematics", deadline: "" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    try {
      await api("/assignments/", { method: "POST", body: JSON.stringify(form) });
      setMessage("Assignment created");
      toast?.show("Assignment created");
      setForm({ title: "", description: "", class_level: "10", subject: "Mathematics", deadline: "" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel wide">
      <h2>Create Assignment</h2>
      <form className="content-form" onSubmit={submit}>
        <input placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
        <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required />
        <input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} required />
        <textarea placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        <button className="primary">Create</button>
      </form>
    </section>
  );
}

function TimetableForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ class_level: "10", day: "Monday", time: "09:00 - 10:00", subject: "Mathematics", teacher: "" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    try {
      await api("/timetables/", { method: "POST", body: JSON.stringify({ class_level: form.class_level, periods: [{ day: form.day, time: form.time, subject: form.subject, teacher: form.teacher }] }) });
      setMessage("Timetable saved");
      toast?.show("Timetable saved");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel wide">
      <h2><CalendarDays size={20} /> Create Timetable</h2>
      <form className="content-form" onSubmit={submit}>
        <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required />
        <input placeholder="Day" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })} required />
        <input placeholder="Time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
        <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
        <input placeholder="Teacher" value={form.teacher} onChange={(event) => setForm({ ...form, teacher: event.target.value })} />
        <button className="primary">Save Timetable</button>
      </form>
    </section>
  );
}

function FeeForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ class_level: "10", annual_fee: "", installments: "" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    try {
      const installments = form.installments ? Object.fromEntries(form.installments.split(",").map((item) => item.split(":").map((part) => part.trim()))) : {};
      await api("/fees/", { method: "POST", body: JSON.stringify({ class_level: form.class_level, annual_fee: form.annual_fee, installments }) });
      setMessage("Fee structure saved");
      toast?.show("Fee structure saved");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel wide">
      <h2><IndianRupee size={20} /> Create Fee Structure</h2>
      <form className="content-form" onSubmit={submit}>
        <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required />
        <input placeholder="Annual Fee" value={form.annual_fee} onChange={(event) => setForm({ ...form, annual_fee: event.target.value })} required />
        <input placeholder="Installments e.g. Term 1:25000, Term 2:25000" value={form.installments} onChange={(event) => setForm({ ...form, installments: event.target.value })} />
        <button className="primary">Save Fee</button>
      </form>
    </section>
  );
}

function AttendancePanel({ user, items, onSaved, setMessage }) {
  async function lock(row, locked) {
    try {
      await api(`/attendance/${row.id}/${locked ? "lock" : "unlock"}/`, { method: "POST" });
      setMessage(locked ? "Attendance locked" : "Attendance unlocked");
      onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <EditablePanel
      title="Attendance"
      icon={ClipboardCheck}
      items={items}
      fields={["date", "status", "class_level"]}
      canDelete={user.role === "super_admin"}
      canEdit={user.role !== "student"}
      onSave={async (row, draft) => api("/attendance/", { method: "PUT", body: JSON.stringify({ id: row.id, status: draft.status }) })}
      onDelete={async (row) => api(`/attendance/?id=${row.id}`, { method: "DELETE" })}
      onSaved={onSaved}
      setMessage={setMessage}
      extraActions={(row) => user.role === "super_admin" && (
        <button className="icon-button" title={row.locked ? "Unlock" : "Lock"} onClick={() => lock(row, !row.locked)}>{row.locked ? <Unlock size={16} /> : <Lock size={16} />}</button>
      )}
    />
  );
}

function MarksPanel({ user, items, onSaved, setMessage }) {
  return (
    <EditablePanel
      title="Marks"
      icon={Trophy}
      items={items}
      fields={["subject", "exam_type", "marks_obtained", "max_marks"]}
      canDelete={user.role === "super_admin"}
      canEdit={user.role !== "student"}
      onSave={async (row, draft) => api("/marks/", { method: "PUT", body: JSON.stringify({ id: row.id, ...draft }) })}
      onDelete={async (row) => api(`/marks/?id=${row.id}`, { method: "DELETE" })}
      onSaved={onSaved}
      setMessage={setMessage}
    />
  );
}

function AssignmentPanel({ user, items, onSaved, setMessage }) {
  return (
    <EditablePanel
      title="Assignments"
      icon={ListChecks}
      items={items}
      fields={["title", "subject", "deadline", "class_level"]}
      canDelete={user.role !== "student"}
      canEdit={user.role !== "student"}
      onSave={async (row, draft) => api("/assignments/", { method: "PUT", body: JSON.stringify({ id: row.id, description: row.description || "", ...draft }) })}
      onDelete={async (row) => api(`/assignments/?id=${row.id}`, { method: "DELETE" })}
      onSaved={onSaved}
      setMessage={setMessage}
    />
  );
}

function TimetablePanel({ user, items, onSaved, setMessage }) {
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  async function remove(row) {
    try {
      await api(`/timetables/?id=${row.id}`, { method: "DELETE" });
      setMessage("Timetable deleted");
      toast?.show("Timetable deleted");
      setConfirm(null);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel">
      <h2><CalendarDays size={20} /> Timetable</h2>
      <div className="stack">
        {items.map((row) => (
          <article className="row-item" key={row.id}>
            <strong>Class {row.class_level}</strong>
            {(row.periods || []).map((period, index) => <span key={`${row.id}-${index}`}>{period.day} · {period.time} · {period.subject}</span>)}
            {user.role === "super_admin" && <button className="icon-button" title="Delete" onClick={() => setConfirm(row)}><Trash2 size={16} /></button>}
          </article>
        ))}
        {items.length === 0 && <EmptyState title="No timetable records" />}
      </div>
      <ConfirmDialog open={Boolean(confirm)} title={`Delete Class ${confirm?.class_level} timetable?`} message="This timetable entry will be removed." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
    </section>
  );
}

function FeePanel({ user, items, onSaved, setMessage }) {
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  async function remove(row) {
    try {
      await api(`/fees/?id=${row.id}`, { method: "DELETE" });
      setMessage("Fee structure deleted");
      toast?.show("Fee structure deleted");
      setConfirm(null);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <section className="panel">
      <h2><IndianRupee size={20} /> Fee Structure</h2>
      <div className="stack">
        {items.map((row) => (
          <article className="row-item" key={row.id}>
            <strong>Class {row.class_level}</strong>
            <span>annual fee: {row.annual_fee}</span>
            {user.role === "super_admin" && <button className="icon-button" title="Delete" onClick={() => setConfirm(row)}><Trash2 size={16} /></button>}
          </article>
        ))}
        {items.length === 0 && <EmptyState title="No fee records" />}
      </div>
      <ConfirmDialog open={Boolean(confirm)} title={`Delete Class ${confirm?.class_level} fee structure?`} message="This fee structure will be removed." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
    </section>
  );
}

function EditablePanel({ title, icon: Icon, items, fields, canEdit, canDelete, onSave, onDelete, onSaved, setMessage, extraActions }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();

  async function save(row) {
    try {
      await onSave(row, draft);
      setEditing(null);
      setMessage(`${title} updated`);
      toast?.show(`${title} updated`);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function remove(row) {
    try {
      await onDelete(row);
      setMessage(`${title} deleted`);
      toast?.show(`${title} deleted`);
      setConfirm(null);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  return (
    <section className="panel">
      <h2><Icon size={20} /> {title}</h2>
      <div className="stack">
        {items.map((item) => (
          <article key={item.id} className="row-item">
            <strong>{item.title || item.student?.name || item.subject || `Class ${item.class_level}`}</strong>
            {fields.map((field) => (
              <span key={field}>
                {field.replace("_", " ")}: {editing === item.id ? <input value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /> : String(item[field] ?? "-")}
              </span>
            ))}
            {(canEdit || canDelete || extraActions) && (
              <span>
                {editing === item.id ? (
                  <>
                    <button className="icon-button" title="Save" onClick={() => save(item)}><Save size={16} /></button>
                    <button className="icon-button" title="Cancel" onClick={() => setEditing(null)}><X size={16} /></button>
                  </>
                ) : (
                  <>
                    {canEdit && <button className="icon-button" title="Edit" onClick={() => { setEditing(item.id); setDraft(Object.fromEntries(fields.map((field) => [field, item[field] ?? ""]))); }}><Pencil size={16} /></button>}
                    {canDelete && <button className="icon-button" title="Delete" onClick={() => setConfirm(item)}><Trash2 size={16} /></button>}
                    {extraActions?.(item)}
                  </>
                )}
              </span>
            )}
          </article>
        ))}
        {items.length === 0 && <EmptyState title={`No ${title.toLowerCase()} records`} />}
      </div>
      <ConfirmDialog open={Boolean(confirm)} title={`Delete ${title.toLowerCase()} record?`} message="This record will be removed from operations." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
    </section>
  );
}

function AuditPanel({ items }) {
  return (
    <section className="panel wide">
      <h2>Attendance Audit Logs</h2>
      <div className="stack">
        {items.map((item) => (
          <article className="row-item" key={item.id}>
            <strong>{item.action} · {item.student_name}</strong>
            <span>Class {item.class_level} · {item.performed_by_name} · {item.created_at}</span>
          </article>
        ))}
        {items.length === 0 && <p>No audit logs available.</p>}
      </div>
    </section>
  );
}

const operationsCenterStyles = `
.operations-center {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(16px, 2.4vw, 28px);
  border-radius: 28px;
  color: #f8fafc;
  background:
    radial-gradient(circle at 12% 6%, rgba(214,31,58,.24), transparent 30%),
    radial-gradient(circle at 92% 10%, rgba(148,163,184,.12), transparent 28%),
    linear-gradient(145deg, #101216, #171922 48%, #111318);
  animation: opsPageIn 340ms ease both;
}
.ops-hero {
  display: grid;
  grid-template-columns: minmax(280px, 1.2fr) repeat(2, minmax(240px, .9fr));
  gap: 18px;
  margin-bottom: 22px;
}
.ops-title,
.ops-card,
.operations-center .panel {
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
  box-shadow: 0 24px 80px rgba(0,0,0,.26), 0 0 46px rgba(214,31,58,.10);
  backdrop-filter: blur(22px);
}
.ops-title {
  grid-row: span 2;
  min-height: 360px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border-radius: 30px;
  padding: clamp(24px, 4vw, 40px);
  position: relative;
  overflow: hidden;
}
.ops-title::before {
  content: "";
  position: absolute;
  right: -90px;
  top: -90px;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgba(214,31,58,.28);
  filter: blur(12px);
  animation: opsFloat 5s ease-in-out infinite;
}
.ops-title > span {
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
  position: relative;
}
.ops-title h1 {
  position: relative;
  margin: 18px 0 10px;
  font-size: clamp(38px, 6vw, 68px);
  line-height: .96;
  letter-spacing: 0;
}
.ops-title p {
  position: relative;
  margin: 0;
  color: #aeb6c4;
  line-height: 1.7;
  font-size: 17px;
}
.ops-card {
  min-height: 240px;
  border-radius: 28px;
  padding: 20px;
  overflow: hidden;
  position: relative;
  animation: opsCardIn 360ms ease both;
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.ops-card:hover,
.operations-center .panel:hover {
  transform: translateY(-6px) scale(1.01);
  border-color: rgba(214,31,58,.26);
  box-shadow: 0 34px 90px rgba(0,0,0,.32), 0 0 54px rgba(214,31,58,.16);
}
.ops-card header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #ffffff;
  font-weight: 950;
  margin-bottom: 16px;
}
.ops-card header svg { color: #fb7185; }
.attendance-analytics {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px 18px;
  align-items: center;
}
.attendance-analytics header,
.attendance-analytics .ops-mini-grid { grid-column: 1 / -1; }
.ops-ring {
  width: 138px;
  height: 138px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: conic-gradient(#d61f3a calc(var(--value) * 1%), rgba(255,255,255,.12) 0);
  box-shadow: inset 0 0 0 13px #12141a, 0 0 42px rgba(214,31,58,.16);
}
.ops-ring strong { font-size: 32px; line-height: 1; }
.ops-ring span { display: block; color: #aeb6c4; font-size: 12px; font-weight: 850; }
.kinetic-words {
  height: 42px;
  overflow: hidden;
  display: grid;
  align-items: center;
  color: #ffffff;
  font-size: 24px;
  font-weight: 950;
  filter: drop-shadow(0 8px 18px rgba(214,31,58,.18));
}
.kinetic-words span {
  grid-area: 1 / 1;
  opacity: 0;
  transform: translateY(22px);
  animation: kineticWords 4.8s ease-in-out infinite;
}
.kinetic-words span:nth-child(2) { animation-delay: 1.6s; }
.kinetic-words span:nth-child(3) { animation-delay: 3.2s; }
.ops-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.ops-mini-grid span {
  display: grid;
  gap: 5px;
  padding: 11px;
  border-radius: 16px;
  color: #9ca3af;
  background: rgba(8,10,15,.36);
  border: 1px solid rgba(255,255,255,.08);
  font-size: 12px;
  font-weight: 800;
}
.ops-mini-grid strong { color: #ffffff; font-size: 14px; }
.line-chart {
  height: 102px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: end;
  gap: 12px;
  padding: 12px;
  border-radius: 20px;
  background: rgba(8,10,15,.36);
  border: 1px solid rgba(255,255,255,.08);
  margin-bottom: 14px;
}
.line-chart i {
  display: block;
  border-radius: 999px 999px 10px 10px;
  background: linear-gradient(180deg, #fb7185, #d61f3a);
  box-shadow: 0 0 22px rgba(214,31,58,.22);
  animation: opsBars 720ms ease both;
}
.assignment-preview-list { display: grid; gap: 10px; }
.assignment-preview {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(8,10,15,.38);
  border: 1px solid rgba(255,255,255,.09);
}
.assignment-preview > span {
  width: fit-content;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  color: #fecdd3;
  background: rgba(214,31,58,.16);
  font-size: 11px;
  font-weight: 950;
}
.assignment-preview > span.due-today { color: #fef3c7; background: rgba(245,158,11,.18); }
.assignment-preview strong { color: #ffffff; }
.assignment-preview em { display: inline-flex; align-items: center; gap: 6px; color: #9ca3af; font-style: normal; font-size: 13px; }
.empty-preview { color: #9ca3af; }
.timeline { display: grid; gap: 10px; }
.timeline div {
  display: grid;
  gap: 4px;
  padding: 12px 12px 12px 18px;
  border-left: 3px solid rgba(255,255,255,.14);
  border-radius: 0 16px 16px 0;
  background: rgba(8,10,15,.36);
}
.timeline div.current {
  border-left-color: #d61f3a;
  box-shadow: inset 0 0 0 1px rgba(214,31,58,.14), 0 0 28px rgba(214,31,58,.10);
}
.timeline strong { color: #ffffff; }
.timeline span { color: #aeb6c4; }
.fee-copy strong { display: block; font-size: 34px; color: #ffffff; line-height: 1; }
.fee-copy span { color: #aeb6c4; font-weight: 850; }
.fee-progress {
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  margin: 22px 0 14px;
  background: rgba(255,255,255,.12);
}
.fee-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d61f3a, #fb7185);
  animation: opsProgress 720ms ease both;
}
.operations-workspace {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.operations-center .wide { grid-column: span 2; }
.operations-center .panel {
  border-radius: 24px;
  padding: 22px;
  color: #f8fafc;
  overflow: hidden;
}
.operations-center .panel h2 { color: #ffffff; }
.operations-center input,
.operations-center select,
.operations-center textarea {
  color: #f8fafc;
  background: rgba(10,12,18,.58);
  border-color: rgba(255,255,255,.12);
}
.operations-center input::placeholder,
.operations-center textarea::placeholder { color: #778195; }
.operations-center .row-item {
  color: #e5e7eb;
  background: rgba(9,11,17,.52);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 18px;
  box-shadow: 0 14px 32px rgba(0,0,0,.16);
}
.operations-center .row-item:hover {
  transform: translateY(-4px);
  border-color: rgba(214,31,58,.28);
  box-shadow: 0 22px 48px rgba(0,0,0,.22), 0 0 34px rgba(214,31,58,.12);
}
.operations-center .row-item span { color: #aeb6c4; }
.operations-center .row-item strong { color: #ffffff; }
.operations-center .secondary,
.operations-center .icon-button {
  background: rgba(255,255,255,.09);
  color: #f8fafc;
  border-color: rgba(255,255,255,.12);
}
.operations-center .primary { background: linear-gradient(135deg, #d61f3a, #8f1026); }
.operations-center .empty-state { color: #aeb6c4; }
.operations-center .empty-state strong { color: #ffffff; }
@keyframes opsPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes opsCardIn { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes opsFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(12px); } }
@keyframes opsBars { from { transform: scaleY(.25); opacity: .4; } to { transform: scaleY(1); opacity: 1; } }
@keyframes opsProgress { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
@keyframes kineticWords {
  0% { opacity: 0; transform: translateY(22px); filter: blur(5px); }
  12%, 26% { opacity: 1; transform: translateY(0); filter: blur(0); }
  38%, 100% { opacity: 0; transform: translateY(-22px); filter: blur(5px); }
}
@media (max-width: 1180px) {
  .ops-hero, .operations-workspace { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ops-title { grid-row: span 1; }
}
@media (max-width: 760px) {
  .operations-center { margin: 0; padding: 14px; border-radius: 20px; }
  .ops-hero, .operations-workspace { grid-template-columns: 1fr; }
  .operations-center .wide { grid-column: span 1; }
  .ops-mini-grid { grid-template-columns: 1fr; }
  .attendance-analytics { grid-template-columns: 1fr; }
}
`;
