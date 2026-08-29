import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Clock3,
  Download,
  FileCheck2,
  FileQuestion,
  IndianRupee,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Trophy,
  Unlock,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { AnimatedValue, ConfirmDialog, EmptyState, LoadingOverlay, useToast } from "../components/UX.jsx";

const MODULES = [
  { key: "attendance", title: "Attendance", icon: ClipboardCheck },
  { key: "marks", title: "Marks & Results", icon: Trophy },
  { key: "assignments", title: "Assignments", icon: ListChecks },
  { key: "exams", title: "Exams", icon: FileCheck2 },
  { key: "timetable", title: "Timetable", icon: CalendarDays },
  { key: "fees", title: "Fee Structure", icon: WalletCards },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function Operations() {
  const { user } = useAuth();
  const [data, setData] = useState({ attendance: [], marks: [], assignments: [], exams: [], timetables: [], fees: [], feeSummary: {}, feeStudentRecords: [], paymentModes: [], students: [], audit: [] });
  const [active, setActive] = useState("hub");
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
        api("/exams/"),
        api("/timetables/"),
        api("/fees/"),
        user.role !== "student" ? api("/students/") : Promise.resolve({ results: [] }),
        user.role === "super_admin" ? api("/attendance/audit/") : Promise.resolve({ results: [] }),
      ];
      const [attendance, marks, assignments, exams, timetables, fees, students, audit] = await Promise.all(requests);
      setData({
        attendance: attendance.results || [],
        marks: marks.results || [],
        assignments: assignments.results || [],
        exams: exams.results || [],
        timetables: timetables.results || [],
        fees: fees.results || [],
        feeSummary: fees.summary || {},
        feeStudentRecords: fees.student_records || [],
        paymentModes: fees.payment_modes || [],
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

  const module = MODULES.find((item) => item.key === active);

  return (
    <div className="operations-center">
      <style>{operationsCenterStyles}</style>
      <header className="ops-page-head">
        <div>
          <h1>{active === "hub" ? `${roleTitle(user.role)} Operations` : module.title}</h1>
          <p>Operations {active !== "hub" && <span>/ {module.title}</span>}</p>
        </div>
        {active !== "hub" && (
          <button className="ops-soft-button" onClick={() => setActive("hub")}>
            <ArrowLeft size={16} /> Operations Hub
          </button>
        )}
      </header>

      {active === "hub" ? (
        <OperationsHub data={data} user={user} onOpen={setActive} />
      ) : (
        <OperationsDetail active={active} data={data} user={user} onSaved={load} setMessage={setMessage} />
      )}

      <LoadingOverlay show={busy} label="Loading operations" />
      {message && <div className="inline-message">{message}</div>}
    </div>
  );
}

function OperationsHub({ data, user, onOpen }) {
  const summaries = useOpsSummaries(data, user);
  const today = todayPeriods(data.timetables);

  return (
    <>
      <section className="ops-summary-grid">
        {Object.values(summaries).map((summary) => <ModuleCard key={summary.key} summary={summary} onOpen={() => onOpen(summary.key)} />)}
      </section>

      <section className="ops-hub-layout">
        <Panel title="Attendance Trend" icon={Activity} className="span-2">
          <LineChart values={monthlyAttendance(data.attendance).map((item) => item.percent)} />
        </Panel>
        <Panel title="Today" icon={CalendarClock}>
          <div className="ops-timeline">
            {today.map((period, index) => (
              <div className={index === 0 ? "active" : ""} key={`${period.day}-${period.time}-${period.subject}-${index}`}>
                <strong>{period.time || "-"}</strong>
                <span>{period.subject || "-"} {period.class_level ? `/ Class ${period.class_level}` : ""}</span>
              </div>
            ))}
            {today.length === 0 && <EmptyState title="No timetable entries" />}
          </div>
        </Panel>
        <Panel title="Recent Marks" icon={Trophy}>
          <CompactTable columns={["Subject", "Exam", "Percent"]} rows={data.marks.slice(0, 5).map((row) => [row.subject, row.exam_type, formatPercent(row.percentage)])} />
        </Panel>
        <Panel title="Upcoming Assignments" icon={ListChecks} className="span-2">
          <div className="ops-assignment-list compact">
            {data.assignments.slice(0, 5).map((item) => (
              <article key={item.id}>
                <div className="ops-file-icon"><FileCheck2 size={17} /></div>
                <div>
                  <strong>{item.title}</strong>
                  <span>Class {item.class_level} / {item.subject} / {formatDate(item.deadline)}</span>
                </div>
                <StatusBadge value={assignmentStatus(item, user)} />
              </article>
            ))}
            {data.assignments.length === 0 && <EmptyState title="No assignments" />}
          </div>
        </Panel>
      </section>
    </>
  );
}

function ModuleCard({ summary, onOpen }) {
  const Icon = summary.icon;
  return (
    <article className="ops-module-card">
      <header>
        <div className={`ops-module-icon ${summary.tone}`}><Icon size={19} /></div>
        <div>
          <strong>{summary.title}</strong>
          <span>{summary.subtitle}</span>
        </div>
      </header>
      <div className="ops-card-value"><AnimatedValue value={summary.value} /></div>
      <div className="ops-metric-row">
        {summary.metrics.map((metric) => (
          <span key={metric.label}>
            {metric.label}
            <strong>{metric.value}</strong>
          </span>
        ))}
      </div>
      <button className="ops-red-button" onClick={onOpen}>{summary.button}</button>
    </article>
  );
}

function OperationsDetail({ active, data, user, onSaved, setMessage }) {
  if (active === "attendance") return <AttendanceDetail data={data} user={user} onSaved={onSaved} setMessage={setMessage} />;
  if (active === "marks") return <MarksDetail data={data} user={user} onSaved={onSaved} setMessage={setMessage} />;
  if (active === "assignments") return <AssignmentsDetail data={data} user={user} onSaved={onSaved} setMessage={setMessage} />;
  if (active === "exams") return <ExamsDetail data={data} user={user} onSaved={onSaved} setMessage={setMessage} />;
  if (active === "timetable") return <TimetableDetail data={data} user={user} onSaved={onSaved} setMessage={setMessage} />;
  return <FeesDetail data={data} user={user} onSaved={onSaved} setMessage={setMessage} />;
}

function AttendanceDetail({ data, user, onSaved, setMessage }) {
  const summary = attendanceSummary(data.attendance);

  const leaveCount = data.attendance.filter(
    (row) => row.left_early === true
  ).length;

  return (
    <div className="ops-detail-grid">
      {user.role !== "student" && (
        <AttendanceQuickMark
          attendance={data.attendance}
          students={data.students}
          onSaved={onSaved}
          setMessage={setMessage}
        />
      )}

      {user.role !== "student" && (
        <AttendanceForm
          students={data.students}
          onSaved={onSaved}
          setMessage={setMessage}
        />
      )}

      <MetricDeck
        metrics={[
          ["Overall Attendance", formatPercent(summary.percent)],
          ["Present", summary.present],
          ["Absent", summary.absent],
          ["Leave", leaveCount],
        ]}
      />

      <Panel title="Attendance Trend" icon={Activity} className="span-2">
        <LineChart
          values={monthlyAttendance(data.attendance).map(
            (item) => item.percent
          )}
        />
      </Panel>

      <Panel title="Attendance By Subject" icon={BarChart3}>
        <DonutChart percent={summary.percent} />
        <SubjectBreakdown rows={subjectAttendance(data.attendance)} />
      </Panel>

      <Panel title="Attendance History" icon={ClipboardCheck} className="span-3">
        <AttendanceTable
          user={user}
          rows={data.attendance}
          onSaved={onSaved}
          setMessage={setMessage}
        />
      </Panel>

      {user.role === "super_admin" && (
        <AuditPanel items={data.audit} />
      )}
    </div>
  );
}

function MarksDetail({ data, user, onSaved, setMessage }) {
  const summary = marksSummary(data.marks);
  return (
    <div className="ops-detail-grid">
      {user.role !== "student" && <MarksForm students={data.students} onSaved={onSaved} setMessage={setMessage} />}
      <MetricDeck metrics={[["Average Percentage", formatPercent(summary.average)], ["Highest", formatPercent(summary.highest)], ["Lowest", formatPercent(summary.lowest)], ["Total Records", data.marks.length]]} />
      <Panel title="Subject Results" icon={Trophy} className="span-3">
        <MarksTable user={user} rows={data.marks} onSaved={onSaved} setMessage={setMessage} />
      </Panel>
      <Panel title="Performance Graph" icon={BarChart3} className="span-2">
        <BarChart rows={data.marks.slice(0, 10).map((row) => ({ label: row.subject, value: Number(row.percentage || 0) }))} />
      </Panel>
      <Panel title="Top Results" icon={CheckCircle2}>
        <CompactTable columns={["Student", "Subject", "Percent"]} rows={[...data.marks].sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0)).slice(0, 5).map((row) => [row.student?.name || "-", row.subject, formatPercent(row.percentage)])} />
      </Panel>
    </div>
  );
}

function AssignmentsDetail({ data, user, onSaved, setMessage }) {
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const tabs = ["All", "Pending", "Submitted", "Completed"];
  const rows = data.assignments.filter((item) => {
    const status = assignmentStatus(item, user);
    const haystack = `${item.title} ${item.subject} ${item.class_level}`.toLowerCase();
    return (tab === "All" || status === tab || (tab === "Pending" && status === "Overdue")) && (!search || haystack.includes(search.toLowerCase())) && (!classFilter || item.class_level === classFilter) && (!subjectFilter || item.subject === subjectFilter);
  });
  const completed = data.assignments.filter((item) => assignmentStatus(item, user) === "Completed").length;
  const submitted = data.assignments.filter((item) => assignmentStatus(item, user) === "Submitted").length;
  const pending = data.assignments.filter((item) => ["Pending", "Overdue"].includes(assignmentStatus(item, user))).length;
  const classOptions = [...new Set(data.assignments.map((item) => item.class_level).filter(Boolean))].sort();
  const subjectOptions = [...new Set(data.assignments.map((item) => item.subject).filter(Boolean))].sort();

  return (
    <div className="ops-detail-grid">
      {user.role !== "student" && <AssignmentForm onSaved={onSaved} setMessage={setMessage} />}
      <MetricDeck metrics={[["Total Assignments", data.assignments.length], ["Submitted", submitted], ["Pending", pending], ["Completed", completed]]} />
      <Panel title="Assignments" icon={ListChecks} className="span-3" action={<Segmented tabs={tabs} value={tab} onChange={setTab} />}>
        <div className="ops-tools assignment-filters">
          <Search size={16} />
          <input placeholder="Search assignments" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">All classes</option>{classOptions.map((value) => <option key={value} value={value}>Class {value}</option>)}</select>
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">All subjects</option>{subjectOptions.map((value) => <option key={value}>{value}</option>)}</select>
        </div>
        <div className="ops-assignment-list">
          {rows.map((item) => <AssignmentRow key={item.id} item={item} user={user} onSaved={onSaved} setMessage={setMessage} />)}
          {rows.length === 0 && <EmptyState title="No assignments in this view" />}
        </div>
      </Panel>
      {user.role !== "student" && (
        <Panel title="Recent Submissions" icon={FileCheck2} className="span-3">
          <CompactTable columns={["Student", "Assignment", "Submitted On", "File", "Status"]} rows={assignmentSubmissions(data.assignments).slice(0, 8).map((row) => [row.student?.name || "-", row.assignmentTitle, formatDateTime(row.submitted_at), row.file_url ? <a href={row.file_url} target="_blank" rel="noreferrer">Open file</a> : "-", assignmentSubmissionStatus(row)])} />
        </Panel>
      )}
    </div>
  );
}

function ExamsDetail({ data, user, onSaved, setMessage }) {
  const [tab, setTab] = useState(user.role === "student" ? "Active" : "Manage");
  const [selectedId, setSelectedId] = useState("");
  const exams = data.exams || [];
  const selected = exams.find((exam) => exam.id === selectedId) || exams[0];
  const tabs = user.role === "student" ? ["Upcoming", "Active", "Completed", "Results"] : ["Manage", "Questions", "Submissions"];
  const studentRows = exams.filter((exam) => {
    if (tab === "Upcoming") return exam.status === "upcoming";
    if (tab === "Active") return exam.status === "active";
    if (tab === "Completed") return ["completed", "ended"].includes(exam.status);
    if (tab === "Results") return exam.result_published && exam.attempt;
    return true;
  });
  const activeCount = exams.filter((exam) => exam.status === "active").length;
  const completed = exams.filter((exam) => ["completed", "ended"].includes(exam.status)).length;
  const publishedResults = exams.filter((exam) => user.role === "student" ? exam.result_published && exam.attempt : exam.result_published).length;

  return (
    <div className="ops-detail-grid">
      {user.role !== "student" && <ExamForm students={data.students} onSaved={onSaved} setMessage={setMessage} />}
      <MetricDeck metrics={[["Total Exams", exams.length], ["Active", activeCount], ["Completed", completed], ["Results", publishedResults]]} />
      <Panel title="Exams" icon={FileCheck2} className="span-3" action={<Segmented tabs={tabs} value={tab} onChange={setTab} />}>
        {user.role === "student" ? (
          <div className="ops-assignment-list">
            {studentRows.map((exam) => <StudentExamCard exam={exam} key={exam.id} onSaved={onSaved} setMessage={setMessage} />)}
            {studentRows.length === 0 && <EmptyState title="No exams in this view" />}
          </div>
        ) : (
          <ExamManager tab={tab} exams={exams} selected={selected} setSelectedId={setSelectedId} onSaved={onSaved} setMessage={setMessage} />
        )}
      </Panel>
    </div>
  );
}

function ExamForm({ students = [], onSaved, setMessage }) {
  const classOptions = [...new Set(students.map((student) => student.class_level).filter(Boolean))].sort();
  const initialStart = "";
  const initialEnd = "";
  const [form, setForm] = useState({
    name: "",
    class_level: "",
    subject: "",
    instructions: "",
    exam_date: new Date().toISOString().slice(0, 10),
    start_time: initialStart,
    end_time: initialEnd,
    duration_minutes: "60",
    total_marks: "0",
    passing_marks: "0",
    is_published: false,
  });
  const toast = useToast();
  function patchForm(patch) {
    const next = { ...form, ...patch };
    if (patch.start_time || patch.end_time) {
      const minutes = minutesBetween(next.start_time, next.end_time);
      if (minutes > 0) next.duration_minutes = String(minutes);
      if (patch.start_time) next.exam_date = patch.start_time.slice(0, 10);
    }
    if (patch.duration_minutes && next.start_time && !patch.end_time) {
      const computedEnd = addMinutesLocal(next.start_time, Number(next.duration_minutes));
      if (computedEnd) next.end_time = computedEnd;
    }
    setForm(next);
  }
  function validateExamForm() {
    const duration = Number(form.duration_minutes);
    if (!form.start_time || !form.end_time) return "Start and end date/time are required.";
    if (new Date(form.end_time) <= new Date(form.start_time)) return "End date/time must be after start date/time.";
    if (!Number.isFinite(duration) || duration <= 0) return "Duration must be positive.";
    return "";
  }
  async function submit(event) {
    event.preventDefault();
    const validation = validateExamForm();
    if (validation) {
      setMessage(validation);
      toast?.show(validation, "error");
      return;
    }
    try {
      await api("/exams/", { method: "POST", body: JSON.stringify(form) });
      setMessage("Exam created");
      toast?.show("Exam created");
      setForm({ ...form, name: "", subject: "", instructions: "", total_marks: "0", passing_marks: "0", is_published: false });
      onSaved();
    } catch (err) {
      setMessage("Unable to create this exam.");
      toast?.show("Unable to create this exam.", "error");
    }
  }
  return (
    <Panel title="Create Exam" icon={Plus} className="span-3">
      <form className="ops-form exam-form-labelled" onSubmit={submit}>
        <label>Exam Name<input value={form.name} onChange={(event) => patchForm({ name: event.target.value })} required /></label>
        <label>Class{classOptions.length > 0 ? (
          <select value={form.class_level} onChange={(event) => patchForm({ class_level: event.target.value })} required>
            <option value="">Select class</option>
            {classOptions.map((classLevel) => <option key={classLevel} value={classLevel}>Class {classLevel}</option>)}
          </select>
        ) : (
          <input value={form.class_level} onChange={(event) => patchForm({ class_level: event.target.value })} required />
        )}</label>
        <label>Subject<input value={form.subject} onChange={(event) => patchForm({ subject: event.target.value })} required /></label>
        <label>Start Date & Time<input type="datetime-local" value={form.start_time} onChange={(event) => patchForm({ start_time: event.target.value })} required /></label>
        <label>End Date & Time<input type="datetime-local" value={form.end_time} onChange={(event) => patchForm({ end_time: event.target.value })} required /></label>
        <label>Duration (minutes)<input inputMode="numeric" value={form.duration_minutes} onChange={(event) => patchForm({ duration_minutes: event.target.value })} required /></label>
        <label>Total Marks<input inputMode="decimal" value={form.total_marks} onChange={(event) => patchForm({ total_marks: event.target.value })} required /></label>
        <label>Passing Marks<input inputMode="decimal" value={form.passing_marks} onChange={(event) => patchForm({ passing_marks: event.target.value })} /></label>
        <label>Exam Status<select value={form.is_published ? "true" : "false"} onChange={(event) => patchForm({ is_published: event.target.value === "true" })}>
          <option value="false">Draft</option>
          <option value="true">Scheduled / Published</option>
        </select></label>
        <label>Negative Marking<input value="Not configured" readOnly /></label>
        <label className="span-field">Instructions<textarea value={form.instructions} onChange={(event) => patchForm({ instructions: event.target.value })} /></label>
        <button className="ops-red-button"><Plus size={16} /> Create Exam</button>
      </form>
    </Panel>
  );
}

function ExamManager({ tab, exams, selected, setSelectedId, onSaved, setMessage }) {
  if (!selected) return <EmptyState title="No exams created" />;
  if (tab === "Questions") return <QuestionBuilder exam={selected} exams={exams} setSelectedId={setSelectedId} onSaved={onSaved} setMessage={setMessage} />;
  if (tab === "Submissions") return <ExamSubmissions exam={selected} exams={exams} setSelectedId={setSelectedId} onSaved={onSaved} setMessage={setMessage} />;
  return (
    <>
      <div className="ops-tools"><Search size={16} /><select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} / Class {exam.class_level}</option>)}</select></div>
      <EditableTable
        rows={exams}
        columns={[["Exam", (row) => row.name], ["Class", (row) => `Class ${row.class_level}`], ["Subject", (row) => row.subject], ["Window", (row) => `${formatDateTime(row.start_time)} - ${formatDateTime(row.end_time)}`], ["Status", (row) => <StatusBadge value={row.is_published ? "Published" : "Draft"} />], ["Results", (row) => <StatusBadge value={row.result_published ? "Published" : "Draft"} />]]}
        editFields={[["name"], ["class_level"], ["subject"], ["start_time", "datetime-local"], ["end_time", "datetime-local"], ["duration_minutes"], ["passing_marks"]]}
        canEdit
        canDelete
        onSave={(row, draft) => api("/exams/", { method: "PUT", body: JSON.stringify({ ...row, ...draft, id: row.id }) })}
        onDelete={(row) => api(`/exams/?id=${row.id}`, { method: "DELETE" })}
        onSaved={onSaved}
        setMessage={setMessage}
        successMessage="Exam updated successfully."
        extraActions={(row) => <ExamPublishActions exam={row} onSaved={onSaved} setMessage={setMessage} />}
      />
    </>
  );
}

function ExamPublishActions({ exam, onSaved, setMessage }) {
  async function publish() {
    try {
      await api("/exams/", { method: "PUT", body: JSON.stringify({ ...exam, id: exam.id, is_published: true }) });
      setMessage("Exam published");
      onSaved();
    } catch {
      setMessage("Unable to publish this exam.");
    }
  }
  async function publishResults() {
    try {
      await api(`/exams/${exam.id}/publish-results/`, { method: "POST" });
      setMessage("Result published");
      onSaved();
    } catch {
      setMessage("Unable to publish result.");
    }
  }
  async function duplicate() {
    try {
      await api(`/exams/${exam.id}/duplicate/`, { method: "POST" });
      setMessage("Exam duplicated as draft");
      onSaved();
    } catch {
      setMessage("Unable to duplicate this exam.");
    }
  }
  return (
    <>
      <button className="ops-icon" title="Duplicate exam" onClick={duplicate}><Copy size={15} /></button>
      {!exam.is_published && <button className="ops-icon" title="Publish exam" onClick={publish}><Send size={15} /></button>}
      {!exam.result_published && <button className="ops-icon" title="Publish result" onClick={publishResults}><Trophy size={15} /></button>}
    </>
  );
}

function QuestionBuilder({ exam, exams, setSelectedId, onSaved, setMessage }) {
  const [form, setForm] = useState({ text: "", question_type: "mcq", marks: "1", options: ["", "", "", ""], correct_answer: "", expected_answer: "", explanation: "" });
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState({});
  const [bankQuestions, setBankQuestions] = useState([]);
  const [selectedBankIds, setSelectedBankIds] = useState([]);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const toast = useToast();
  useEffect(() => {
    if (!exam?.class_level || !exam?.subject) return;
    const params = new URLSearchParams({ class_level: exam.class_level, subject: exam.subject });
    api(`/question-bank/?${params.toString()}`)
      .then((data) => setBankQuestions(data.results || []))
      .catch(() => setBankQuestions([]));
    setSelectedBankIds([]);
  }, [exam?.id, exam?.class_level, exam?.subject]);
  async function addQuestion(event) {
    event.preventDefault();
    try {
      await api(`/exams/${exam.id}/questions/`, { method: "POST", body: JSON.stringify({ ...form, options: form.options }) });
      setForm({ text: "", question_type: "mcq", marks: "1", options: ["", "", "", ""], correct_answer: "", expected_answer: "" });
      setMessage("Question added");
      toast?.show("Question added");
      onSaved();
    } catch {
      setMessage("Unable to add this question.");
      toast?.show("Unable to add this question.", "error");
    }
  }
  async function addFromBank() {
    if (!selectedBankIds.length) return;
    try {
      await api(`/exams/${exam.id}/questions/`, { method: "POST", body: JSON.stringify({ question_bank_ids: selectedBankIds }) });
      setSelectedBankIds([]);
      setMessage("Question bank items added");
      toast?.show("Question bank items added");
      onSaved();
    } catch {
      setMessage("Unable to add question bank items.");
      toast?.show("Unable to add question bank items.", "error");
    }
  }
  async function uploadBulk(event) {
    event.preventDefault();
    if (!bulkFile) return;
    const body = new FormData();
    body.append("file", bulkFile);
    try {
      const result = await api(`/exams/${exam.id}/questions/bulk-import/`, { method: "POST", body });
      setBulkResult(result);
      setBulkFile(null);
      setMessage(`${result.valid_count || 0} questions imported`);
      toast?.show(`${result.valid_count || 0} questions imported`);
      onSaved();
    } catch (err) {
      setBulkResult(err.data || { errors: [{ row: "-", error: err.message || "Unable to import questions." }] });
      setMessage("Bulk import failed. Fix the listed rows and upload again.");
      toast?.show("Bulk import failed.", "error");
    }
  }
  function downloadTemplate() {
    const rows = [
      ["Question", "Type", "Option A", "Option B", "Option C", "Option D", "Correct Answer", "Expected Answer", "Marks", "Chapter", "Difficulty", "Explanation"],
      ["What is 2 + 2?", "mcq", "2", "3", "4", "5", "4", "", "1", "Numbers", "Easy", "Basic addition"],
      ["The Sun rises in the east.", "true_false", "", "", "", "", "True", "", "1", "General", "Easy", ""],
      ["Explain photosynthesis.", "short", "", "", "", "", "", "Plants make food using sunlight.", "3", "Biology", "Medium", ""],
    ];
    downloadCsv("exam-question-template.csv", rows);
  }
  async function deleteQuestion(question) {
    try {
      await api(`/exams/${exam.id}/questions/?question_id=${question.question_id}`, { method: "DELETE" });
      setMessage("Question deleted");
      onSaved();
    } catch {
      setMessage("Unable to delete this question.");
    }
  }
  async function saveQuestion(question) {
    try {
      await api(`/exams/${exam.id}/questions/`, { method: "PUT", body: JSON.stringify({ ...editDraft, question_id: question.question_id }) });
      setEditingId("");
      setEditDraft({});
      setMessage("Question updated");
      onSaved();
    } catch {
      setMessage("Unable to save this question.");
    }
  }
  function beginEdit(question) {
    setEditingId(question.question_id);
    setEditDraft({
      text: question.text,
      question_type: question.question_type,
      marks: question.marks,
      options: question.options?.length ? question.options : ["", "", "", ""],
      correct_answer: question.correct_answer || "",
      expected_answer: question.expected_answer || "",
      order: question.order,
    });
  }
  return (
    <>
      <div className="ops-tools"><Search size={16} /><select value={exam.id} onChange={(event) => setSelectedId(event.target.value)}>{exams.map((item) => <option key={item.id} value={item.id}>{item.name} / Class {item.class_level}</option>)}</select></div>
      <form className="ops-form exam-question-form exam-form-labelled" onSubmit={addQuestion}>
        <label className="span-field">Question<textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} required /></label>
        <label>Question Type<select value={form.question_type} onChange={(event) => setForm({ ...form, question_type: event.target.value, correct_answer: "" })}>
          <option value="mcq">MCQ</option>
          <option value="true_false">True / False</option>
          <option value="short">Short Answer</option>
          <option value="long">Long Answer</option>
        </select></label>
        <label>Marks<input inputMode="decimal" value={form.marks} onChange={(event) => setForm({ ...form, marks: event.target.value })} required /></label>
        {form.question_type === "mcq" && form.options.map((option, index) => <label key={index}>Option {String.fromCharCode(65 + index)}<input value={option} onChange={(event) => setForm({ ...form, options: form.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} required={index < 2} /></label>)}
        {form.question_type === "true_false" && <label>Correct Answer<select value={form.correct_answer} onChange={(event) => setForm({ ...form, correct_answer: event.target.value })} required><option value="">Select answer</option><option>True</option><option>False</option></select></label>}
        {form.question_type === "mcq" && <label>Correct Answer<input value={form.correct_answer} onChange={(event) => setForm({ ...form, correct_answer: event.target.value })} required /></label>}
        {["short", "long"].includes(form.question_type) && <label className="span-field">Expected / Model Answer<textarea value={form.expected_answer} onChange={(event) => setForm({ ...form, expected_answer: event.target.value })} required /></label>}
        <label className="span-field">Explanation<textarea value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} /></label>
        <button className="ops-red-button"><Plus size={16} /> Add Question</button>
      </form>
      <div className="exam-question-form">
        <div className="ops-panel-title-row">
          <h2><Upload size={18} /> Bulk Upload Questions</h2>
          <button className="ops-soft-button" type="button" onClick={downloadTemplate}><Download size={16} /> Download Template</button>
        </div>
        <form className="bulk-import-form" onSubmit={uploadBulk}>
          <input type="file" accept=".csv,.xlsx" onChange={(event) => setBulkFile(event.target.files?.[0] || null)} />
          <button className="ops-red-button" disabled={!bulkFile}><Upload size={16} /> Upload Questions</button>
        </form>
        {bulkResult && (
          <div className="bulk-import-result">
            <div className="bulk-import-summary">
              <span className="ok">{bulkResult.total_rows || 0} rows found</span>
              <span className="ok">{bulkResult.valid_count || 0} valid</span>
              <span className={(bulkResult.invalid_count || 0) ? "warn" : "ok"}>{bulkResult.invalid_count || 0} errors</span>
            </div>
            {(bulkResult.errors || []).length > 0 && <ul className="bulk-import-errors">{bulkResult.errors.map((error, index) => <li key={index}>Row {error.row}: {error.error}</li>)}</ul>}
          </div>
        )}
      </div>
      <div className="exam-question-form">
        <div className="ops-panel-title-row">
          <h2><FileQuestion size={18} /> Add from Question Bank</h2>
          <button className="ops-red-button" type="button" disabled={!selectedBankIds.length} onClick={addFromBank}><Plus size={16} /> Add Selected</button>
        </div>
        <div className="ops-assignment-list exam-question-list">
          {bankQuestions.filter((item) => !(exam.questions || []).some((question) => question.question_bank_id === item.id)).slice(0, 8).map((question) => (
            <article key={question.id}>
              <label className="ops-file-icon">
                <input
                  type="checkbox"
                  checked={selectedBankIds.includes(question.id)}
                  onChange={(event) => setSelectedBankIds(event.target.checked ? [...selectedBankIds, question.id] : selectedBankIds.filter((id) => id !== question.id))}
                />
              </label>
              <div>
                <strong>{question.text}</strong>
                <span>{question.subject} / {question.chapter}</span>
                <small>{question.question_type.replace("_", " ")} / {question.difficulty} / {question.marks} marks</small>
              </div>
              <StatusBadge value={question.correct_answer || question.expected_answer || "Descriptive"} />
            </article>
          ))}
          {bankQuestions.filter((item) => !(exam.questions || []).some((question) => question.question_bank_id === item.id)).length === 0 && <EmptyState title="No matching bank questions" message="Add class and subject questions in Practice first." />}
        </div>
      </div>
      <div className="ops-assignment-list exam-question-list">
        {(exam.questions || []).map((question, index) => (
          <article key={question.question_id}>
            <div className="ops-file-icon"><span>{index + 1}</span></div>
            <div>
              {editingId === question.question_id ? (
                <div className="ops-inline-edit">
                  <textarea value={editDraft.text || ""} onChange={(event) => setEditDraft({ ...editDraft, text: event.target.value })} />
                  <select value={editDraft.question_type || "mcq"} onChange={(event) => setEditDraft({ ...editDraft, question_type: event.target.value })}>
                    <option value="mcq">MCQ</option>
                    <option value="true_false">True / False</option>
                    <option value="short">Short Answer</option>
                    <option value="long">Long Answer</option>
                  </select>
                  <input inputMode="decimal" value={editDraft.marks ?? ""} onChange={(event) => setEditDraft({ ...editDraft, marks: event.target.value })} />
                  {editDraft.question_type === "mcq" && (editDraft.options || ["", "", "", ""]).map((option, optionIndex) => <input key={optionIndex} value={option} onChange={(event) => setEditDraft({ ...editDraft, options: (editDraft.options || ["", "", "", ""]).map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item) })} />)}
                  {["mcq", "true_false"].includes(editDraft.question_type) && <input placeholder="Correct Answer" value={editDraft.correct_answer || ""} onChange={(event) => setEditDraft({ ...editDraft, correct_answer: event.target.value })} />}
                  {["short", "long"].includes(editDraft.question_type) && <textarea placeholder="Expected/model answer" value={editDraft.expected_answer || ""} onChange={(event) => setEditDraft({ ...editDraft, expected_answer: event.target.value })} />}
                </div>
              ) : (
                <>
                  <strong>{question.text}</strong>
                  <span>{question.question_type.replace("_", " ")} / {question.marks} marks</span>
                  {question.options?.length > 0 && <small>{question.options.join(" / ")}</small>}
                </>
              )}
            </div>
            <StatusBadge value={question.correct_answer || "Descriptive"} />
            <div className="ops-actions">
              {editingId === question.question_id ? (
                <>
                  <button className="ops-icon" title="Save question" onClick={() => saveQuestion(question)}><Save size={15} /></button>
                  <button className="ops-icon" title="Cancel" onClick={() => setEditingId("")}><X size={15} /></button>
                </>
              ) : (
                <button className="ops-icon" title="Edit question" onClick={() => beginEdit(question)}><Pencil size={15} /></button>
              )}
              <button className="ops-icon danger" title="Delete question" onClick={() => deleteQuestion(question)}><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
        {(exam.questions || []).length === 0 && <EmptyState title="No questions added" />}
      </div>
    </>
  );
}

function ExamSubmissions({ exam, exams, setSelectedId, onSaved, setMessage }) {
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const attempt = (exam.attempts || []).find((item) => item.id === selectedAttemptId) || (exam.attempts || [])[0];
  return (
    <>
      <div className="ops-tools"><Search size={16} /><select value={exam.id} onChange={(event) => setSelectedId(event.target.value)}>{exams.map((item) => <option key={item.id} value={item.id}>{item.name} / Class {item.class_level}</option>)}</select></div>
      <CompactTable columns={["Student ID", "Student", "Started", "Submitted", "Score", "Status", "Submission Type"]} rows={(exam.attempts || []).map((item) => [item.student?.student_id || "-", item.student?.name || "-", formatDateTime(item.started_at), formatDateTime(item.submitted_at), `${item.score || 0}/${exam.total_marks}`, item.status, submissionType(item)])} />
      {(exam.attempts || []).length > 0 && (
        <div className="ops-tools"><Search size={16} /><select value={attempt?.id || ""} onChange={(event) => setSelectedAttemptId(event.target.value)}>{(exam.attempts || []).map((item) => <option key={item.id} value={item.id}>{item.student?.name || "Student"} / {item.status}</option>)}</select></div>
      )}
      {attempt ? <EvaluationPanel exam={exam} attempt={attempt} onSaved={onSaved} setMessage={setMessage} /> : <EmptyState title="No submissions yet" />}
    </>
  );
}

function EvaluationPanel({ exam, attempt, onSaved, setMessage }) {
  const [feedback, setFeedback] = useState(attempt.feedback || "");
  const [draft, setDraft] = useState(() => Object.fromEntries((attempt.answers || []).map((answer) => [answer.question_id, { marks_awarded: answer.marks_awarded || "", feedback: answer.feedback || "" }])));
  async function save() {
    try {
      const evaluations = Object.entries(draft).map(([question_id, value]) => ({ question_id, ...value }));
      await api(`/exam-attempts/${attempt.id}/evaluate/`, { method: "PUT", body: JSON.stringify({ evaluations, feedback }) });
      setMessage("Evaluation saved");
      onSaved();
    } catch {
      setMessage("Unable to save evaluation.");
    }
  }
  const answers = Object.fromEntries((attempt.answers || []).map((answer) => [answer.question_id, answer]));
  return (
    <section className="exam-evaluation">
      <article>
        <strong>Exam screen activity</strong>
        <span>Violations: {attempt.violation_count || 0}/{attempt.max_violations || 1}</span>
        <small>Auto submitted: {attempt.auto_submitted ? "Yes" : "No"}{attempt.auto_submit_reason ? ` / Reason: ${attempt.auto_submit_reason}` : ""}</small>
      </article>
      {(exam.questions || []).map((question) => {
        const answer = answers[question.question_id] || {};
        const descriptive = ["short", "long"].includes(question.question_type);
        return (
          <article key={question.question_id}>
            <strong>{question.text}</strong>
            <span>Answer: {answer.answer || "-"}</span>
            {question.correct_answer && <small>Correct: {question.correct_answer}</small>}
            {descriptive ? (
              <div className="ops-actions">
                <input inputMode="decimal" placeholder={`Marks / ${question.marks}`} value={draft[question.question_id]?.marks_awarded ?? ""} onChange={(event) => setDraft({ ...draft, [question.question_id]: { ...(draft[question.question_id] || {}), marks_awarded: event.target.value } })} />
                <input placeholder="Feedback" value={draft[question.question_id]?.feedback ?? ""} onChange={(event) => setDraft({ ...draft, [question.question_id]: { ...(draft[question.question_id] || {}), feedback: event.target.value } })} />
              </div>
            ) : <StatusBadge value={`${answer.marks_awarded || 0}/${question.marks}`} />}
          </article>
        );
      })}
      <textarea placeholder="Overall feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} />
      <button className="ops-red-button" onClick={save}><Save size={16} /> Save Evaluation</button>
    </section>
  );
}

function StudentExamCard({ exam, onSaved, setMessage }) {
  const [taking, setTaking] = useState(false);
  const [startPreview, setStartPreview] = useState(false);
  const [attempt, setAttempt] = useState(exam.attempt);
  const [activeExam, setActiveExam] = useState(exam);
  async function start() {
    requestExamFullscreen().catch(() => {
      setMessage("Fullscreen is recommended for exams. Continue only on the exam screen.");
    });
    try {
      const data = await api(`/exams/${exam.id}/start/`, { method: "POST" });
      setAttempt(data.attempt);
      setActiveExam(data.exam);
      if (data.attempt?.submitted_at) {
        setMessage(data.attempt.auto_submitted ? "Your exam was automatically submitted because you left the exam screen." : "This exam has already been submitted.");
        onSaved();
      } else {
        setTaking(true);
      }
    } catch {
      setMessage(exam.status === "upcoming" ? "This exam has not started yet." : "Unable to load this exam.");
    }
  }
  if (taking && attempt) return <ExamTakingPanel exam={activeExam} attempt={attempt} setAttempt={setAttempt} setMessage={setMessage} onSaved={onSaved} />;
  const resultVisible = exam.result_published && attempt;
  if (startPreview) {
    return (
      <article className="exam-start-card">
        <div className="ops-file-icon"><FileCheck2 size={18} /></div>
        <div>
          <strong>{exam.name}</strong>
          <span>{exam.subject} / {exam.question_count || 0} questions / {exam.total_marks} marks / {exam.duration_minutes} min</span>
          <small>Passing Marks: {exam.passing_marks || 0}. Negative Marking: Not configured.</small>
          <small>{exam.instructions || "Read all questions carefully before submitting."}</small>
          <small>During the exam, leaving the exam tab or exiting fullscreen may automatically submit your exam.</small>
        </div>
        <StatusBadge value={formatExamStatus(exam.status)} />
        <div className="ops-actions">
          <button className="ops-soft-button" type="button" onClick={() => setStartPreview(false)}>Back</button>
          <button className="ops-red-button" type="button" onClick={start}>Start Exam</button>
        </div>
      </article>
    );
  }
  return (
    <article>
      <div className="ops-file-icon"><FileCheck2 size={18} /></div>
      <div>
        <strong>{exam.name}</strong>
        <span>{exam.subject} / {formatDateTime(exam.start_time)} / {exam.duration_minutes} min / {exam.total_marks} marks</span>
        <small>{exam.instructions || "Read all questions carefully before submitting."}</small>
        {resultVisible && <small>Result: {attempt.score || 0}/{exam.total_marks} / {Number(attempt.score || 0) >= Number(exam.passing_marks || 0) ? "Pass" : "Fail"}</small>}
      </div>
      <StatusBadge value={resultVisible ? "Result Published" : formatExamStatus(exam.status)} />
      {exam.status === "active" && !attempt?.submitted_at && <button className="ops-red-button" onClick={() => setStartPreview(true)}>Start Exam</button>}
      {exam.status === "upcoming" && <button className="ops-soft-button" type="button">Exam starts at {formatDateTime(exam.start_time)}</button>}
      {exam.status === "ended" && !attempt?.submitted_at && <button className="ops-soft-button" type="button">Exam Ended</button>}
      {attempt?.submitted_at && <button className="ops-soft-button" type="button">Submitted</button>}
    </article>
  );
}

function ExamTakingPanel({ exam, attempt, setAttempt, setMessage, onSaved }) {
  const [index, setIndex] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const storageKey = `redhero_exam_answers_${attempt.id}`;
  const [answers, setAnswers] = useState(() => ({ ...readStoredAnswers(storageKey), ...Object.fromEntries((attempt.answers || []).map((answer) => [answer.question_id, answer.answer])) }));
  const [remaining, setRemaining] = useState(timeRemaining(attempt.deadline));
  const lastViolationAt = useRef(0);
  const reportingViolation = useRef(false);
  const violationHandled = useRef(false);
  const lastSaved = useRef(Object.fromEntries((attempt.answers || []).map((answer) => [answer.question_id, answer.answer])));
  const submitted = Boolean(attempt.submitted_at || attempt.status !== "in_progress");
  const question = (exam.questions || [])[index];
  useEffect(() => {
    if (submitted) return undefined;
    const timer = window.setInterval(() => {
      const next = timeRemaining(attempt.deadline);
      setRemaining(next);
      if (next <= 0 && !submitting) submit(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt.deadline, submitting, submitted]);
  useEffect(() => {
    if (submitted) return undefined;
    let ready = false;
    const readyTimer = window.setTimeout(() => { ready = true; }, 900);
    async function reportViolation(reason) {
      if (!ready || violationHandled.current || reportingViolation.current || submitting) return;
      const now = Date.now();
      if (now - lastViolationAt.current < 1400) return;
      lastViolationAt.current = now;
      violationHandled.current = true;
      reportingViolation.current = true;
      try {
        const data = await api(`/exam-attempts/${attempt.id}/violation/`, { method: "POST", body: JSON.stringify({ reason }) });
        setAttempt(data.attempt);
        setMessage(data.message || "Your exam was automatically submitted because you left the exam screen.");
        if (data.auto_submitted || data.attempt?.submitted_at) {
          localStorage.removeItem(storageKey);
          setSubmitting(true);
          onSaved();
        }
      } catch {
        setMessage("Unable to submit after leaving the exam screen.");
        violationHandled.current = false;
      } finally {
        reportingViolation.current = false;
      }
    }
    function onVisibilityChange() {
      if (document.hidden) reportViolation("visibility_hidden");
    }
    function onBlur() {
      reportViolation("window_blur");
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) reportViolation("fullscreen_exit");
    }
    function blockClipboard(event) {
      event.preventDefault();
    }
    function blockShortcut(event) {
      const key = event.key?.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "x", "p", "s"].includes(key)) event.preventDefault();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("contextmenu", blockClipboard);
    document.addEventListener("keydown", blockShortcut);
    return () => {
      window.clearTimeout(readyTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockClipboard);
      document.removeEventListener("keydown", blockShortcut);
    };
  }, [attempt.id, storageKey, submitted, submitting, setAttempt, setMessage, onSaved]);
  useEffect(() => {
    if (submitted || submitting) return undefined;
    writeStoredAnswers(storageKey, answers);
    const pending = Object.entries(answers).find(([qid, value]) => lastSaved.current[qid] !== value);
    if (!pending) return undefined;
    const timer = window.setTimeout(() => saveAnswer(pending[0], pending[1], true), 700);
    return () => window.clearTimeout(timer);
  }, [answers, storageKey, submitted, submitting]);
  async function saveAnswer(qid = question?.question_id, value = answers[qid]) {
    if (!qid || submitted || submitting) return;
    try {
      const data = await api(`/exam-attempts/${attempt.id}/answers/`, { method: "POST", body: JSON.stringify({ question_id: qid, answer: value || "" }) });
      setAttempt(data.attempt);
      lastSaved.current[qid] = value || "";
    } catch {
      setMessage("Unable to save your answer. Please try again.");
    }
  }
  async function submit(auto = false) {
    if (submitting) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      const data = await api(`/exam-attempts/${attempt.id}/submit/`, { method: "POST" });
      setAttempt(data.attempt);
      localStorage.removeItem(storageKey);
      setMessage(data.attempt?.auto_submitted ? "Your exam was automatically submitted because you left the exam screen." : auto ? "Time is over. Your exam has been submitted." : "Your exam has been submitted successfully.");
      onSaved();
    } catch {
      setMessage("Unable to submit this exam.");
      setSubmitting(false);
    }
  }
  if (!question) return <EmptyState title="No questions available" />;
  return (
    <section className="exam-taking-panel">
      <header>
        <div><strong>{exam.name}</strong><span>{exam.subject} / Question {index + 1} of {exam.questions.length}</span></div>
        <div className="exam-timer">{formatRemaining(remaining)} remaining</div>
      </header>
      <article>
        <h3>{question.text}</h3>
        {["mcq", "true_false"].includes(question.question_type) ? (
          <div className="exam-options">
            {(question.options || []).map((option) => <button className={answers[question.question_id] === option ? "active" : ""} key={option} disabled={submitted || submitting} onClick={() => setAnswers({ ...answers, [question.question_id]: option })}>{option}</button>)}
          </div>
        ) : (
          <textarea value={answers[question.question_id] || ""} disabled={submitted || submitting} onChange={(event) => setAnswers({ ...answers, [question.question_id]: event.target.value })} onBlur={() => saveAnswer()} placeholder="Write your answer" />
        )}
        <small>Exam screen lock active</small>
      </article>
      <div className="exam-question-nav">
        {(exam.questions || []).map((item, itemIndex) => (
          <button
            key={item.question_id}
            className={`${itemIndex === index ? "current" : ""} ${answers[item.question_id] ? "answered" : ""}`}
            onClick={() => { saveAnswer(); setIndex(itemIndex); }}
            type="button"
          >
            {itemIndex + 1}
          </button>
        ))}
      </div>
      <div className="ops-actions">
        <button className="ops-soft-button" disabled={index === 0} onClick={() => setIndex(Math.max(0, index - 1))}>Previous</button>
        <button className="ops-soft-button" disabled={submitted || submitting} onClick={() => { saveAnswer(); setIndex(Math.min(exam.questions.length - 1, index + 1)); }}>Save & Next</button>
        <button className="ops-red-button" disabled={submitted || submitting} onClick={() => setConfirmSubmit(true)}>Submit Exam</button>
        <ConfirmDialog open={confirmSubmit} title="Submit exam?" message="Are you sure you want to submit the exam?" confirmLabel="Submit" onCancel={() => setConfirmSubmit(false)} onConfirm={() => submit(false)} />
      </div>
    </section>
  );
}

function requestExamFullscreen() {
  const element = document.documentElement;
  if (!element.requestFullscreen || document.fullscreenElement) return Promise.resolve();
  return element.requestFullscreen();
}

function TimetableDetail({ data, user, onSaved, setMessage }) {
  return (
    <div className="ops-detail-grid">
      {user.role === "super_admin" && <TimetableForm onSaved={onSaved} setMessage={setMessage} />}
      <Panel title="Weekly Timetable" icon={CalendarDays} className="span-3">
        <TimetableGrid rows={data.timetables} user={user} onSaved={onSaved} setMessage={setMessage} />
      </Panel>
    </div>
  );
}

function FeesDetail({ data, user, onSaved, setMessage }) {
  const summary = data.feeSummary || {};
  return (
    <div className="ops-detail-grid">
      {user.role === "super_admin" && <FeeForm onSaved={onSaved} setMessage={setMessage} />}
      {user.role === "super_admin" && <FeePaymentForm students={data.students} paymentModes={data.paymentModes} onSaved={onSaved} setMessage={setMessage} />}
      <MetricDeck metrics={[["Total Fees", money(summary.total_fees || 0)], ["Paid", money(summary.paid || 0)], ["Pending", money(summary.pending || 0)], ["Overdue", money(summary.overdue || 0)]]} />
      <Panel title="Fee Records" icon={IndianRupee} className="span-3">
        <FeesTable user={user} rows={data.feeStudentRecords || []} structures={data.fees || []} onSaved={onSaved} setMessage={setMessage} />
      </Panel>
      <Panel title="Installment Summary" icon={WalletCards} className="span-3">
        <div className="ops-installments">
          {data.fees.map((fee) => (
            <article key={fee.id}>
              <strong>Class {fee.class_level}</strong>
              {Object.keys(fee.installments || {}).length > 0 ? Object.entries(fee.installments).map(([label, value]) => <span key={label}>{label}: {money(value)}</span>) : <span>No installment breakdown recorded.</span>}
              {fee.due_date && <span>Due: {formatDate(fee.due_date)}</span>}
            </article>
          ))}
          {data.fees.length === 0 && <EmptyState title="No fee records" />}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, icon: Icon, className = "", action, children }) {
  return (
    <section className={`ops-panel ${className}`}>
      <header>
        <h2><Icon size={18} /> {title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function MetricDeck({ metrics }) {
  return (
    <section className="ops-metric-deck span-3">
      {metrics.map(([label, value]) => (
        <article key={label}>
          <span>{label}</span>
          <strong><AnimatedValue value={value} /></strong>
        </article>
      ))}
    </section>
  );
}

function AttendanceQuickMark({ attendance = [], students = [], onSaved, setMessage }) {
  const classes = useMemo(() => [...new Set(students.map((student) => student.class_level).filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [students]);
  const [classLevel, setClassLevel] = useState(classes[0] || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [absentIds, setAbsentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const classStudents = useMemo(
    () => students.filter((student) => student.class_level === classLevel).sort((first, second) => String(first.roll_number).localeCompare(String(second.roll_number), undefined, { numeric: true })),
    [classLevel, students],
  );

  useEffect(() => {
    if (!classLevel && classes.length) setClassLevel(classes[0]);
  }, [classLevel, classes]);

  useEffect(() => {
    const absent = attendance
      .filter((row) => row.class_level === classLevel && String(row.date || "").slice(0, 10) === date && row.status === "absent")
      .map((row) => row.student?.id)
      .filter(Boolean);
    setAbsentIds(absent);
  }, [attendance, classLevel, date]);

  function toggleAbsent(studentId) {
    setAbsentIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
  }

  async function saveClassAttendance() {
    if (!classLevel || !classStudents.length) {
      toast?.show("Select a class with students.", "error");
      return;
    }
    try {
      setSaving(true);
      const response = await api("/attendance/bulk/", {
        method: "POST",
        body: JSON.stringify({ class_level: classLevel, date, absent_student_ids: absentIds }),
      });
      setMessage(response.message || "Class attendance saved");
      toast?.show(`${response.present_count} present · ${response.absent_count} absent`);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Attendance Quick-Mark" icon={ClipboardCheck} className="span-3">
      <div className="quick-attendance-toolbar">
        <select value={classLevel} onChange={(event) => setClassLevel(event.target.value)}>
          <option value="">Select class</option>
          {classes.map((item) => <option key={item} value={item}>Class {item}</option>)}
        </select>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button className="ops-soft-button" onClick={() => setAbsentIds([])} type="button"><CheckCircle2 size={16} /> All Present</button>
        <span>{classStudents.length - absentIds.length} present · {absentIds.length} absent</span>
      </div>
      <div className="quick-attendance-list">
        {classStudents.map((student) => {
          const absent = absentIds.includes(student.id);
          return (
            <button className={absent ? "absent" : "present"} key={student.id} onClick={() => toggleAbsent(student.id)} type="button">
              <span>{student.roll_number || "-"}</span>
              <strong>{student.name}</strong>
              <em>{absent ? "Absent" : "Present"}</em>
            </button>
          );
        })}
        {!classStudents.length && <EmptyState title="No students in this class" />}
      </div>
      <div className="quick-attendance-actions">
        <small>All students are Present by default. Click only the absent students.</small>
        <button className="ops-red-button" disabled={saving || !classStudents.length} onClick={saveClassAttendance} type="button">
          <Save size={16} /> {saving ? "Saving..." : "Save Class Attendance"}
        </button>
      </div>
    </Panel>
  );
}

function AttendanceForm({ students, onSaved, setMessage }) {
  const [form, setForm] = useState({
    student: "",
    date: new Date().toISOString().slice(0, 10),
    status: "present",
    left_early: false,
    leave_time: "",
    leave_reason: "",
  });

  const toast = useToast();

  async function submit(event) {
    event.preventDefault();

    try {
      const payload = {
        ...form,
        leave_time:
          form.left_early && form.leave_time
            ? `${form.date}T${form.leave_time}:00`
            : null,
        leave_reason: form.left_early
          ? form.leave_reason
          : "",
      };

      await api("/attendance/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setMessage("Attendance saved");
      toast?.show(
        form.left_early
          ? "Attendance saved with early leave"
          : "Attendance saved"
      );

      setForm({
        student: "",
        date: new Date().toISOString().slice(0, 10),
        status: "present",
        left_early: false,
        leave_time: "",
        leave_reason: "",
      });

      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  return (
    <Panel
      title="Individual Attendance Correction"
      icon={Plus}
      className="span-3"
    >
      <form className="ops-form" onSubmit={submit}>
        <select
          value={form.student}
          onChange={(event) =>
            setForm({
              ...form,
              student: event.target.value,
            })
          }
          required
        >
          <option value="">Select student</option>

          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name} / Class {student.class_level}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={form.date}
          onChange={(event) =>
            setForm({
              ...form,
              date: event.target.value,
            })
          }
          required
        />

        <select
          value={form.status}
          onChange={(event) =>
            setForm({
              ...form,
              status: event.target.value,
            })
          }
        >
          <option value="present">Present</option>
          <option value="absent">Absent</option>
        </select>

        <label>
          <input
            type="checkbox"
            checked={form.left_early}
            onChange={(event) =>
              setForm({
                ...form,
                left_early: event.target.checked,
                leave_time: event.target.checked
                  ? form.leave_time
                  : "",
                leave_reason: event.target.checked
                  ? form.leave_reason
                  : "",
              })
            }
          />

          Left Early
        </label>

        {form.left_early && (
          <>
            <label>
              Leave Time
              <input
                type="time"
                value={form.leave_time}
                onChange={(event) =>
                  setForm({
                    ...form,
                    leave_time: event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Leave Reason
              <input
                type="text"
                value={form.leave_reason}
                placeholder="Optional reason"
                onChange={(event) =>
                  setForm({
                    ...form,
                    leave_reason: event.target.value,
                  })
                }
              />
            </label>
          </>
        )}

        <button className="ops-red-button">
          <Save size={16} /> Save
        </button>
      </form>
    </Panel>
  );
          }
function MarksForm({ students, onSaved, setMessage }) {
  const [form, setForm] = useState({ student: "", subject: "", exam_type: "Unit Test", marks_obtained: "", max_marks: "100" });
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
      setForm({ student: "", subject: "", exam_type: "Unit Test", marks_obtained: "", max_marks: "100" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <Panel title="Add Marks" icon={Plus} className="span-3">
      <form className="ops-form" onSubmit={submit}>
        <select value={form.student} onChange={(event) => setForm({ ...form, student: event.target.value })} required>
          <option value="">Select student</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name} / Class {student.class_level}</option>)}
        </select>
        <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
        <select value={form.exam_type} onChange={(event) => setForm({ ...form, exam_type: event.target.value })}>
          <option>Unit Test</option>
          <option>Semester Exam</option>
          <option>Final Exam</option>
        </select>
        <input inputMode="decimal" placeholder="Marks" value={form.marks_obtained} onChange={(event) => setForm({ ...form, marks_obtained: event.target.value })} required />
        <input inputMode="decimal" placeholder="Max Marks" value={form.max_marks} onChange={(event) => setForm({ ...form, max_marks: event.target.value })} required />
        <button className="ops-red-button"><Save size={16} /> Save</button>
      </form>
    </Panel>
  );
}

function AssignmentForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ title: "", description: "", class_level: "10", subject: "", due_date: "", due_time: "", file_url: "" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    const deadline = combineDateTime(form.due_date, form.due_time);
    if (!deadline) {
      setMessage("Due date and due time are required.");
      toast?.show("Due date and due time are required.", "error");
      return;
    }
    try {
      await api("/assignments/", { method: "POST", body: JSON.stringify({ ...form, deadline }) });
      setMessage("Assignment created");
      toast?.show("Assignment created");
      setForm({ title: "", description: "", class_level: "10", subject: "", due_date: "", due_time: "", file_url: "" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <Panel title="Create Assignment" icon={Plus} className="span-3">
      <form className="ops-form assignment-form-labelled" onSubmit={submit}>
        <label>Assignment Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
        <label>Class<select value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required>{["6", "7", "8", "9", "10", "11", "12"].map((classLevel) => <option key={classLevel} value={classLevel}>Class {classLevel}</option>)}</select></label>
        <label>Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></label>
        <label>Due Date<input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>
        <label>Due Time<input type="time" value={form.due_time} onChange={(event) => setForm({ ...form, due_time: event.target.value })} required /></label>
        <label className="span-field">Attachment / Resource URL<input value={form.file_url} onChange={(event) => setForm({ ...form, file_url: event.target.value })} /></label>
        <label className="span-field">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>
        <button className="ops-red-button"><Plus size={16} /> Create Assignment</button>
      </form>
    </Panel>
  );
}

function TimetableForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ class_level: "10", day: "Monday", time: "09:00 - 10:00", subject: "", teacher: "" });
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
    <Panel title="Add / Edit Timetable" icon={Plus} className="span-3">
      <form className="ops-form" onSubmit={submit}>
        <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required />
        <select value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select>
        <input placeholder="Time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
        <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
        <input placeholder="Teacher" value={form.teacher} onChange={(event) => setForm({ ...form, teacher: event.target.value })} />
        <button className="ops-red-button"><Save size={16} /> Save</button>
      </form>
    </Panel>
  );
}

function FeeForm({ onSaved, setMessage }) {
  const [form, setForm] = useState({ class_level: "10", annual_fee: "", due_date: "", installments: "" });
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    try {
      const installments = form.installments ? Object.fromEntries(form.installments.split(",").map((item) => item.split(":").map((part) => part.trim()))) : {};
      await api("/fees/", { method: "POST", body: JSON.stringify({ class_level: form.class_level, annual_fee: form.annual_fee, due_date: form.due_date, installments }) });
      setMessage("Fee structure saved");
      toast?.show("Fee structure saved");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <Panel title="Add Fee Structure" icon={Plus} className="span-3">
      <form className="ops-form fee-form-labelled" onSubmit={submit}>
        <label>Class<select value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} required>
          {["6", "7", "8", "9", "10", "11", "12"].map((classLevel) => <option key={classLevel} value={classLevel}>Class {classLevel}</option>)}
        </select></label>
        <label>Annual Fee<input inputMode="decimal" value={form.annual_fee} onChange={(event) => setForm({ ...form, annual_fee: event.target.value })} required /></label>
        <label>Due Date<input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
        <label className="span-field">Installments<input placeholder="Term 1:9000, Term 2:9000" value={form.installments} onChange={(event) => setForm({ ...form, installments: event.target.value })} /></label>
        <button className="ops-red-button"><Save size={16} /> Save</button>
      </form>
    </Panel>
  );
}

function FeePaymentForm({ students = [], paymentModes = [], onSaved, setMessage }) {
  const [form, setForm] = useState({ student: "", amount: "", payment_date: new Date().toISOString().slice(0, 10), payment_mode: "Cash", reference: "", installment: "", note: "" });
  const toast = useToast();
  const modes = paymentModes.length ? paymentModes : ["Cash", "UPI", "Bank Transfer", "Cheque", "Other"];
  async function submit(event) {
    event.preventDefault();
    try {
      await api("/fees/payments/", { method: "POST", body: JSON.stringify(form) });
      setMessage("Payment recorded");
      toast?.show("Payment recorded");
      setForm({ ...form, amount: "", reference: "", installment: "", note: "" });
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }
  return (
    <Panel title="Record Payment" icon={Plus} className="span-3">
      <form className="ops-form fee-form-labelled" onSubmit={submit}>
        <label>Student<select value={form.student} onChange={(event) => setForm({ ...form, student: event.target.value })} required>
          <option value="">Select student</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.student_id} / {student.name} / Class {student.class_level}</option>)}
        </select></label>
        <label>Amount Paid<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
        <label>Payment Date<input type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} required /></label>
        <label>Payment Mode<select value={form.payment_mode} onChange={(event) => setForm({ ...form, payment_mode: event.target.value })}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
        <label>Installment<input value={form.installment} onChange={(event) => setForm({ ...form, installment: event.target.value })} /></label>
        <label>Reference<input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></label>
        <label className="span-field">Note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <button className="ops-red-button"><Save size={16} /> Record Payment</button>
      </form>
    </Panel>
  );
}

function AttendanceTable({
  user,
  rows,
  onSaved,
  setMessage,
}) {
  return (
    <EditableTable
      rows={rows}
      columns={[
        ["Date", (row) => formatDate(row.date)],

        [
          "Student",
          (row) => row.student?.name || "-"
        ],

        [
          "Subject",
          (row) => row.subject || "Unknown"
        ],

        [
          "Marked By",
          (row) => row.marked_by?.name || "-"
        ],

        [
          "Status",
          (row) => <StatusBadge value={row.status} />
        ],

        [
          "Early Leave",
          (row) =>
            row.left_early
              ? `Yes${row.leave_time ? ` · ${formatDateTime(row.leave_time)}` : ""}`
              : "No"
        ],

        [
          "Reason",
          (row) =>
            row.left_early
              ? row.leave_reason || "-"
              : "-"
        ],
      ]}
      editFields={[
        ["status", "select", ["present", "absent"]],
        ["left_early", "select", [true, false]],
        ["leave_reason"],
      ]}
      canEdit={user.role !== "student"}
      canDelete={user.role === "super_admin"}
      onSave={(row, draft) =>
        api("/attendance/", {
          method: "PUT",
          body: JSON.stringify({
            id: row.id,
            status: draft.status,
            left_early:
              draft.left_early === true ||
              draft.left_early === "true",
            leave_reason:
              draft.leave_reason || "",
          }),
        })
      }
      onDelete={(row) =>
        api(`/attendance/?id=${row.id}`, {
          method: "DELETE",
        })
      }
      onSaved={onSaved}
      setMessage={setMessage}
      extraActions={(row) =>
        user.role === "super_admin" && (
          <AttendanceLock
            row={row}
            onSaved={onSaved}
            setMessage={setMessage}
          />
        )
      }
    />
  );
      }

function MarksTable({ user, rows, onSaved, setMessage }) {
  return <EditableTable
    rows={rows}
    columns={[["Student", (row) => row.student?.name || "-"], ["Subject", (row) => row.subject], ["Exam", (row) => row.exam_type], ["Marks", (row) => `${row.marks_obtained}/${row.max_marks}`], ["Percentage", (row) => formatPercent(row.percentage)]]}
    editFields={[["subject"], ["exam_type", "select", ["Unit Test", "Semester Exam", "Final Exam"]], ["marks_obtained"], ["max_marks"]]}
    canEdit={user.role !== "student"}
    canDelete={user.role === "super_admin"}
    onSave={(row, draft) => api("/marks/", { method: "PUT", body: JSON.stringify({ id: row.id, ...draft }) })}
    onDelete={(row) => api(`/marks/?id=${row.id}`, { method: "DELETE" })}
    onSaved={onSaved}
    setMessage={setMessage}
  />;
}

function FeesTable({ user, rows, structures = [], onSaved, setMessage }) {
  if (rows.length > 0) {
    return <EditableTable
      rows={rows.map((row) => ({ ...row, id: row.student?.id || `${row.class_level}-${row.student?.student_id}` }))}
      columns={[
        ["Student ID", (row) => row.student?.student_id || "-"],
        ["Student Name", (row) => row.student?.name || "-"],
        ["Class", (row) => `Class ${row.class_level}`],
        ["Total Fees", (row) => money(row.total_fee)],
        ["Paid", (row) => money(row.paid)],
        ["Pending", (row) => money(row.pending)],
        ["Due Date", (row) => formatDate(row.due_date)],
        ["Status", (row) => <StatusBadge value={row.status} />],
        ["Payment History", (row) => <PaymentHistory payments={row.payments || []} />],
      ]}
      editFields={[]}
      canEdit={false}
      canDelete={false}
      onSaved={onSaved}
      setMessage={setMessage}
    />;
  }
  return <EditableTable
    rows={structures}
    columns={[["Class", (row) => `Class ${row.class_level}`], ["Total Fees", (row) => money(row.annual_fee)], ["Paid", () => money(0)], ["Pending", (row) => money(row.annual_fee || 0)], ["Due Date", (row) => formatDate(row.due_date)], ["Updated", (row) => formatDate(row.updated_at)]]}
    editFields={[]}
    canEdit={false}
    canDelete={user.role === "super_admin"}
    onDelete={(row) => api(`/fees/?id=${row.id}`, { method: "DELETE" })}
    onSaved={onSaved}
    setMessage={setMessage}
  />;
}

function PaymentHistory({ payments }) {
  if (!payments.length) return <span>No payments recorded</span>;
  return (
    <div className="fee-history">
      {payments.slice(0, 3).map((payment) => (
        <span key={payment.id}>
          {formatDate(payment.payment_date)} / {money(payment.amount)} / {payment.payment_mode}{payment.reference ? ` / ${payment.reference}` : ""}
        </span>
      ))}
      {payments.length > 3 && <span>+{payments.length - 3} more</span>}
    </div>
  );
}

function TimetableGrid({ rows, user, onSaved, setMessage }) {
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  const periods = rows.flatMap((row) => (row.periods || []).map((period) => ({ ...period, rowId: row.id, class_level: row.class_level })));
  const times = [...new Set(periods.map((period) => period.time).filter(Boolean))].sort();

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
    <>
      <div className="ops-table-wrap">
        <table className="ops-timetable">
          <thead><tr><th>Time</th>{DAYS.map((day) => <th key={day}>{day}</th>)}</tr></thead>
          <tbody>
            {times.map((time) => (
              <tr key={time}>
                <td>{time}</td>
                {DAYS.map((day) => {
                  const cell = periods.find((period) => period.time === time && period.day === day);
                  return <td key={day}>{cell ? <div className="ops-period"><strong>{cell.subject}</strong><span>Class {cell.class_level}</span>{cell.teacher && <small>{cell.teacher}</small>}</div> : "-"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {times.length === 0 && <EmptyState title="No timetable records" />}
      {user.role === "super_admin" && rows.length > 0 && <div className="ops-delete-strip">{rows.map((row) => <button className="ops-icon danger" title={`Delete Class ${row.class_level}`} key={row.id} onClick={() => setConfirm(row)}><Trash2 size={15} /></button>)}</div>}
      <ConfirmDialog open={Boolean(confirm)} title={`Delete Class ${confirm?.class_level} timetable?`} message="This timetable entry will be removed." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
    </>
  );
}

function EditableTable({ rows, columns, editFields, canEdit, canDelete, onSave, onDelete, onSaved, setMessage, extraActions, successMessage = "Operations record updated" }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const visible = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));

  async function save(row) {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(row, draft);
      setEditing(null);
      setMessage(successMessage);
      toast?.show(successMessage);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    try {
      await onDelete(row);
      setConfirm(null);
      setMessage("Operations record deleted");
      toast?.show("Operations record deleted");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  return (
    <>
      <div className="ops-tools"><Search size={16} /><input placeholder="Search records" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="ops-table-wrap">
        <table>
          <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}{(canEdit || canDelete || extraActions) && <th>Action</th>}</tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                {columns.map(([label, render]) => <td key={label}>{render(row)}</td>)}
                {(canEdit || canDelete || extraActions) && (
                  <td>
                    <div className="ops-actions">
                      {editing === row.id ? (
                        <>
                          {editFields.map(([field, type, choices]) => type === "select" ? <select key={field} value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}>{choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select> : <input key={field} type={type === "datetime-local" ? "datetime-local" : "text"} value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />)}
                          <button className="ops-icon" title="Save" disabled={saving} onClick={() => save(row)}><Save size={15} /></button>
                          <button className="ops-icon" title="Cancel" onClick={() => setEditing(null)}><X size={15} /></button>
                        </>
                      ) : (
                        <>
                          {canEdit && <button className="ops-icon" title="Edit" onClick={() => { setEditing(row.id); setDraft(Object.fromEntries(editFields.map(([field, type]) => [field, type === "datetime-local" ? toDateTimeLocal(row[field]) : row[field] ?? ""]))); }}><Pencil size={15} /></button>}
                          {canDelete && <button className="ops-icon danger" title="Delete" onClick={() => setConfirm(row)}><Trash2 size={15} /></button>}
                          {extraActions?.(row)}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <EmptyState title="No records found" />}
      <ConfirmDialog open={Boolean(confirm)} title="Delete operations record?" message="This record will be removed from operations." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
    </>
  );
}

function AssignmentRow({ item, user, onSaved, setMessage }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: item.title, subject: item.subject, class_level: item.class_level, deadline: toDateTimeLocal(item.deadline), description: item.description || "", file_url: item.file_url || "" });
  const [answer, setAnswer] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const canManage = user.role !== "student";

  async function save() {
    try {
      await api("/assignments/", { method: "PUT", body: JSON.stringify({ id: item.id, ...draft }) });
      setMessage("Assignment updated");
      toast?.show("Assignment updated");
      setEditing(false);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function remove() {
    try {
      await api(`/assignments/?id=${item.id}`, { method: "DELETE" });
      setMessage("Assignment deleted");
      toast?.show("Assignment deleted");
      setConfirm(false);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function submit(event) {
    event.preventDefault();
    try {
      await api(`/assignments/${item.id}/submit/`, { method: "POST", body: JSON.stringify({ answer_text: answer, file_url: fileUrl }) });
      setAnswer("");
      setFileUrl("");
      setMessage("Assignment submitted");
      toast?.show("Assignment submitted");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  return (
    <article>
      <div className="ops-file-icon"><FileCheck2 size={18} /></div>
      <div>
        {editing ? (
          <div className="ops-inline-edit">
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            <input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
            <select value={draft.class_level} onChange={(event) => setDraft({ ...draft, class_level: event.target.value })}>{["6", "7", "8", "9", "10", "11", "12"].map((classLevel) => <option key={classLevel} value={classLevel}>Class {classLevel}</option>)}</select>
            <input type="datetime-local" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
            <input placeholder="Resource URL" value={draft.file_url} onChange={(event) => setDraft({ ...draft, file_url: event.target.value })} />
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        ) : (
          <>
            <strong>{item.title}</strong>
            <span>Class {item.class_level} / {item.subject} / Due {formatDateTime(item.deadline)}</span>
            {item.description && <small>{item.description}</small>}
            {item.file_url && <small><a href={item.file_url} target="_blank" rel="noreferrer">Open attachment / resource</a></small>}
            {user.role === "student" && item.own_submission && <small>Submitted: {item.own_submission.file_url ? <a href={item.own_submission.file_url} target="_blank" rel="noreferrer">View submitted file</a> : item.own_submission.answer_text || "Submission recorded"}</small>}
            {canManage && <small>{item.submission_count || 0} submissions</small>}
          </>
        )}
      </div>
      <StatusBadge value={assignmentStatus(item, user)} />
      <div className="ops-actions">
        {canManage && !editing && <button className="ops-icon" title="Edit" onClick={() => setEditing(true)}><Pencil size={15} /></button>}
        {canManage && <button className="ops-icon danger" title="Delete" onClick={() => setConfirm(true)}><Trash2 size={15} /></button>}
        {editing && <button className="ops-icon" title="Save" onClick={save}><Save size={15} /></button>}
        {editing && <button className="ops-icon" title="Cancel" onClick={() => setEditing(false)}><X size={15} /></button>}
      </div>
      {user.role === "student" && !item.own_submission && <form className="ops-submit-form assignment-submit-form" onSubmit={submit}><input placeholder="Submission note" value={answer} onChange={(event) => setAnswer(event.target.value)} /><input placeholder="Submitted file URL" value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} /><button className="ops-soft-button"><Send size={15} /> Submit</button></form>}
      {canManage && (item.submissions || []).length > 0 && <div className="ops-submission-strip">{(item.submissions || []).map((submission) => <span key={submission.id}>{submission.student?.student_id || "-"} / {submission.student?.name || "Student"} / {assignmentSubmissionStatus(submission)} / {formatDateTime(submission.submitted_at)}</span>)}</div>}
      <ConfirmDialog open={confirm} title="Delete assignment?" message="This assignment will be removed." confirmLabel="Delete" onCancel={() => setConfirm(false)} onConfirm={remove} />
    </article>
  );
}

function AttendanceLock({ row, onSaved, setMessage }) {
  async function lock(locked) {
    try {
      await api(`/attendance/${row.id}/${locked ? "lock" : "unlock"}/`, { method: "POST" });
      setMessage(locked ? "Attendance locked" : "Attendance unlocked");
      onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return <button className="ops-icon" title={row.locked ? "Unlock" : "Lock"} onClick={() => lock(!row.locked)}>{row.locked ? <Unlock size={15} /> : <Lock size={15} />}</button>;
}

function AuditPanel({ items }) {
  return (
    <Panel title="Attendance Audit Logs" icon={Clock3} className="span-3">
      <CompactTable columns={["Action", "Student", "Performed By", "Date"]} rows={items.map((item) => [item.action, item.student_name, item.performed_by_name, formatDate(item.created_at)])} />
    </Panel>
  );
}

function Segmented({ tabs, value, onChange }) {
  return <div className="ops-tabs">{tabs.map((tab) => <button className={value === tab ? "active" : ""} key={tab} onClick={() => onChange(tab)}>{tab}</button>)}</div>;
}

function StatusBadge({ value }) {
  const normalized = String(value || "").toLowerCase();
  return <span className={`ops-status ${normalized.replace(/\s+/g, "-")}`}>{value || "-"}</span>;
}

function formatExamStatus(value) {
  if (value === "upcoming") return "Scheduled";
  if (value === "ended") return "Completed";
  if (value === "active") return "Active";
  if (value === "draft") return "Draft";
  return value || "-";
}

function submissionType(attempt) {
  if (!attempt?.submitted_at) return "-";
  if (attempt.auto_submitted) {
    if (attempt.auto_submit_reason === "fullscreen_exit") return "Fullscreen Exit";
    if (attempt.auto_submit_reason === "tab_window_exit") return "Tab/Window Exit";
    return "Tab/Window Exit";
  }
  if (attempt.status === "expired") return "Time Expired";
  return "Manual";
}

function CompactTable({ columns, rows }) {
  return (
    <div className="ops-table-wrap compact-table">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 && <EmptyState title="No records" />}
    </div>
  );
}

function minutesBetween(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function addMinutesLocal(value, minutes) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(minutes) || minutes <= 0) return "";
  date.setMinutes(date.getMinutes() + minutes);
  return toDateTimeLocal(date.toISOString());
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readStoredAnswers(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function writeStoredAnswers(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value || {}));
  } catch {
    // Storage can be unavailable in private browser modes; backend autosave remains authoritative.
  }
}

function DonutChart({ percent }) {
  return <div className="ops-donut" style={{ "--value": Number(percent || 0) }}><strong>{formatPercent(percent)}</strong><span>Overall</span></div>;
}

function LineChart({ values }) {
  const safe = values.length ? values : [0];
  const points = safe.map((value, index) => `${(index / Math.max(safe.length - 1, 1)) * 100},${100 - Number(value || 0)}`).join(" ");
  return (
    <div className="ops-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Trend chart"><polyline points={points} pathLength="100" /></svg>
      <div>{safe.map((value, index) => <i key={index} style={{ height: `${Math.max(4, Number(value || 0))}%` }} />)}</div>
    </div>
  );
}

function BarChart({ rows }) {
  return (
    <div className="ops-bars">
      {rows.map((row, index) => <span key={`${row.label}-${index}`}><i style={{ height: `${Math.max(3, row.value)}%` }} /><small>{row.label}</small></span>)}
      {rows.length === 0 && <EmptyState title="No chart data" />}
    </div>
  );
}

function SubjectBreakdown({ rows }) {
  return (
    <div className="ops-subject-list">
      {rows.map((row) => <span key={row.subject}>{row.subject}<strong>{formatPercent(row.percent)}</strong></span>)}
      {rows.length === 0 && <EmptyState title="No subject attendance data" />}
    </div>
  );
}

function useOpsSummaries(data, user) {
  return useMemo(() => {
    const att = attendanceSummary(data.attendance);
    const markStats = marksSummary(data.marks);
    const pending = data.assignments.filter((item) => ["Pending", "Overdue"].includes(assignmentStatus(item, user))).length;
    const submitted = data.assignments.filter((item) => assignmentStatus(item, user) === "Submitted").length;
    const completed = data.assignments.filter((item) => assignmentStatus(item, user) === "Completed").length;
    const activeExams = data.exams.filter((item) => item.status === "active").length;
    const completedExams = data.exams.filter((item) => item.attempt?.submitted_at || ["completed", "ended"].includes(item.status)).length;
    const periods = todayPeriods(data.timetables);
    const feeSummary = data.feeSummary || {};
    const feeTotal = Number(feeSummary.total_fees ?? data.fees.reduce((sum, row) => sum + Number(row.annual_fee || 0), 0));
    return {
      attendance: { key: "attendance", title: "Attendance", subtitle: "Actual attendance records", value: formatPercent(att.percent), icon: ClipboardCheck, tone: "green", button: "View Attendance", metrics: [["Present", att.present], ["Absent", att.absent], ["Leave", "N/A"]].map(([label, value]) => ({ label, value })) },
      marks: { key: "marks", title: "Marks & Results", subtitle: "Recorded assessments", value: formatPercent(markStats.average), icon: Trophy, tone: "violet", button: "View Marks", metrics: [["Highest", formatPercent(markStats.highest)], ["Lowest", formatPercent(markStats.lowest)], ["Records", data.marks.length]].map(([label, value]) => ({ label, value })) },
      assignments: { key: "assignments", title: "Assignments", subtitle: "Class assignment flow", value: data.assignments.length, icon: ListChecks, tone: "blue", button: "View Assignments", metrics: [["Pending", pending], ["Submitted", submitted], ["Completed", completed]].map(([label, value]) => ({ label, value })) },
      exams: { key: "exams", title: "Exams", subtitle: "Scheduled exam workflow", value: data.exams.length, icon: FileCheck2, tone: "red", button: "View Exams", metrics: [["Active", activeExams], ["Completed", completedExams], ["Results", data.exams.filter((item) => item.result_published).length]].map(([label, value]) => ({ label, value })) },
      timetable: { key: "timetable", title: "Timetable", subtitle: "Today schedule summary", value: periods.length, icon: CalendarClock, tone: "amber", button: "View Timetable", metrics: [["Classes", data.timetables.length], ["Periods", data.timetables.flatMap((row) => row.periods || []).length], ["Today", periods.length]].map(([label, value]) => ({ label, value })) },
      fees: { key: "fees", title: "Fee Structure", subtitle: "Configured fee records", value: feeTotal ? money(feeTotal) : "Not set", icon: WalletCards, tone: "red", button: "View Fees", metrics: [["Records", data.fees.length], ["Paid", money(feeSummary.paid || 0)], ["Pending", money(feeSummary.pending || 0)]].map(([label, value]) => ({ label, value })) },
    };
  }, [data, user]);
}

function attendanceSummary(items) {
  const present = items.filter((item) => item.status === "present").length;
  const absent = items.filter((item) => item.status === "absent").length;
  const total = present + absent;
  return { present, absent, percent: total ? Math.round((present / total) * 100) : 0 };
}

function marksSummary(items) {
  const values = items.map((item) => Number(item.percentage ?? ((Number(item.marks_obtained) / Number(item.max_marks || 1)) * 100))).filter(Number.isFinite);
  if (!values.length) return { average: 0, highest: 0, lowest: 0 };
  return { average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), highest: Math.round(Math.max(...values)), lowest: Math.round(Math.min(...values)) };
}

function monthlyAttendance(items) {
  const map = new Map();
  items.forEach((item) => {
    const label = (item.date || "").slice(0, 7) || "Unknown";
    const current = map.get(label) || { present: 0, total: 0 };
    current.total += 1;
    if (item.status === "present") current.present += 1;
    map.set(label, current);
  });
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([label, row]) => ({ label, percent: row.total ? Math.round((row.present / row.total) * 100) : 0 }));
}

function subjectAttendance(items) {
  const map = new Map();
  items.forEach((item) => {
    const subject = item.subject || "Not recorded";
    const current = map.get(subject) || { present: 0, total: 0 };
    current.total += 1;
    if (item.status === "present") current.present += 1;
    map.set(subject, current);
  });
  return [...map.entries()].map(([subject, row]) => ({ subject, percent: row.total ? Math.round((row.present / row.total) * 100) : 0 }));
}

function todayPeriods(rows) {
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return rows.flatMap((row) => (row.periods || []).filter((period) => period.day === day).map((period) => ({ ...period, class_level: row.class_level }))).slice(0, 6);
}

function assignmentStatus(item, user) {
  if (item.status) return item.status;
  if (user.role === "student") {
    if (item.own_submission) return assignmentSubmissionStatus(item.own_submission);
    return isPast(item.deadline) ? "Overdue" : "Pending";
  }
  return Number(item.submission_count || 0) > 0 ? "Submitted" : isPast(item.deadline) ? "Overdue" : "Pending";
}

function assignmentSubmissions(assignments) {
  return assignments.flatMap((assignment) => (assignment.submissions || []).map((submission) => ({ ...submission, assignmentTitle: assignment.title })));
}

function assignmentSubmissionStatus(submission) {
  if (!submission) return "Pending";
  if (submission.status === "late") return "Late";
  if (submission.status === "reviewed") return "Reviewed";
  return "Submitted";
}

function isPast(value) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function combineDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return "";
  return `${dateValue}T${timeValue}`;
}

function roleTitle(role) {
  if (role === "super_admin") return "Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeRemaining(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "Not tracked";
  return `Rs ${number.toLocaleString("en-IN")}`;
}

const operationsCenterStyles = `
.operations-center {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(14px, 2vw, 24px);
  color: #eef4ff;
  background: linear-gradient(135deg, #07101d 0%, #091625 48%, #120b15 100%);
  border: 1px solid rgba(100,116,139,.2);
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 24px 80px rgba(2,6,23,.24);
}
.ops-page-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.ops-page-head h1 { margin: 0 0 5px; font-size: clamp(24px, 3vw, 34px); color: #fff; letter-spacing: 0; }
.ops-page-head p { margin: 0; color: #8ea0b8; font-size: 13px; font-weight: 800; }
.ops-page-head p span { color: #f87171; }
.ops-summary-grid { display: grid; grid-template-columns: repeat(5, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
.ops-module-card, .ops-panel, .ops-metric-deck article {
  border: 1px solid rgba(148,163,184,.18);
  background: linear-gradient(180deg, rgba(15,26,42,.96), rgba(9,18,31,.96));
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0,0,0,.24);
}
.ops-module-card, .ops-panel, .ops-metric-deck article { animation: opsCardIn 320ms ease both; }
.ops-summary-grid .ops-module-card:nth-child(2), .ops-metric-deck article:nth-child(2) { animation-delay: 45ms; }
.ops-summary-grid .ops-module-card:nth-child(3), .ops-metric-deck article:nth-child(3) { animation-delay: 90ms; }
.ops-summary-grid .ops-module-card:nth-child(4), .ops-metric-deck article:nth-child(4) { animation-delay: 135ms; }
.ops-summary-grid .ops-module-card:nth-child(5) { animation-delay: 180ms; }
.ops-summary-grid .ops-module-card:nth-child(6) { animation-delay: 225ms; }
.ops-module-card { display: grid; gap: 14px; min-height: 208px; padding: 16px; }
.ops-module-card header, .ops-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ops-module-card header > div:last-child { min-width: 0; }
.ops-module-card strong, .ops-panel h2 { color: #fff; }
.ops-module-card header strong { display: block; font-size: 15px; }
.ops-module-card header span, .ops-module-card .ops-metric-row span, .ops-panel small { color: #8ea0b8; font-size: 12px; }
.ops-module-icon { width: 38px; height: 38px; min-width: 38px; display: grid; place-items: center; border-radius: 8px; color: #fff; }
.ops-module-icon.green { background: linear-gradient(135deg, #178c65, #7ed957); }
.ops-module-icon.violet { background: linear-gradient(135deg, #5146d8, #9b7cff); }
.ops-module-icon.blue { background: linear-gradient(135deg, #1d4ed8, #60a5fa); }
.ops-module-icon.amber { background: linear-gradient(135deg, #a15c08, #f59e0b); }
.ops-module-icon.red { background: linear-gradient(135deg, #8f1026, #d61f3a); }
.ops-card-value { color: #fff; font-size: clamp(27px, 3vw, 38px); line-height: 1; font-weight: 950; }
.ops-metric-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ops-metric-row span { min-width: 0; padding: 9px; border: 1px solid rgba(148,163,184,.13); border-radius: 8px; background: rgba(4,10,20,.44); }
.ops-metric-row strong { display: block; margin-top: 4px; font-size: 14px; overflow-wrap: anywhere; }
.ops-red-button, .ops-soft-button {
  min-height: 36px;
  border-radius: 6px;
  border: 1px solid rgba(248,113,113,.34);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  color: #fff;
  background: linear-gradient(135deg, #b9152d, #7f1020);
  font-weight: 900;
  cursor: pointer;
}
.ops-soft-button { background: rgba(148,163,184,.08); border-color: rgba(148,163,184,.2); color: #dbeafe; }
.ops-red-button:hover, .ops-soft-button:hover, .ops-icon:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(214,31,58,.18); }
.ops-hub-layout, .ops-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
.span-2 { grid-column: span 2; }
.span-3 { grid-column: 1 / -1; }
.ops-panel { padding: 14px; overflow: hidden; }
.ops-panel > header { margin-bottom: 12px; }
.ops-panel h2 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 16px; letter-spacing: 0; }
.ops-panel h2 svg { color: #fb7185; }
.ops-metric-deck { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ops-metric-deck article { min-height: 82px; padding: 14px; display: grid; align-content: center; gap: 7px; }
.ops-metric-deck span { color: #8ea0b8; font-size: 12px; font-weight: 850; }
.ops-metric-deck strong { color: #fff; font-size: clamp(22px, 2vw, 30px); overflow-wrap: anywhere; }
.ops-chart { min-height: 260px; position: relative; border: 1px solid rgba(148,163,184,.13); border-radius: 8px; background: linear-gradient(180deg, rgba(8,18,32,.9), rgba(6,13,24,.9)); overflow: hidden; }
.ops-chart::before, .ops-bars::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px); background-size: 44px 44px; pointer-events: none; }
.ops-chart svg { position: absolute; inset: 18px; width: calc(100% - 36px); height: calc(100% - 36px); overflow: visible; }
.ops-chart polyline { fill: none; stroke: #fb4d5f; stroke-width: 3; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 10px rgba(251,77,95,.45)); stroke-dasharray: 100; animation: opsLineDraw 420ms ease both; }
.ops-chart div { position: absolute; inset: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(22px, 1fr)); gap: 10px; align-items: end; opacity: .3; }
.ops-chart i, .ops-bars i { display: block; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, #8b7cf6, #fb4d5f); transform-origin: bottom; animation: opsBarIn 360ms ease both; }
.ops-donut { width: 170px; height: 170px; margin: 8px auto 14px; border-radius: 999px; display: grid; place-items: center; align-content: center; background: conic-gradient(#7ed957 calc(var(--value) * 1%), #fb4d5f 0 100%); box-shadow: inset 0 0 0 22px #0b1728; animation: opsRingFill 420ms ease both; }
.ops-donut strong { color: #fff; font-size: 30px; }
.ops-donut span { color: #8ea0b8; font-size: 12px; font-weight: 850; }
.ops-bars { min-height: 260px; position: relative; display: flex; align-items: end; gap: 12px; padding: 18px; border: 1px solid rgba(148,163,184,.13); border-radius: 8px; background: rgba(4,10,20,.36); overflow-x: auto; }
.ops-bars span { min-width: 58px; height: 210px; display: grid; grid-template-rows: minmax(0, 1fr) auto; align-items: end; gap: 8px; color: #8ea0b8; font-size: 11px; text-align: center; position: relative; }
.ops-bars i { width: 100%; min-height: 4px; }
.ops-table-wrap { max-width: 100%; overflow: auto; border: 1px solid rgba(148,163,184,.16); border-radius: 8px; background: rgba(5,12,22,.72); }
.ops-table-wrap table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table-wrap th, .ops-table-wrap td { padding: 12px; border-bottom: 1px solid rgba(148,163,184,.13); color: #dbeafe; text-align: left; white-space: nowrap; vertical-align: top; }
.ops-table-wrap th { position: sticky; top: 0; z-index: 1; background: #0d1a2c; color: #8ea0b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
.ops-table-wrap tr:hover td { background: rgba(127,16,32,.13); }
.ops-tools { width: min(380px, 100%); min-height: 38px; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 0 10px; border: 1px solid rgba(148,163,184,.18); border-radius: 8px; background: rgba(4,10,20,.5); color: #8ea0b8; }
.ops-tools input, .ops-actions input, .ops-actions select, .ops-form input, .ops-form select, .ops-form textarea, .ops-inline-edit input, .ops-inline-edit textarea, .ops-submit-form input {
  border: 1px solid rgba(148,163,184,.18);
  border-radius: 6px;
  background: rgba(4,10,20,.72);
  color: #f8fafc;
}
.ops-tools input { border: 0; background: transparent; padding-left: 0; }
.ops-form { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) auto; gap: 10px; }
.ops-form textarea { grid-column: span 2; min-height: 42px; resize: vertical; }
.quick-attendance-toolbar { display: grid; grid-template-columns: minmax(150px, 220px) minmax(150px, 200px) auto 1fr; align-items: center; gap: 9px; margin-bottom: 12px; }
.quick-attendance-toolbar select, .quick-attendance-toolbar input { min-height: 38px; padding: 8px 10px; color: #f8fafc; background: rgba(4,10,20,.72); border: 1px solid rgba(148,163,184,.18); border-radius: 6px; }
.quick-attendance-toolbar > span { justify-self: end; color: #aeb6c4; font-size: 12px; font-weight: 900; }
.quick-attendance-list { display: flex; flex-wrap: wrap; gap: 8px; min-height: 64px; padding: 12px; border: 1px solid rgba(148,163,184,.14); border-radius: 8px; background: rgba(4,10,20,.36); }
.quick-attendance-list > button { min-width: 175px; flex: 1 1 190px; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 48px; padding: 7px 9px; color: #dbeafe; text-align: left; border: 1px solid rgba(34,197,94,.24); border-radius: 8px; background: rgba(34,197,94,.09); cursor: pointer; }
.quick-attendance-list > button:hover { transform: translateY(-1px); }
.quick-attendance-list > button.absent { color: #fecdd3; border-color: rgba(251,113,133,.32); background: rgba(214,31,58,.14); }
.quick-attendance-list > button > span { width: 28px; height: 28px; display: grid; place-items: center; color: #bbf7d0; background: rgba(34,197,94,.13); border-radius: 7px; font-size: 11px; font-weight: 950; }
.quick-attendance-list > button.absent > span { color: #fecdd3; background: rgba(214,31,58,.16); }
.quick-attendance-list > button strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: inherit; font-size: 12px; }
.quick-attendance-list > button em { color: inherit; font-size: 10px; font-style: normal; font-weight: 900; text-transform: uppercase; }
.quick-attendance-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 12px; }
.quick-attendance-actions small { color: #8ea0b8; }
.exam-form-labelled label { display: grid; gap: 6px; color: #8ea0b8; font-size: 12px; font-weight: 850; }
.exam-form-labelled label.span-field { grid-column: span 2; }
.exam-form-labelled label input,
.exam-form-labelled label select,
.exam-form-labelled label textarea { width: 100%; }
.assignment-form-labelled label { display: grid; gap: 6px; color: #8ea0b8; font-size: 12px; font-weight: 850; }
.assignment-form-labelled label.span-field { grid-column: span 2; }
.assignment-form-labelled label input,
.assignment-form-labelled label select,
.assignment-form-labelled label textarea { width: 100%; }
.fee-form-labelled label { display: grid; gap: 6px; color: #8ea0b8; font-size: 12px; font-weight: 850; }
.fee-form-labelled label.span-field { grid-column: span 2; }
.fee-form-labelled label input,
.fee-form-labelled label select { width: 100%; }
.fee-history { display: grid; gap: 4px; min-width: 240px; }
.fee-history span { color: #dbeafe; font-size: 12px; white-space: normal; }
.ops-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.ops-actions input, .ops-actions select { width: 126px; min-height: 34px; padding: 8px; }
.ops-icon { width: 34px; min-width: 34px; height: 34px; display: inline-grid; place-items: center; border-radius: 6px; border: 1px solid rgba(96,165,250,.28); color: #9cc5ff; background: rgba(37,99,235,.12); cursor: pointer; }
.ops-icon.danger { color: #fb7185; border-color: rgba(251,113,133,.28); background: rgba(214,31,58,.12); }
.ops-status { display: inline-flex; min-height: 25px; align-items: center; padding: 0 9px; border-radius: 999px; color: #bbf7d0; background: rgba(34,197,94,.15); border: 1px solid rgba(34,197,94,.22); font-size: 12px; font-weight: 900; text-transform: capitalize; }
.ops-status.absent, .ops-status.pending { color: #fecdd3; background: rgba(214,31,58,.16); border-color: rgba(251,113,133,.24); }
.ops-status.submitted { color: #bfdbfe; background: rgba(59,130,246,.16); border-color: rgba(96,165,250,.26); }
.ops-status.completed { color: #fde68a; background: rgba(245,158,11,.16); border-color: rgba(245,158,11,.26); }
.ops-subject-list, .ops-installments, .ops-timeline { display: grid; gap: 9px; }
.ops-subject-list span, .ops-installments article, .ops-timeline div { display: flex; justify-content: space-between; gap: 10px; padding: 10px; border-radius: 8px; border: 1px solid rgba(148,163,184,.13); background: rgba(4,10,20,.42); color: #8ea0b8; }
.ops-subject-list strong, .ops-installments strong, .ops-timeline strong { color: #fff; }
.ops-timeline div { display: grid; justify-content: stretch; border-left: 3px solid rgba(148,163,184,.22); }
.ops-timeline div.active { border-left-color: #d61f3a; box-shadow: inset 0 0 0 1px rgba(214,31,58,.16); }
.ops-assignment-list { display: grid; gap: 10px; }
.ops-assignment-list > article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid rgba(148,163,184,.16); border-radius: 8px; background: rgba(4,10,20,.42); }
.ops-assignment-list > article, .ops-timeline div, .ops-subject-list span, .ops-installments article, .ops-table-wrap tbody tr { animation: opsItemIn 260ms ease both; }
.ops-assignment-list > article:nth-child(2), .ops-timeline div:nth-child(2), .ops-subject-list span:nth-child(2), .ops-installments article:nth-child(2), .ops-table-wrap tbody tr:nth-child(2) { animation-delay: 35ms; }
.ops-assignment-list > article:nth-child(3), .ops-timeline div:nth-child(3), .ops-subject-list span:nth-child(3), .ops-installments article:nth-child(3), .ops-table-wrap tbody tr:nth-child(3) { animation-delay: 70ms; }
.ops-assignment-list > article:nth-child(4), .ops-timeline div:nth-child(4), .ops-subject-list span:nth-child(4), .ops-installments article:nth-child(4), .ops-table-wrap tbody tr:nth-child(4) { animation-delay: 105ms; }
.ops-assignment-list.compact > article { grid-template-columns: auto minmax(0, 1fr) auto; }
.ops-file-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 8px; color: #dbeafe; background: linear-gradient(135deg, #1d4ed8, #5146d8); }
.ops-assignment-list strong { display: block; color: #fff; }
.ops-assignment-list span, .ops-assignment-list small { display: block; color: #8ea0b8; font-size: 12px; line-height: 1.45; }
.ops-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.ops-tabs button { min-height: 30px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(148,163,184,.16); background: rgba(4,10,20,.44); color: #9fb2ce; font-weight: 850; cursor: pointer; }
.ops-tabs button.active { color: #fff; border-color: rgba(251,113,133,.42); background: rgba(214,31,58,.24); }
.ops-inline-edit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ops-inline-edit textarea, .ops-submit-form { grid-column: 1 / -1; }
.ops-submit-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.assignment-filters { width: 100%; display: grid; grid-template-columns: auto minmax(170px, 1fr) minmax(132px, .42fr) minmax(150px, .5fr); }
.assignment-filters select { min-height: 34px; padding: 7px 8px; border: 1px solid rgba(148,163,184,.18); border-radius: 6px; background: rgba(4,10,20,.72); color: #f8fafc; }
.assignment-submit-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
.ops-submission-strip, .ops-delete-strip { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.ops-submission-strip span { padding: 6px 8px; border-radius: 6px; background: rgba(59,130,246,.12); color: #bfdbfe; }
.ops-period { display: grid; gap: 4px; min-width: 126px; padding: 9px; border-radius: 8px; background: linear-gradient(135deg, rgba(29,78,216,.24), rgba(127,16,32,.2)); border: 1px solid rgba(148,163,184,.14); }
.ops-period strong { color: #fff; }
.ops-period span, .ops-period small { color: #a9bad2; }
.exam-question-form { margin-bottom: 12px; padding: 12px; border: 1px solid rgba(148,163,184,.14); border-radius: 8px; background: rgba(4,10,20,.38); }
.bulk-import-form { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bulk-import-form input[type="file"] { color: #dbeafe; font-size: 12.5px; max-width: 280px; }
.bulk-import-result { display: grid; gap: 8px; margin-top: 10px; padding: 12px; border-radius: 8px; border: 1px solid rgba(148,163,184,.16); background: rgba(4,10,20,.42); }
.bulk-import-summary { display: flex; gap: 14px; flex-wrap: wrap; }
.bulk-import-summary span { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 850; }
.bulk-import-summary .ok { color: #86efac; }
.bulk-import-summary .warn { color: #fca5a5; }
.bulk-import-errors { margin: 0; padding-left: 18px; color: #fca5a5; font-size: 12px; display: grid; gap: 4px; max-height: 160px; overflow: auto; }
.ops-panel-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.ops-panel-title-row h2 { display: flex; align-items: center; gap: 9px; margin: 0; color: #fff; font-size: 16px; letter-spacing: 0; }
.ops-panel-title-row h2 svg { color: #fb7185; }
.ops-file-icon input { accent-color: #d61f3a; }
.exam-question-list .ops-file-icon span { font-weight: 950; color: #fff; }
.exam-taking-panel, .exam-evaluation {
  grid-column: 1 / -1;
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(148,163,184,.16);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(15,26,42,.96), rgba(9,18,31,.96));
}
.exam-taking-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.exam-taking-panel > header strong { display: block; color: #fff; font-size: 17px; }
.exam-taking-panel > header span { color: #8ea0b8; font-size: 12px; font-weight: 850; }
.exam-timer { min-height: 36px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 6px; border: 1px solid rgba(251,113,133,.34); background: rgba(214,31,58,.16); color: #fecdd3; font-weight: 950; }
.exam-taking-panel article, .exam-evaluation article {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 8px;
  background: rgba(4,10,20,.42);
}
.exam-taking-panel h3 { margin: 0; color: #fff; font-size: 18px; letter-spacing: 0; }
.exam-taking-panel textarea, .exam-evaluation textarea {
  width: 100%;
  min-height: 120px;
  padding: 11px;
  border: 1px solid rgba(148,163,184,.18);
  border-radius: 6px;
  background: rgba(4,10,20,.72);
  color: #f8fafc;
  resize: vertical;
}
.exam-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.exam-options button {
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
.exam-options button.active { border-color: rgba(251,113,133,.48); background: rgba(214,31,58,.24); color: #fff; }
.exam-question-nav { display: flex; flex-wrap: wrap; gap: 8px; }
.exam-question-nav button {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid rgba(148,163,184,.18);
  color: #dbeafe;
  background: rgba(4,10,20,.58);
  font-weight: 900;
  cursor: pointer;
}
.exam-question-nav button.answered { color: #bbf7d0; border-color: rgba(34,197,94,.28); background: rgba(34,197,94,.14); }
.exam-question-nav button.current { color: #fff; border-color: rgba(251,113,133,.48); background: rgba(214,31,58,.24); }
.exam-evaluation strong { color: #fff; }
.exam-evaluation span, .exam-evaluation small { color: #8ea0b8; }
.inline-message { background: #0d1a2c; color: #fff; border-color: rgba(251,113,133,.36); }
.operations-center .empty-state { color: #8ea0b8; }
.operations-center .empty-state strong { color: #fff; }
@keyframes opsCardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes opsItemIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes opsBarIn { from { opacity: .45; transform: scaleY(.24); } to { opacity: 1; transform: scaleY(1); } }
@keyframes opsLineDraw { from { stroke-dashoffset: 100; opacity: .45; } to { stroke-dashoffset: 0; opacity: 1; } }
@keyframes opsRingFill { from { --value: 0; } }
@media (max-width: 1240px) {
  .ops-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ops-hub-layout, .ops-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .span-2, .span-3 { grid-column: 1 / -1; }
  .ops-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .operations-center { margin: 0; padding: 12px; }
  .ops-page-head, .ops-assignment-list > article { align-items: stretch; grid-template-columns: 1fr; }
  .ops-page-head { display: grid; }
  .ops-summary-grid, .ops-hub-layout, .ops-detail-grid, .ops-metric-deck, .ops-form, .ops-inline-edit, .ops-submit-form { grid-template-columns: 1fr; }
  .exam-form-labelled label.span-field { grid-column: auto; }
  .assignment-form-labelled label.span-field { grid-column: auto; }
  .fee-form-labelled label.span-field { grid-column: auto; }
  .assignment-filters { grid-template-columns: auto minmax(0, 1fr); }
  .assignment-filters select { grid-column: 1 / -1; }
  .exam-options, .exam-taking-panel > header { grid-template-columns: 1fr; display: grid; }
  .ops-form textarea { grid-column: auto; }
  .quick-attendance-toolbar { grid-template-columns: 1fr; }
  .quick-attendance-toolbar > span { justify-self: start; }
  .quick-attendance-actions { align-items: stretch; flex-direction: column; }
  .quick-attendance-list > button { flex-basis: 100%; }
  .ops-metric-row { grid-template-columns: 1fr; }
  .ops-table-wrap table { min-width: max-content; }
}

html[data-theme="light"] .operations-center {
  color: #172033;
  background:
    radial-gradient(circle at 10% 0%, rgba(214,31,58,.10), transparent 30%),
    radial-gradient(circle at 90% 8%, rgba(37,99,235,.08), transparent 28%),
    linear-gradient(145deg, #f8fafc, #ffffff 52%, #f7f8fb);
  border-color: rgba(203,213,225,.82);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 24px 70px rgba(15,23,42,.08);
}
html[data-theme="light"] .operations-center .ops-page-head h1,
html[data-theme="light"] .operations-center .ops-module-card strong,
html[data-theme="light"] .operations-center .ops-panel h2,
html[data-theme="light"] .operations-center .ops-card-value,
html[data-theme="light"] .operations-center .ops-metric-deck strong,
html[data-theme="light"] .operations-center .ops-subject-list strong,
html[data-theme="light"] .operations-center .ops-installments strong,
html[data-theme="light"] .operations-center .ops-timeline strong,
html[data-theme="light"] .operations-center .ops-assignment-list strong,
html[data-theme="light"] .operations-center .ops-panel-title-row h2,
html[data-theme="light"] .operations-center .exam-taking-panel > header strong,
html[data-theme="light"] .operations-center .exam-taking-panel h3,
html[data-theme="light"] .operations-center .exam-evaluation strong,
html[data-theme="light"] .operations-center .ops-period strong,
html[data-theme="light"] .operations-center .empty-state strong { color: #172033; }
html[data-theme="light"] .operations-center .ops-page-head p,
html[data-theme="light"] .operations-center .ops-module-card header span,
html[data-theme="light"] .operations-center .ops-module-card .ops-metric-row span,
html[data-theme="light"] .operations-center .ops-panel small,
html[data-theme="light"] .operations-center .ops-metric-deck span,
html[data-theme="light"] .operations-center .ops-donut span,
html[data-theme="light"] .operations-center .ops-bars span,
html[data-theme="light"] .operations-center .ops-subject-list span,
html[data-theme="light"] .operations-center .ops-installments article,
html[data-theme="light"] .operations-center .ops-timeline div,
html[data-theme="light"] .operations-center .ops-assignment-list span,
html[data-theme="light"] .operations-center .ops-assignment-list small,
html[data-theme="light"] .operations-center .exam-taking-panel > header span,
html[data-theme="light"] .operations-center .exam-evaluation span,
html[data-theme="light"] .operations-center .exam-evaluation small,
html[data-theme="light"] .operations-center .ops-period span,
html[data-theme="light"] .operations-center .ops-period small,
html[data-theme="light"] .operations-center .empty-state { color: #64748b; }
html[data-theme="light"] .operations-center .ops-module-card,
html[data-theme="light"] .operations-center .ops-panel,
html[data-theme="light"] .operations-center .ops-metric-deck article,
html[data-theme="light"] .operations-center .exam-taking-panel,
html[data-theme="light"] .operations-center .exam-evaluation {
  border-color: rgba(203,213,225,.82);
  background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
  box-shadow: 0 18px 48px rgba(15,23,42,.08);
}
html[data-theme="light"] .operations-center .ops-metric-row span,
html[data-theme="light"] .operations-center .ops-subject-list span,
html[data-theme="light"] .operations-center .ops-installments article,
html[data-theme="light"] .operations-center .ops-timeline div,
html[data-theme="light"] .operations-center .ops-assignment-list > article,
html[data-theme="light"] .operations-center .exam-question-form,
html[data-theme="light"] .operations-center .exam-taking-panel article,
html[data-theme="light"] .operations-center .exam-evaluation article {
  background: #f8fafc;
  border-color: rgba(203,213,225,.76);
}
html[data-theme="light"] .operations-center .ops-chart,
html[data-theme="light"] .operations-center .ops-bars {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  border-color: rgba(203,213,225,.76);
}
html[data-theme="light"] .operations-center .ops-chart::before,
html[data-theme="light"] .operations-center .ops-bars::before {
  background-image: linear-gradient(rgba(148,163,184,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.13) 1px, transparent 1px);
}
html[data-theme="light"] .operations-center .ops-donut { box-shadow: inset 0 0 0 22px #ffffff, 0 16px 38px rgba(15,23,42,.10); }
html[data-theme="light"] .operations-center .ops-donut strong { color: #172033; }
html[data-theme="light"] .operations-center .ops-table-wrap {
  background: #ffffff;
  border-color: rgba(203,213,225,.82);
}
html[data-theme="light"] .operations-center .ops-table-wrap th,
html[data-theme="light"] .operations-center .ops-table-wrap td { color: #334155; border-bottom-color: rgba(203,213,225,.68); }
html[data-theme="light"] .operations-center .ops-table-wrap th { color: #64748b; background: #f1f5f9; }
html[data-theme="light"] .operations-center .ops-table-wrap tr:hover td { background: #fff7f8; }
html[data-theme="light"] .operations-center .ops-tools,
html[data-theme="light"] .operations-center .ops-tabs button {
  color: #64748b;
  background: #ffffff;
  border-color: rgba(203,213,225,.82);
}
html[data-theme="light"] .operations-center .ops-tools input,
html[data-theme="light"] .operations-center .ops-actions input,
html[data-theme="light"] .operations-center .ops-actions select,
html[data-theme="light"] .operations-center .ops-form input,
html[data-theme="light"] .operations-center .ops-form select,
html[data-theme="light"] .operations-center .ops-form textarea,
html[data-theme="light"] .operations-center .quick-attendance-toolbar input,
html[data-theme="light"] .operations-center .quick-attendance-toolbar select,
html[data-theme="light"] .operations-center .ops-inline-edit input,
html[data-theme="light"] .operations-center .ops-inline-edit textarea,
html[data-theme="light"] .operations-center .ops-submit-form input,
html[data-theme="light"] .operations-center .exam-taking-panel textarea,
html[data-theme="light"] .operations-center .exam-evaluation textarea {
  color: #172033;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .operations-center .ops-soft-button { color: #334155; background: #ffffff; border-color: rgba(203,213,225,.9); }
html[data-theme="light"] .operations-center .quick-attendance-toolbar > span,
html[data-theme="light"] .operations-center .quick-attendance-actions small { color: #64748b; }
html[data-theme="light"] .operations-center .quick-attendance-list { background: #f8fafc; border-color: rgba(203,213,225,.76); }
html[data-theme="light"] .operations-center .quick-attendance-list > button.present { color: #166534; background: #f0fdf4; border-color: rgba(34,197,94,.28); }
html[data-theme="light"] .operations-center .quick-attendance-list > button.absent { color: #9f1239; background: #fff1f2; border-color: rgba(225,29,72,.28); }
html[data-theme="light"] .operations-center .ops-tabs button.active,
html[data-theme="light"] .operations-center .exam-options button.active { color: #ffffff; background: linear-gradient(135deg, #d61f3a, #8f1026); }
html[data-theme="light"] .operations-center .exam-options button { color: #334155; background: #ffffff; border-color: rgba(203,213,225,.9); }
html[data-theme="light"] .operations-center .ops-period { background: linear-gradient(135deg, rgba(219,234,254,.84), rgba(255,241,242,.90)); border-color: rgba(203,213,225,.82); }
html[data-theme="light"] .operations-center .inline-message { color: #172033; background: #ffffff; border-color: rgba(214,31,58,.24); }
`;
