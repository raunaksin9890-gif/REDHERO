import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { EmptyState, LoadingOverlay, useToast } from "../components/UX.jsx";

const QUESTION_TYPES = [
  ["mcq", "MCQ"],
  ["true_false", "True / False"],
  ["short", "Short Answer"],
  ["long", "Long Answer"],
];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export function PracticeProgress() {
  const { user } = useAuth();
  const [active, setActive] = useState(user.role === "student" ? "daily" : "bank");
  const [state, setState] = useState({ bank: [], daily: null, mistakes: [], weak: [], plan: null, analytics: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const toast = useToast();

  async function load() {
    try {
      setBusy(true);
      setMessage("");
      const requests = user.role === "student"
        ? [
            api("/practice/daily/").catch(() => ({ session: null })),
            api("/practice/mistakes/").catch(() => ({ results: [] })),
            api("/practice/weak-topics/").catch(() => ({ results: [] })),
            api("/practice/study-plan/").catch(() => ({ plan: null })),
          ]
        : [
            api("/question-bank/").catch(() => ({ results: [] })),
            api("/practice/analytics/").catch(() => ({ analytics: null })),
          ];
      const result = await Promise.all(requests);
      if (user.role === "student") {
        setState((current) => ({ ...current, daily: result[0].session, mistakes: result[1].results || [], weak: result[2].results || [], plan: result[3].plan }));
      } else {
        setState((current) => ({ ...current, bank: result[0].results || [], analytics: result[1].analytics }));
      }
    } catch (err) {
      setMessage(err.message || "Unable to load Practice & Progress.");
      toast?.show("Unable to load Practice & Progress.", "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [user.role]);

  const tabs = user.role === "student"
    ? [["daily", "Daily Practice"], ["weak", "Weak Topics"], ["mistakes", "My Mistakes"], ["planner", "Study Planner"]]
    : [["bank", "Question Bank"], ["analytics", "Practice Analytics"]];

  return (
    <div className="practice-center">
      <style>{practiceStyles}</style>
      <header className="practice-head">
        <div>
          <h1>Practice & Progress</h1>
          <p>{user.role === "student" ? "Daily practice, mistakes, weak topics, and planner" : "Question bank and class performance analytics"}</p>
        </div>
        <button className="practice-soft-button" onClick={load}><RefreshCw size={16} /> Refresh</button>
      </header>
      <nav className="practice-tabs">
        {tabs.map(([key, label]) => <button className={active === key ? "active" : ""} key={key} onClick={() => setActive(key)}>{label}</button>)}
      </nav>
      {user.role === "student" ? (
        <>
          {active === "daily" && <DailyPractice session={state.daily} onSaved={load} setMessage={setMessage} />}
          {active === "weak" && <WeakTopics rows={state.weak} />}
          {active === "mistakes" && <Mistakes rows={state.mistakes} onSaved={load} setMessage={setMessage} />}
          {active === "planner" && <StudyPlanner plan={state.plan} onSaved={load} setMessage={setMessage} />}
        </>
      ) : (
        <>
          {active === "bank" && <QuestionBank rows={state.bank} onSaved={load} setMessage={setMessage} />}
          {active === "analytics" && <PracticeAnalytics analytics={state.analytics} />}
        </>
      )}
      <LoadingOverlay show={busy} label="Loading practice data" />
      {message && <div className="practice-message">{message}</div>}
    </div>
  );
}

function QuestionBank({ rows, onSaved, setMessage }) {
  const [filters, setFilters] = useState({ search: "", class_level: "", subject: "", chapter: "", difficulty: "", question_type: "" });
  const [form, setForm] = useState(emptyQuestion());
  const [editing, setEditing] = useState(null);
  const toast = useToast();
  const filteredRows = useMemo(() => rows.filter((row) => {
    const text = `${row.text} ${row.subject} ${row.chapter}`.toLowerCase();
    return (!filters.search || text.includes(filters.search.toLowerCase()))
      && (!filters.class_level || row.class_level === filters.class_level)
      && (!filters.subject || row.subject.toLowerCase().includes(filters.subject.toLowerCase()))
      && (!filters.chapter || row.chapter.toLowerCase().includes(filters.chapter.toLowerCase()))
      && (!filters.difficulty || row.difficulty === filters.difficulty)
      && (!filters.question_type || row.question_type === filters.question_type);
  }), [rows, filters]);

  async function save(event) {
    event.preventDefault();
    const payload = editing ? { ...form, id: editing.id } : form;
    try {
      await api("/question-bank/", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      setMessage(editing ? "Question updated" : "Question added");
      toast?.show(editing ? "Question updated" : "Question added");
      setEditing(null);
      setForm(emptyQuestion());
      onSaved();
    } catch {
      setMessage("Unable to save this question.");
      toast?.show("Unable to save this question.", "error");
    }
  }

  async function remove(row) {
    try {
      await api(`/question-bank/?id=${row.id}`, { method: "DELETE" });
      setMessage("Question deleted");
      onSaved();
    } catch {
      setMessage("Unable to delete this question.");
    }
  }

  function beginEdit(row) {
    setEditing(row);
    setForm({
      class_level: row.class_level,
      subject: row.subject,
      chapter: row.chapter,
      question_type: row.question_type,
      difficulty: row.difficulty,
      text: row.text,
      options: row.options?.length ? row.options : ["", "", "", ""],
      correct_answer: row.correct_answer || "",
      expected_answer: row.expected_answer || "",
      explanation: row.explanation || "",
      marks: row.marks || "1",
    });
  }

  return (
    <div className="practice-grid">
      <Panel title={editing ? "Edit Question" : "Add Question"} icon={Plus} className="span-3">
        <QuestionForm form={form} setForm={setForm} onSubmit={save} editing={editing} onCancel={() => { setEditing(null); setForm(emptyQuestion()); }} />
      </Panel>
      <Panel title="Question Bank" icon={FileQuestion} className="span-3" action={<span>{filteredRows.length} questions</span>}>
        <FilterBar filters={filters} setFilters={setFilters} />
        <div className="practice-list">
          {filteredRows.map((row) => (
            <article key={row.id}>
              <div className="practice-icon"><FileQuestion size={18} /></div>
              <div>
                <strong>{row.text}</strong>
                <span>Class {row.class_level} / {row.subject} / {row.chapter}</span>
                <small>{labelType(row.question_type)} / {row.difficulty} / {row.marks} marks</small>
              </div>
              <StatusBadge value={row.correct_answer || row.expected_answer || "Descriptive"} />
              <div className="practice-actions">
                <button className="practice-icon-button" title="Edit question" onClick={() => beginEdit(row)}><Pencil size={15} /></button>
                <button className="practice-icon-button danger" title="Delete question" onClick={() => remove(row)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
          {filteredRows.length === 0 && <EmptyState title="No questions available" message="Add questions for your classes and subjects." />}
        </div>
      </Panel>
    </div>
  );
}

function QuestionForm({ form, setForm, onSubmit, editing, onCancel }) {
  return (
    <form className="practice-form" onSubmit={onSubmit}>
      <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required />
      <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
      <input placeholder="Chapter / Topic" value={form.chapter} onChange={(event) => setForm({ ...form, chapter: event.target.value })} required />
      <select value={form.question_type} onChange={(event) => setForm({ ...form, question_type: event.target.value, correct_answer: "" })}>
        {QUESTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>
        {DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}
      </select>
      <input inputMode="decimal" placeholder="Marks" value={form.marks} onChange={(event) => setForm({ ...form, marks: event.target.value })} required />
      <textarea placeholder="Question text" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} required />
      {form.question_type === "mcq" && form.options.map((option, index) => <input key={index} placeholder={`Option ${String.fromCharCode(65 + index)}`} value={option} onChange={(event) => setForm({ ...form, options: form.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} required={index < 2} />)}
      {form.question_type === "true_false" && <select value={form.correct_answer} onChange={(event) => setForm({ ...form, correct_answer: event.target.value })} required><option value="">Correct Answer</option><option>True</option><option>False</option></select>}
      {form.question_type === "mcq" && <input placeholder="Correct Answer or option letter" value={form.correct_answer} onChange={(event) => setForm({ ...form, correct_answer: event.target.value })} required />}
      {["short", "long"].includes(form.question_type) && <textarea placeholder="Expected/model answer" value={form.expected_answer} onChange={(event) => setForm({ ...form, expected_answer: event.target.value })} />}
      <textarea placeholder="Explanation" value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} />
      <button className="practice-red-button"><Save size={16} /> {editing ? "Save Question" : "Add Question"}</button>
      {editing && <button className="practice-soft-button" type="button" onClick={onCancel}><X size={16} /> Cancel</button>}
    </form>
  );
}

function DailyPractice({ session, onSaved, setMessage }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setAnswers(Object.fromEntries((session?.questions || []).map((question) => [question.id, question.answer || ""])));
    setIndex(0);
  }, [session?.id]);
  if (!session) return <Panel title="Daily Practice" icon={ClipboardList}><EmptyState title="Unable to load today's practice." /></Panel>;
  const question = (session.questions || [])[index];
  async function saveAnswer(qid = question?.id, value = answers[qid]) {
    if (!qid || session.status === "submitted") return;
    try {
      await api(`/practice/sessions/${session.id}/answers/`, { method: "POST", body: JSON.stringify({ question_id: qid, answer: value || "" }) });
    } catch {
      setMessage("Unable to save your answer. Please try again.");
    }
  }
  async function submit() {
    setSubmitting(true);
    try {
      await api(`/practice/sessions/${session.id}/submit/`, { method: "POST" });
      setMessage("Your practice has been submitted.");
      onSaved();
    } catch {
      setMessage("Unable to submit this practice.");
      setSubmitting(false);
    }
  }
  return (
    <div className="practice-grid">
      <MetricDeck metrics={[["Today's Practice", session.total_questions], ["Correct", session.correct_count], ["Incorrect", session.incorrect_count], ["Accuracy", `${Math.round(session.accuracy || 0)}%`]]} />
      <Panel title="Daily Practice" icon={ClipboardList} className="span-2" action={<span>{session.questions_per_day} configured</span>}>
        {!question && <EmptyState title="No questions available" message="No questions are available for your class yet." />}
        {question && (
          <section className="practice-question">
            <header><strong>Question {index + 1} of {session.questions.length}</strong><span>{question.subject} / {question.chapter} / {question.difficulty}</span></header>
            <h2>{question.text}</h2>
            {["mcq", "true_false"].includes(question.question_type) ? (
              <div className="practice-options">
                {(question.options || []).map((option) => <button className={answers[question.id] === option ? "active" : ""} key={option} disabled={session.status === "submitted"} onClick={() => { setAnswers({ ...answers, [question.id]: option }); saveAnswer(question.id, option); }}>{option}</button>)}
              </div>
            ) : (
              <textarea value={answers[question.id] || ""} disabled={session.status === "submitted"} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} onBlur={() => saveAnswer()} placeholder="Write your answer" />
            )}
            {session.status === "submitted" && (
              <div className={`answer-review ${question.correct ? "correct" : "wrong"}`}>
                <strong>{question.correct ? "Correct" : "Needs review"}</strong>
                <span>Correct answer: {question.correct_answer || question.expected_answer || "-"}</span>
                {question.explanation && <small>{question.explanation}</small>}
              </div>
            )}
          </section>
        )}
        <div className="practice-actions">
          <button className="practice-soft-button" disabled={index === 0} onClick={() => setIndex(Math.max(0, index - 1))}>Previous</button>
          <button className="practice-soft-button" disabled={!question || index === session.questions.length - 1} onClick={() => { saveAnswer(); setIndex(Math.min(session.questions.length - 1, index + 1)); }}>Save & Next</button>
          {session.status !== "submitted" && <button className="practice-red-button" disabled={!session.questions.length || submitting} onClick={submit}><CheckCircle2 size={16} /> Submit</button>}
        </div>
      </Panel>
      <Panel title="Topic Performance" icon={BarChart3}>
        <TopicMiniList rows={session.topic_performance || []} />
      </Panel>
    </div>
  );
}

function Mistakes({ rows, onSaved, setMessage }) {
  async function practice(row) {
    try {
      await api(`/practice/mistakes/${row.id}/practice-again/`, { method: "POST" });
      setMessage("Focused practice is ready in Daily Practice.");
      onSaved();
    } catch {
      setMessage("Unable to start mistake practice.");
    }
  }
  return (
    <Panel title="My Mistakes" icon={Target} className="span-3">
      <div className="practice-list">
        {rows.map((row) => (
          <article key={row.id}>
            <div className="practice-icon"><Target size={18} /></div>
            <div>
              <strong>{row.question?.text || "Question"}</strong>
              <span>{row.subject} / {row.chapter}</span>
              <small>{row.wrong_attempts} wrong attempts / last {formatDate(row.last_wrong_at)}</small>
            </div>
            <StatusBadge value={row.resolved ? "Resolved" : "Needs Practice"} />
            <button className="practice-red-button" onClick={() => practice(row)}>Practice Again</button>
          </article>
        ))}
        {rows.length === 0 && <EmptyState title="Great work! No mistakes are currently waiting for revision." />}
      </div>
    </Panel>
  );
}

function WeakTopics({ rows }) {
  return (
    <Panel title="Weak Topic Detector" icon={BarChart3} className="span-3">
      <DataTable columns={["Subject", "Topic", "Accuracy", "Attempts", "Status"]} rows={rows.map((row) => [row.subject, row.chapter, `${Math.round(row.accuracy || 0)}%`, row.attempts, <StatusBadge value={row.status} />])} empty="Complete more practice to see your topic analysis." />
    </Panel>
  );
}

function StudyPlanner({ plan, onSaved, setMessage }) {
  async function complete(task) {
    try {
      await api(`/practice/study-plan/tasks/${task.task_id}/complete/`, { method: "POST", body: JSON.stringify({ completed: !task.completed }) });
      onSaved();
    } catch {
      setMessage("Unable to update this study task.");
    }
  }
  return (
    <Panel title="Study Planner" icon={ListChecks} className="span-3">
      <div className="practice-list">
        {(plan?.tasks || []).map((task) => (
          <article key={task.task_id}>
            <div className="practice-icon"><ListChecks size={18} /></div>
            <div>
              <strong>{task.title}</strong>
              <span>{task.category} / {task.subject || "Study"} {task.chapter ? `/ ${task.chapter}` : ""}</span>
              <small>{task.minutes} min</small>
            </div>
            {task.link ? <Link className="practice-soft-button" to={task.link}>Open</Link> : <StatusBadge value="Planned" />}
            <button className={task.completed ? "practice-soft-button" : "practice-red-button"} onClick={() => complete(task)}>{task.completed ? "Completed" : "Mark Done"}</button>
          </article>
        ))}
        {(!plan?.tasks || plan.tasks.length === 0) && <EmptyState title="No study tasks scheduled for today." />}
      </div>
    </Panel>
  );
}

function PracticeAnalytics({ analytics }) {
  const data = analytics || { class_performance: [], subject_performance: [], difficult_topics: [], practice_participation: 0 };
  return (
    <div className="practice-grid">
      <MetricDeck metrics={[["Practice Sessions", data.practice_participation || 0], ["Difficult Topics", data.difficult_topics?.length || 0], ["Classes", data.class_performance?.length || 0], ["Subjects", data.subject_performance?.length || 0]]} />
      <Panel title="Class Performance" icon={BarChart3}>
        <TopicMiniList rows={(data.class_performance || []).map((row) => ({ chapter: row.label, accuracy: row.accuracy, attempts: row.attempts, status: row.accuracy >= 75 ? "Strong" : row.accuracy >= 50 ? "Needs Practice" : "Weak" }))} />
      </Panel>
      <Panel title="Subject Accuracy" icon={BookOpen}>
        <TopicMiniList rows={(data.subject_performance || []).map((row) => ({ chapter: row.label, accuracy: row.accuracy, attempts: row.attempts, status: row.accuracy >= 75 ? "Strong" : row.accuracy >= 50 ? "Needs Practice" : "Weak" }))} />
      </Panel>
      <Panel title="Most Difficult Topics" icon={Target} className="span-3">
        <DataTable columns={["Class", "Subject", "Topic", "Accuracy", "Attempts", "Status"]} rows={(data.difficult_topics || []).map((row) => [row.class_level, row.subject, row.chapter, `${Math.round(row.accuracy || 0)}%`, row.attempts, <StatusBadge value={row.status} />])} empty="No practice analytics available yet." />
      </Panel>
    </div>
  );
}

function FilterBar({ filters, setFilters }) {
  return (
    <div className="practice-filter">
      <Search size={16} />
      <input placeholder="Search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
      <input placeholder="Class" value={filters.class_level} onChange={(event) => setFilters({ ...filters, class_level: event.target.value })} />
      <input placeholder="Subject" value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })} />
      <input placeholder="Chapter" value={filters.chapter} onChange={(event) => setFilters({ ...filters, chapter: event.target.value })} />
      <select value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}><option value="">Difficulty</option>{DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={filters.question_type} onChange={(event) => setFilters({ ...filters, question_type: event.target.value })}><option value="">Type</option>{QUESTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
  );
}

function Panel({ title, icon: Icon, className = "", action, children }) {
  return (
    <section className={`practice-panel ${className}`}>
      <header><h2><Icon size={18} /> {title}</h2>{action}</header>
      {children}
    </section>
  );
}

function MetricDeck({ metrics }) {
  return (
    <section className="practice-metric-deck span-3">
      {metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </section>
  );
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="practice-table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TopicMiniList({ rows }) {
  if (!rows.length) return <EmptyState title="Complete more practice to unlock topic analysis." />;
  return (
    <div className="topic-mini-list">
      {rows.slice(0, 8).map((row, index) => (
        <div key={`${row.subject || "row"}-${row.chapter}-${index}`}>
          <span>{row.subject ? `${row.subject} / ` : ""}{row.chapter}</span>
          <strong>{Math.round(row.accuracy || 0)}%</strong>
          <small>{row.attempts} attempts</small>
          <i style={{ width: `${Math.max(4, Math.min(row.accuracy || 0, 100))}%` }} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ value }) {
  return <span className={`practice-status ${String(value || "").toLowerCase().replace(/\s+/g, "-")}`}>{value}</span>;
}

function emptyQuestion() {
  return { class_level: "", subject: "", chapter: "", question_type: "mcq", difficulty: "Medium", text: "", options: ["", "", "", ""], correct_answer: "", expected_answer: "", explanation: "", marks: "1" };
}

function labelType(value) {
  return QUESTION_TYPES.find(([key]) => key === value)?.[1] || value;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const practiceStyles = `
.practice-center {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(14px, 2vw, 24px);
  color: #eef4ff;
  background: linear-gradient(135deg, #07101d 0%, #091625 48%, #120b15 100%);
  border: 1px solid rgba(100,116,139,.2);
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 24px 80px rgba(2,6,23,.24);
}
.practice-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.practice-head h1 { margin: 0 0 5px; font-size: clamp(24px, 3vw, 34px); color: #fff; letter-spacing: 0; }
.practice-head p { margin: 0; color: #8ea0b8; font-size: 13px; font-weight: 800; }
.practice-tabs { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
.practice-tabs button, .practice-soft-button, .practice-red-button {
  min-height: 36px;
  border-radius: 6px;
  border: 1px solid rgba(148,163,184,.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  color: #dbeafe;
  background: rgba(4,10,20,.44);
  font-weight: 900;
  cursor: pointer;
}
.practice-tabs button.active, .practice-red-button { color: #fff; border-color: rgba(248,113,113,.34); background: linear-gradient(135deg, #b9152d, #7f1020); }
.practice-soft-button { text-decoration: none; background: rgba(148,163,184,.08); }
.practice-red-button:hover, .practice-soft-button:hover, .practice-tabs button:hover, .practice-icon-button:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(214,31,58,.18); }
.practice-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
.span-2 { grid-column: span 2; }
.span-3 { grid-column: 1 / -1; }
.practice-panel, .practice-metric-deck article {
  border: 1px solid rgba(148,163,184,.18);
  background: linear-gradient(180deg, rgba(15,26,42,.96), rgba(9,18,31,.96));
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0,0,0,.24);
}
.practice-panel { padding: 14px; overflow: hidden; }
.practice-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.practice-panel h2 { display: flex; align-items: center; gap: 9px; margin: 0; color: #fff; font-size: 16px; letter-spacing: 0; }
.practice-panel h2 svg { color: #fb7185; }
.practice-panel header > span, .practice-panel small { color: #8ea0b8; font-size: 12px; }
.practice-metric-deck { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.practice-metric-deck article { min-height: 82px; padding: 14px; display: grid; align-content: center; gap: 7px; }
.practice-metric-deck span { color: #8ea0b8; font-size: 12px; font-weight: 850; }
.practice-metric-deck strong { color: #fff; font-size: clamp(22px, 2vw, 30px); overflow-wrap: anywhere; }
.practice-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.practice-form textarea { grid-column: span 2; min-height: 42px; resize: vertical; }
.practice-form input, .practice-form select, .practice-form textarea, .practice-filter input, .practice-filter select, .practice-question textarea {
  border: 1px solid rgba(148,163,184,.18);
  border-radius: 6px;
  background: rgba(4,10,20,.72);
  color: #f8fafc;
  padding: 10px;
}
.practice-filter { display: grid; grid-template-columns: auto repeat(6, minmax(90px, 1fr)); align-items: center; gap: 8px; margin-bottom: 10px; padding: 10px; border: 1px solid rgba(148,163,184,.16); border-radius: 8px; background: rgba(4,10,20,.42); color: #8ea0b8; }
.practice-list { display: grid; gap: 10px; }
.practice-list > article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(148,163,184,.16);
  border-radius: 8px;
  background: rgba(4,10,20,.42);
}
.practice-list strong { display: block; color: #fff; overflow-wrap: anywhere; }
.practice-list span, .practice-list small { display: block; color: #8ea0b8; font-size: 12px; line-height: 1.45; }
.practice-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 8px; color: #dbeafe; background: linear-gradient(135deg, #1d4ed8, #5146d8); }
.practice-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.practice-icon-button { width: 34px; min-width: 34px; height: 34px; display: inline-grid; place-items: center; border-radius: 6px; border: 1px solid rgba(96,165,250,.28); color: #9cc5ff; background: rgba(37,99,235,.12); cursor: pointer; }
.practice-icon-button.danger { color: #fb7185; border-color: rgba(251,113,133,.28); background: rgba(214,31,58,.12); }
.practice-status { display: inline-flex; min-height: 25px; align-items: center; padding: 0 9px; border-radius: 999px; color: #bfdbfe; background: rgba(59,130,246,.16); border: 1px solid rgba(96,165,250,.26); font-size: 12px; font-weight: 900; text-transform: capitalize; white-space: nowrap; }
.practice-status.weak, .practice-status.needs-practice { color: #fecdd3; background: rgba(214,31,58,.16); border-color: rgba(251,113,133,.24); }
.practice-status.strong, .practice-status.resolved, .practice-status.correct { color: #bbf7d0; background: rgba(34,197,94,.15); border-color: rgba(34,197,94,.22); }
.practice-question { display: grid; gap: 12px; padding: 12px; border: 1px solid rgba(148,163,184,.14); border-radius: 8px; background: rgba(4,10,20,.42); }
.practice-question header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.practice-question h2 { margin: 0; color: #fff; font-size: 18px; line-height: 1.35; letter-spacing: 0; }
.practice-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.practice-options button {
  min-height: 44px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(148,163,184,.18);
  color: #dbeafe;
  background: rgba(4,10,20,.58);
  text-align: left;
  font-weight: 850;
  cursor: pointer;
}
.practice-options button.active { border-color: rgba(251,113,133,.48); background: rgba(214,31,58,.24); color: #fff; }
.answer-review { display: grid; gap: 5px; padding: 10px; border-radius: 8px; border: 1px solid rgba(251,113,133,.22); background: rgba(214,31,58,.12); }
.answer-review.correct { border-color: rgba(34,197,94,.22); background: rgba(34,197,94,.12); }
.practice-table-wrap { max-width: 100%; overflow: auto; border: 1px solid rgba(148,163,184,.16); border-radius: 8px; background: rgba(5,12,22,.72); }
.practice-table-wrap table { width: 100%; border-collapse: collapse; font-size: 13px; }
.practice-table-wrap th, .practice-table-wrap td { padding: 12px; border-bottom: 1px solid rgba(148,163,184,.13); color: #dbeafe; text-align: left; white-space: nowrap; vertical-align: top; }
.practice-table-wrap th { position: sticky; top: 0; z-index: 1; background: #0d1a2c; color: #8ea0b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
.topic-mini-list { display: grid; gap: 9px; }
.topic-mini-list div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 10px; padding: 10px; border-radius: 8px; border: 1px solid rgba(148,163,184,.13); background: rgba(4,10,20,.42); }
.topic-mini-list span { color: #fff; font-weight: 850; }
.topic-mini-list strong { color: #fff; }
.topic-mini-list small { color: #8ea0b8; grid-column: 1 / -1; }
.topic-mini-list i { display: block; grid-column: 1 / -1; height: 8px; border-radius: 999px; background: linear-gradient(90deg, #d61f3a, #7ed957); }
.practice-message { margin-top: 12px; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(251,113,133,.36); background: #0d1a2c; color: #fff; }
.practice-center .empty-state { color: #8ea0b8; }
.practice-center .empty-state strong { color: #fff; }
@media (max-width: 1240px) {
  .practice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .span-2, .span-3 { grid-column: 1 / -1; }
  .practice-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .practice-filter { grid-template-columns: auto repeat(3, minmax(90px, 1fr)); }
}
@media (max-width: 760px) {
  .practice-center { margin: 0; padding: 12px; }
  .practice-head, .practice-list > article, .practice-question header { display: grid; align-items: stretch; grid-template-columns: 1fr; }
  .practice-grid, .practice-metric-deck, .practice-form, .practice-filter, .practice-options { grid-template-columns: 1fr; }
  .practice-form textarea { grid-column: auto; }
  .practice-table-wrap table { min-width: max-content; }
}
`;
