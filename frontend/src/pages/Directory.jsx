import { Filter, KeyRound, Pencil, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { ConfirmDialog, EmptyState, LoadingOverlay, useToast } from "../components/UX.jsx";

const classes = ["6", "7", "8", "9", "10", "11", "12"];

export function Directory() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      setBusy(true);
      const studentData = await api("/students/");
      setStudents(studentData.results || []);
      if (user.role === "super_admin") {
        const teacherData = await api("/teachers/");
        setTeachers(teacherData.results || []);
      }
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  return (
    <div className="two-column">
      <section className="panel">
        <h2>Students</h2>
        {user.role === "super_admin" && <StudentForm onSaved={load} setMessage={setMessage} />}
        <Table
          type="students"
          rows={students}
          columns={["student_id", "name", "email", "class_level", "division", "roll_number"]}
          editable={user.role === "super_admin"}
          onSaved={load}
          setMessage={setMessage}
        />
      </section>
      {user.role === "super_admin" && (
        <section className="panel">
          <h2>Teachers</h2>
          <TeacherForm onSaved={load} setMessage={setMessage} />
          <Table
            type="teachers"
            rows={teachers}
            columns={["teacher_id", "name", "email", "subjects", "assigned_classes"]}
            editable
            onSaved={load}
            setMessage={setMessage}
          />
        </section>
      )}
      <LoadingOverlay show={busy} label="Loading people" />
      {message && <div className="inline-message">{message}</div>}
    </div>
  );
}

function StudentForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ name: "", email: "", class_level: "10", division: "A", roll_number: "" });
  async function submit(event) {
    event.preventDefault();
    try {
      const result = await api("/students/", { method: "POST", body: JSON.stringify(form) });
      setMessage(`Created ${result.student.student_id} with default password ${result.default_password}`);
      setForm({ name: "", email: "", class_level: "10", division: "A", roll_number: "" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <input placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      <select value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })}>{classes.map((item) => <option key={item}>{item}</option>)}</select>
      <input placeholder="Division" value={form.division} onChange={(event) => setForm({ ...form, division: event.target.value })} />
      <input placeholder="Roll" value={form.roll_number} onChange={(event) => setForm({ ...form, roll_number: event.target.value })} />
      <button className="icon-button" title="Add student"><Plus size={18} /></button>
    </form>
  );
}

function TeacherForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ name: "", email: "", subjects: "Mathematics", assigned_classes: "10" });
  async function submit(event) {
    event.preventDefault();
    const payload = {
      name: form.name,
      email: form.email,
      subjects: form.subjects.split(",").map((item) => item.trim()).filter(Boolean),
      assigned_classes: form.assigned_classes.split(",").map((item) => item.trim()).filter(Boolean),
    };
    try {
      const result = await api("/teachers/", { method: "POST", body: JSON.stringify(payload) });
      setMessage(`Created ${result.teacher.teacher_id} with default password ${result.default_password}`);
      setForm({ name: "", email: "", subjects: "Mathematics", assigned_classes: "10" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <input placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      <input placeholder="Subjects" value={form.subjects} onChange={(event) => setForm({ ...form, subjects: event.target.value })} />
      <input placeholder="Classes" value={form.assigned_classes} onChange={(event) => setForm({ ...form, assigned_classes: event.target.value })} />
      <button className="icon-button" title="Add teacher"><Plus size={18} /></button>
    </form>
  );
}

function Table({ type, rows, columns, editable, onSaved, setMessage }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState(columns[0]);
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const toast = useToast();
  const path = type === "students" ? "/students/" : "/teachers/";
  const pageSize = 6;

  const preparedRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        const matchesSearch = !needle || columns.some((column) => String(Array.isArray(row[column]) ? row[column].join(", ") : row[column] || "").toLowerCase().includes(needle));
        const matchesFilter = filter === "all" || row.class_level === filter || (Array.isArray(row.assigned_classes) && row.assigned_classes.includes(filter));
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => String(a[sort] || "").localeCompare(String(b[sort] || "")));
  }, [rows, columns, query, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(preparedRows.length / pageSize));
  const visibleRows = preparedRows.slice((page - 1) * pageSize, page * pageSize);

  function start(row) {
    setEditing(row.id);
    setDraft({
      ...row,
      subjects: Array.isArray(row.subjects) ? row.subjects.join(", ") : row.subjects,
      assigned_classes: Array.isArray(row.assigned_classes) ? row.assigned_classes.join(", ") : row.assigned_classes,
    });
  }

  async function save(row) {
    const payload = type === "teachers"
      ? {
          name: draft.name,
          subjects: String(draft.subjects || "").split(",").map((item) => item.trim()).filter(Boolean),
          assigned_classes: String(draft.assigned_classes || "").split(",").map((item) => item.trim()).filter(Boolean),
        }
      : {
          name: draft.name,
          class_level: draft.class_level,
          division: draft.division,
          roll_number: draft.roll_number,
          profile_photo: draft.profile_photo || "",
        };
    try {
      await api(`${path}${row.id}/`, { method: "PUT", body: JSON.stringify(payload) });
      setEditing(null);
      setMessage("Record updated");
      toast?.show("Record updated");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function remove(row) {
    try {
      await api(`${path}${row.id}/`, { method: "DELETE" });
      setMessage("Record deleted");
      toast?.show("Record deleted");
      setConfirm(null);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function reset(row) {
    try {
      const result = await api(`/auth/users/${row.user_id}/reset-password/`, { method: "POST" });
      setMessage(`Password reset to ${result.default_password}`);
      toast?.show("Password reset to default");
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function force(row) {
    try {
      await api(`/auth/users/${row.user_id}/force-password-change/`, { method: "POST" });
      setMessage("Password change forced");
      toast?.show("Password change forced");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  return (
    <>
    <div className="table-tools">
      <label className="search-box">
        <Search size={16} />
        <input placeholder={`Search ${type}`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </label>
      <label className="select-tool">
        <Filter size={16} />
        <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
          <option value="all">All classes</option>
          {classes.map((item) => <option key={item} value={item}>Class {item}</option>)}
        </select>
      </label>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort records">
        {columns.map((column) => <option key={column} value={column}>Sort by {column.replace("_", " ")}</option>)}
      </select>
    </div>
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column.replace("_", " ")}</th>)}<th>Status</th>{editable && <th>Quick actions</th>}</tr></thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column}>
                  {editing === row.id && !["student_id", "teacher_id", "email"].includes(column) ? (
                    <input value={draft[column] || ""} onChange={(event) => setDraft({ ...draft, [column]: event.target.value })} />
                  ) : Array.isArray(row[column]) ? row[column].join(", ") : row[column]}
                </td>
              ))}
              <td><span className="status-badge">Active</span></td>
              {editable && (
                <td>
                  {editing === row.id ? (
                    <>
                      <button className="icon-button" title="Save" onClick={() => save(row)}><Save size={16} /></button>
                      <button className="icon-button" title="Cancel" onClick={() => setEditing(null)}><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button className="icon-button" title="Edit" onClick={() => start(row)}><Pencil size={16} /></button>
                      <button className="icon-button" title="Delete" onClick={() => setConfirm(row)}><Trash2 size={16} /></button>
                      <button className="icon-button" title="Reset password" onClick={() => reset(row)}><RotateCcw size={16} /></button>
                      <button className="icon-button" title="Change password" onClick={() => setPasswordTarget(row)}><KeyRound size={16} /></button>
                      <button className="icon-button" title="Force password change" onClick={() => force(row)}><KeyRound size={16} /></button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {visibleRows.length === 0 && <EmptyState title="No matching records" message="Adjust search or filters to see more people." />}
    </div>
    <div className="pagination">
      <button className="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button className="secondary" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
    </div>
    <ConfirmDialog
      open={Boolean(confirm)}
      title={`Delete ${confirm?.name}?`}
      message="This will remove the linked login and profile record. Existing data in other modules is left untouched by this action."
      confirmLabel="Delete"
      onCancel={() => setConfirm(null)}
      onConfirm={() => remove(confirm)}
    />
    <PasswordModal target={passwordTarget} onClose={() => setPasswordTarget(null)} setMessage={setMessage} />
    </>
  );
}

function PasswordModal({ target, onClose, setMessage }) {
  const [form, setForm] = useState({ new_password: "", confirm_password: "", force_password_change: true });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!target) return null;

  async function submit(event) {
    event.preventDefault();
    if (form.new_password !== form.confirm_password) {
      toast?.show("Confirm password does not match", "error");
      return;
    }
    setBusy(true);
    try {
      await api(`/auth/users/${target.user_id}/reset-password/`, { method: "POST", body: JSON.stringify(form) });
      setMessage("Password changed successfully");
      toast?.show("Password changed successfully");
      onClose();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" role="dialog" aria-modal="true" onSubmit={submit}>
        <h2>Change password</h2>
        <p>Set a strong temporary password for {target.name}. The password is never displayed after saving.</p>
        <input type="password" placeholder="New password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} required />
        <input type="password" placeholder="Confirm password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required />
        <label className="check-row"><input type="checkbox" checked={form.force_password_change} onChange={(event) => setForm({ ...form, force_password_change: event.target.checked })} /> Force password reset on next login</label>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>Update password</button>
        </div>
      </form>
    </div>
  );
}
