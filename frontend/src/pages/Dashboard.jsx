import { ArrowRight, BarChart3, Bookmark, BookOpen, CalendarCheck, ChartNoAxesCombined, Clapperboard, Clock3, Download, Eye, FileText, GraduationCap, Layers3, Megaphone, Newspaper, Play, Send, Sparkles, Target, Trophy, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, api } from "../api/client.js";
import dashboardHero from "../assets/dashboard-hero.png";
import { useAuth } from "../components/AuthProvider.jsx";
import { AnimatedValue, LoadingOverlay, SkeletonGrid, useToast } from "../components/UX.jsx";

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [studentExtra, setStudentExtra] = useState({ assignments: [], timetables: [], notes: [], blogs: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard/").then(setData).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (user.role !== "student") return;
    Promise.all([
      api("/assignments/").catch(() => ({ results: [] })),
      api("/timetables/").catch(() => ({ results: [] })),
      api("/notes/").catch(() => ({ results: [] })),
      api("/blogs/").catch(() => ({ results: [] })),
    ]).then(([assignments, timetables, notes, blogs]) => {
      setStudentExtra({
        assignments: assignments.results || [],
        timetables: timetables.results || [],
        notes: notes.results || [],
        blogs: blogs.results || [],
      });
    });
  }, [user.role]);

  const loading = !data && !error;
  const withLoader = (content) => (
    <>
      <LoadingOverlay show={loading} label="Loading dashboard" />
      {content}
    </>
  );

  if (error) return withLoader(<div className="panel error-state">{error}</div>);
  if (!data) return withLoader(<SkeletonGrid count={6} />);

  if (user.role === "super_admin") {
    return withLoader(
      <div className="premium-dashboard admin-dashboard page-grid">
        <style>{dashboardPremiumStyles}</style>
        <NoticeList notices={data.recent_notices} />
        <Stat index={0} icon={GraduationCap} label="Students" value={data.total_students} trend="Live roster" />
        <Stat index={1} icon={UsersRound} label="Teachers" value={data.total_teachers} trend="Active faculty" />
        <Stat index={2} icon={BookOpen} label="Notes" value={data.total_notes} trend="Library items" />
        <Stat index={3} icon={Clapperboard} label="Videos" value={data.total_videos} trend="Learning media" />
        <Stat index={4} icon={CalendarCheck} label="Attendance Records" value={data.attendance_records} trend="Auto-updated" />
        <Stat index={5} icon={ChartNoAxesCombined} label="Marks Records" value={data.marks_records} trend="Assessment data" />
        <Stat index={6} icon={BookOpen} label="Assignments" value={data.total_assignments || 0} trend="Open workflow" />
        <Stat index={7} icon={BookOpen} label="Blogs" value={data.total_blogs || 0} trend="Published posts" />
      </div>
    );
  }

  if (user.role === "teacher") {
    return withLoader(
      <div className="premium-dashboard teacher-dashboard page-grid">
        <style>{dashboardPremiumStyles}</style>
        <NoticeList notices={data.recent_notices} />
        <Stat index={0} icon={UsersRound} label="Assigned Students" value={data.students} trend="Your classes" />
        <Stat index={1} icon={BookOpen} label="Assigned Classes" value={data.assigned_classes?.join(", ") || "-"} trend="Current access" />
      </div>
    );
  }

  return withLoader(
    <div className="student-dashboard premium-dashboard student-premium">
      <style>{dashboardPremiumStyles}</style>
      <section className="student-top-row">
        <WelcomeCard profile={data.profile} attendance={data.attendance_percentage} assignments={studentExtra.assignments} notes={studentExtra.notes} />
        <QuickActions />
      </section>
      <div className="student-lower-dashboard">
        <DashboardSection title="Academic Overview" subtitle="Your academic performance at a glance.">
          <PremiumStats data={data} extras={studentExtra} />
          <StudentAnalytics data={data} extras={studentExtra} />
          <section className="student-card-grid academic-card-grid">
            <MarksCard items={(data.marks || []).slice(0, 3)} />
            <AssignmentsCard items={studentExtra.assignments.slice(0, 3)} />
            <TimetablePanel items={studentExtra.timetables} />
          </section>
        </DashboardSection>
        <DashboardSection title="Learning Resources" subtitle="Recent study material and learning updates.">
          <section className="student-card-grid resource-card-grid">
            <InteractiveNotesCard items={studentExtra.notes.slice(0, 3)} />
            <VideosCard items={(data.recent_videos || []).slice(0, 2)} />
            <BlogsCard items={studentExtra.blogs.slice(0, 3)} />
            <CurrentAffairsCard items={(data.current_affairs || []).slice(0, 3)} />
          </section>
        </DashboardSection>
        <DashboardSection title="Updates & Activity" subtitle="Notices and recent school updates.">
          <NoticeList notices={data.latest_notices} featured />
        </DashboardSection>
      </div>
      <Link className="floating-action" to="/learning" data-tooltip="Open learning library">
        <BookOpen size={20} />
      </Link>
    </div>
  );
}

function DashboardSection({ title, subtitle, children }) {
  return (
    <section className="dashboard-section">
      <header className="dashboard-section-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function PremiumStats({ data, extras }) {
  const stats = [
    { label: "Attendance", value: `${data.attendance_percentage || 0}%`, trend: "Monthly average", icon: CalendarCheck },
    { label: "Marks", value: data.marks?.length || 0, trend: "Published records", icon: Trophy },
    { label: "Assignments", value: extras.assignments.length, trend: "Active work", icon: Send },
    { label: "Lecture Count", value: data.recent_videos?.length || 0, trend: "Recent videos", icon: Clapperboard },
    { label: "Notes", value: extras.notes.length, trend: "Library files", icon: FileText },
    { label: "Timetable", value: extras.timetables.length, trend: "Schedule blocks", icon: Clock3 },
  ];
  return (
    <section className="premium-stat-grid">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <article className="premium-stat-card" key={stat.label} style={{ "--stagger": index }}>
            <div className="premium-stat-icon"><Icon size={22} /></div>
            <span>{stat.label}</span>
            <strong><CountValue value={stat.value} /></strong>
            <small>{stat.trend}</small>
          </article>
        );
      })}
    </section>
  );
}

function StudentAnalytics({ data, extras }) {
  const attendance = Math.max(0, Math.min(data.attendance_percentage || 0, 100));
  const marks = data.marks || [];
  const averageMarks = marks.length ? Math.round(marks.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / marks.length) : 0;
  const progress = Math.min(100, Math.round(((extras.notes.length || 0) + (data.recent_videos?.length || 0) + (extras.assignments.length || 0)) * 8));
  const markBars = marks.length ? marks.slice(0, 5) : [{ subject: "Marks", percentage: 0 }];
  const summaryBars = [
    { label: "Attendance", value: attendance },
    { label: "Marks", value: averageMarks },
    { label: "Notes", value: Math.min(100, extras.notes.length * 12) },
    { label: "Videos", value: Math.min(100, (data.recent_videos?.length || 0) * 14) },
    { label: "Tasks", value: Math.min(100, extras.assignments.length * 12) },
  ];
  return (
    <section className="dashboard-analytics">
      <article className="analytics-card attendance-analytics-card">
        <header><CalendarCheck size={20} /><span>Attendance Ring</span></header>
        <div className="dashboard-ring" style={{ "--value": attendance }}>
          <div>
            <strong><CountValue value={`${attendance}%`} /></strong>
            <span>Attendance</span>
          </div>
        </div>
        <small>{attendance >= 75 ? "On track for this month" : "Needs attention this month"}</small>
      </article>
      <article className="analytics-card marks-graph-card">
        <header><BarChart3 size={20} /><span>Marks Graph</span></header>
        <div className="marks-bars">
          {markBars.map((item, index) => (
            <span className="chart-bar-wrap" key={`${item.id || "mark"}-${index}`}>
              <i style={{ height: `${Math.max(10, Math.min(Number(item.percentage || averageMarks || 0), 100))}%` }} />
              <em>{String(item.subject || item.exam_type || index + 1).slice(0, 3)}</em>
            </span>
          ))}
        </div>
        <small>Average {averageMarks}%</small>
      </article>
      <article className="analytics-card activity-card">
        <header><Layers3 size={20} /><span>Academic Summary</span></header>
        <div className="weekly-activity">
          {summaryBars.map((item) => (
            <span className="summary-bar-wrap" key={item.label}>
              <i style={{ "--height": `${Math.max(8, item.value)}%` }} />
              <em>{item.label.slice(0, 3)}</em>
            </span>
          ))}
        </div>
        <div className="course-progress-line"><span style={{ width: `${progress}%` }} /></div>
        <small>{progress}% course activity</small>
      </article>
    </section>
  );
}

function CountValue({ value }) {
  return <AnimatedValue value={value} />;
}

function Stat({ icon: Icon, label, value, trend, progress, index = 0 }) {
  return (
    <section className="stat-card stagger-card" style={{ "--stagger": index }}>
      <div className="stat-icon"><Icon size={22} /></div>
      <span>{label}</span>
      <strong><CountValue value={value} /></strong>
      <small>{trend}</small>
      {typeof progress === "number" && (
        <div className="metric-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
        </div>
      )}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function todayLabel() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function initials(name = "Student") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
}

function youtubeThumb(url = "") {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : "";
}

function resolveAssetUrl(value = "") {
  if (!value) return "";
  try {
    const apiRoot = API_URL.replace(/\/api\/?$/, "");
    return new URL(value, `${apiRoot}/`).toString();
  } catch {
    return value;
  }
}

function downloadName(item) {
  const title = (item.title || "redhero-note").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${title || "redhero-note"}.pdf`;
}

function triggerNoteDownload(item, toast) {
  const url = resolveAssetUrl(item.pdf_url);
  if (!url) {
    toast?.show("No PDF is attached to this note.", "error");
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName(item);
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function WelcomeCard({ profile, attendance, assignments = [], notes = [] }) {
  const pending = assignments.filter((item) => new Date(item.deadline) >= new Date()).length;
  return (
    <section className="student-welcome-card stagger-card" style={{ "--stagger": 0 }}>
      <div className="student-avatar">{profile?.profile_photo ? <img src={profile.profile_photo} alt="" /> : initials(profile?.name)}</div>
      <div className="student-welcome-copy">
        <span className="eyebrow">Student Dashboard · {todayLabel()}</span>
        <h2>Welcome, {profile?.name}</h2>
        <p>Class {profile?.class_level} {profile?.division} · Roll {profile?.roll_number}</p>
      </div>
      <div className="summary-chip-row">
        <span><CalendarCheck size={16} /> {attendance || 0}% Attendance</span>
        <span><Clock3 size={16} /> {pending} Pending</span>
        <span><BookOpen size={16} /> {notes.length} Notes</span>
      </div>
      <div className="welcome-glow" />
    </section>
  );
}

function NoticeList({ notices = [], featured = false }) {
  const [selected, setSelected] = useState(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const importantWords = ["important", "urgent", "exam", "deadline", "notice"];

  useEffect(() => {
    if (!featured || paused || notices.length < 2) return undefined;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % notices.length), 4000);
    return () => window.clearInterval(timer);
  }, [featured, paused, notices.length]);

  return (
    <section className={`panel notice-board ${featured ? "student-notice-board" : "wide"}`}>
      <h2><Megaphone size={20} /> Notice Board <span className="section-count">{notices.length} live</span></h2>
      <div className="notice-viewport" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {notices.length === 0 && <CardEmpty icon={Megaphone} title="No notices right now" message="Published notices will appear here." />}
        <div className={featured ? "notice-slider" : "notice-marquee"} style={featured ? { transform: `translateY(-${active * 100}%)` } : undefined}>
          {(featured ? notices : [...notices, ...notices]).map((notice, index) => {
            const important = importantWords.some((word) => `${notice.title} ${notice.body}`.toLowerCase().includes(word));
            return (
              <button key={`${notice.id}-${index}`} className={`notice-item ${important ? "priority-high" : "priority-normal"}`} onClick={() => setSelected(notice)} style={{ "--stagger": index % Math.max(notices.length, 1) }}>
                <span className={important || index === 0 ? "notice-badge important" : "notice-badge"}>{important ? "IMPORTANT" : "NEW"}</span>
                <strong>{notice.title}</strong>
                <span>{notice.body}</span>
                <small>{formatDate(notice.created_at || notice.date || notice.updated_at || new Date())}</small>
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <article className="modal notice-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="ghost-icon modal-close" aria-label="Close notice" onClick={() => setSelected(null)}><X size={18} /></button>
            <span className="notice-badge important">IMPORTANT</span>
            <h2>{selected.title}</h2>
            <small className="modal-date">{formatDate(selected.created_at || selected.date || selected.updated_at || new Date())}</small>
            <p>{selected.body}</p>
          </article>
        </div>
      )}
    </section>
  );
}

function QuickActions() {
  const actions = [
    { to: "/learning", label: "Learning", icon: BookOpen },
    { to: "/operations", label: "Operations", icon: CalendarCheck },
    { to: "/practice-progress", label: "Practice", icon: Target },
    { to: "/ai-tutor", label: "AI Tutor", icon: Sparkles },
    { to: "/operations", label: "Assignments", icon: Send },
    { to: "/operations", label: "Timetable", icon: Clock3 },
    { to: "/operations", label: "Attendance", icon: CalendarCheck },
  ];
  return (
    <section className="panel quick-actions-card stagger-card" style={{ "--stagger": 2 }}>
      <h2>Quick Actions</h2>
      <div className="quick-action-grid">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.to} to={action.to} className="quick-action" data-tooltip={action.label}>
              <Icon size={18} />
              <span>{action.label}</span>
              <ArrowRight size={16} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TimetablePanel({ items = [] }) {
  const periods = items.flatMap((item) => (item.periods || []).map((period) => ({ ...period, class_level: item.class_level }))).slice(0, 5);
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 5 }}>
      <CardHeader icon={Clock3} title="Timetable" />
      <div className="stack accordion-list">
        {periods.length === 0 && <CardEmpty icon={Clock3} title="No timetable available" message="Timetable entries will appear here." />}
        {periods.map((period, index) => (
          <details key={`${period.day}-${period.time}-${index}`} className="accordion-item">
            <summary>{period.day} · {period.time}</summary>
            <span>{period.subject}{period.teacher ? ` · ${period.teacher}` : ""}</span>
          </details>
        ))}
      </div>
    </section>
  );
}

function CardHeader({ icon: Icon, title, action }) {
  return (
    <header className="student-card-header">
      <div><Icon size={20} /><h2>{title}</h2></div>
      {action}
    </header>
  );
}

function CardEmpty({ icon: Icon = Sparkles, title, message, action }) {
  return (
    <div className="premium-empty">
      <div className="empty-illustration"><Icon size={24} /></div>
      <strong>{title}</strong>
      <span>{message}</span>
      {action}
    </div>
  );
}

function NotesCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 0 }}>
      <CardHeader icon={FileText} title="Notes Library" action={<Link className="mini-button" to="/learning">All notes</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty icon={FileText} title="No notes available" message="Your class notes will appear here." action={<Link className="mini-button" to="/learning">Open library</Link>} />}
        {items.map((item) => (
          <article className="note-resource" key={item.id}>
            <div className="pdf-thumb"><FileText size={28} /><span>PDF</span></div>
            <div>
              <strong>{item.title}</strong>
              <span>{item.subject} · {item.chapter}</span>
            </div>
            <div className="card-button-row">
              <button className="mini-button" type="button"><Bookmark size={15} /> Bookmark</button>
              <a className="mini-button" href={item.pdf_url} target="_blank" rel="noreferrer"><Eye size={15} /> View</a>
              <a className="mini-button red" href={item.pdf_url} target="_blank" rel="noreferrer"><Download size={15} /> Download</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function InteractiveNotesCard({ items = [] }) {
  const toast = useToast();
  const [bookmarked, setBookmarked] = useState({});
  const [pending, setPending] = useState({});

  useEffect(() => {
    setBookmarked(Object.fromEntries(items.map((item) => [item.id, Boolean(item.bookmarked)])));
  }, [items]);

  async function toggleBookmark(item) {
    if (!item.id || pending[item.id]) return;
    const nextValue = !bookmarked[item.id];
    setPending((state) => ({ ...state, [item.id]: true }));
    setBookmarked((state) => ({ ...state, [item.id]: nextValue }));
    try {
      const response = await api(`/notes/${item.id}/bookmark/`, { method: nextValue ? "POST" : "DELETE" });
      setBookmarked((state) => ({ ...state, [item.id]: Boolean(response.bookmarked) }));
      toast?.show(response.message || (response.bookmarked ? "Note bookmarked" : "Bookmark removed"));
    } catch (err) {
      setBookmarked((state) => ({ ...state, [item.id]: !nextValue }));
      toast?.show(err.message || "Unable to update bookmark.", "error");
    } finally {
      setPending((state) => ({ ...state, [item.id]: false }));
    }
  }

  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 0 }}>
      <CardHeader icon={FileText} title="Notes Library" action={<Link className="mini-button" to="/learning">All notes</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty icon={FileText} title="No notes available" message="Your class notes will appear here." action={<Link className="mini-button" to="/learning">Open library</Link>} />}
        {items.map((item) => {
          const pdfUrl = resolveAssetUrl(item.pdf_url);
          const isBookmarked = Boolean(bookmarked[item.id]);
          return (
            <article className="note-resource" key={item.id}>
              <div className="pdf-thumb"><FileText size={28} /><span>PDF</span></div>
              <div>
                <strong>{item.title}</strong>
                <span>{item.subject} Â· {item.chapter}</span>
              </div>
              <div className="card-button-row">
                <button className="mini-button" type="button" disabled={Boolean(pending[item.id])} onClick={() => toggleBookmark(item)}>
                  <Bookmark size={15} /> {isBookmarked ? "Bookmarked" : "Bookmark"}
                </button>
                <a
                  className="mini-button"
                  href={pdfUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (!pdfUrl) {
                      event.preventDefault();
                      toast?.show("No PDF is attached to this note.", "error");
                    }
                  }}
                >
                  <Eye size={15} /> View
                </a>
                <button className="mini-button red" type="button" onClick={() => triggerNoteDownload(item, toast)}><Download size={15} /> Download</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VideosCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 1 }}>
      <CardHeader icon={Clapperboard} title="Lecture Videos" action={<Link className="mini-button" to="/learning">Watch all</Link>} />
      <div className="media-grid">
        {items.length === 0 && <CardEmpty icon={Clapperboard} title="No videos yet" message="New video lessons will appear here." action={<Link className="mini-button" to="/learning">Browse lessons</Link>} />}
        {items.map((item) => (
          <article className="video-resource" key={item.id}>
            <div className="video-thumb" style={youtubeThumb(item.youtube_url) ? { backgroundImage: `url(${youtubeThumb(item.youtube_url)})` } : undefined}>
              <a href={item.youtube_url} target="_blank" rel="noreferrer" aria-label={`Play ${item.title}`}><Play size={18} /></a>
              <span>Video</span>
              <small>12:45</small>
            </div>
            <strong>{item.title}</strong>
            <span>{item.subject} · {item.chapter}</span>
            <a className="mini-button red watch-button" href={item.youtube_url} target="_blank" rel="noreferrer"><Play size={15} /> Watch</a>
          </article>
        ))}
      </div>
    </section>
  );
}

function AssignmentsCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 2 }}>
      <CardHeader icon={Send} title="Assignments" action={<Link className="mini-button" to="/operations">Open</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty icon={Send} title="No assignments" message="Assigned work will appear here." action={<Link className="mini-button" to="/operations">Open tasks</Link>} />}
        {items.map((item) => (
          <article className="assignment-resource" key={item.id}>
            <div>
              <span className="subject-chip">{item.subject}</span>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
            <div className="assignment-meta">
              <span className="due-badge">Due {formatDate(item.deadline)}</span>
              <span className="status-badge">Pending</span>
              <Link className="mini-button red" to="/operations">Submit</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AttendanceCard({ percentage = 0 }) {
  return (
    <section className="student-feature-card attendance-card stagger-card" style={{ "--stagger": 3 }}>
      <CardHeader icon={CalendarCheck} title="Attendance" />
      <div className="attendance-visual">
        <div className="circle-progress" style={{ "--value": Math.max(0, Math.min(percentage, 100)) }}>
          <span><CountValue value={`${percentage || 0}%`} /></span>
        </div>
        <div>
          <strong>Monthly summary</strong>
          <span>{percentage >= 75 ? "On track for this month" : "Needs attention this month"}</span>
          <div className="metric-progress"><span style={{ width: `${Math.max(0, Math.min(percentage, 100))}%` }} /></div>
        </div>
      </div>
    </section>
  );
}

function MarksCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 4 }}>
      <CardHeader icon={Trophy} title="Marks" action={<Link className="mini-button" to="/operations">View all</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty icon={Trophy} title="No marks yet" message="Recent marks will appear here." action={<Link className="mini-button" to="/operations">View records</Link>} />}
        {items.map((item) => (
          <article className="mark-resource" key={item.id}>
            <div>
              <strong>{item.subject}</strong>
              <span>{item.exam_type} · {item.marks_obtained}/{item.max_marks}</span>
            </div>
            <span className="grade-badge">{item.percentage >= 85 ? "A" : item.percentage >= 70 ? "B" : "C"}</span>
            <div className="metric-progress"><span style={{ width: `${Math.max(0, Math.min(item.percentage || 0, 100))}%` }} /></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BlogsCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 6 }}>
      <CardHeader icon={Newspaper} title="Blogs" action={<Link className="mini-button" to="/learning">Read all</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty icon={Newspaper} title="No blogs available" message="New learning articles will appear here." action={<Link className="mini-button" to="/learning">Read all</Link>} />}
        {items.map((item) => (
          <article className="news-resource" key={item.id}>
            <div className="news-thumb"><Newspaper size={22} /></div>
            <div>
              <span className="subject-chip">{item.category}</span>
              <strong>{item.title}</strong>
              <span>{item.content}</span>
            </div>
            <Link className="mini-button" to="/learning">Read More</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function CurrentAffairsCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 7 }}>
      <CardHeader icon={Sparkles} title="Current Affairs" action={<Link className="mini-button" to="/learning">Explore</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty icon={Sparkles} title="No current affairs" message="Latest news cards will appear here." action={<Link className="mini-button" to="/learning">Explore</Link>} />}
        {items.map((item) => (
          <article className="news-resource" key={item.id}>
            <div className={`news-thumb current-affair-thumb ${item.image_url ? "has-image" : ""}`}>
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    event.currentTarget.parentElement?.classList.remove("has-image");
                  }}
                />
              )}
              <Sparkles size={22} />
            </div>
            <div>
              <span className="subject-chip">{item.category}</span>
              <strong>{item.title}</strong>
              <span>{item.summary}</span>
            </div>
            <Link className="mini-button red" to="/learning">Read More</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

const dashboardPremiumStyles = `
.premium-dashboard {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(16px, 2.4vw, 28px);
  border-radius: 28px;
  color: #f8fafc;
  background:
    radial-gradient(circle at 16% 6%, rgba(214,31,58,.24), transparent 30%),
    radial-gradient(circle at 88% 8%, rgba(148,163,184,.12), transparent 28%),
    linear-gradient(145deg, #101216, #171922 48%, #111318);
  animation: dashPageIn 340ms ease both;
}
.premium-dashboard.page-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.premium-dashboard .panel,
.premium-dashboard .stat-card,
.premium-dashboard .student-welcome-card,
.premium-dashboard .student-feature-card,
.premium-dashboard .premium-stat-card,
.premium-dashboard .analytics-card {
  color: #f8fafc;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
  box-shadow: 0 24px 80px rgba(0,0,0,.26), 0 0 46px rgba(214,31,58,.10);
  backdrop-filter: blur(22px);
}
.premium-dashboard .panel:hover,
.premium-dashboard .stat-card:hover,
.premium-dashboard .student-feature-card:hover,
.premium-dashboard .premium-stat-card:hover,
.premium-dashboard .analytics-card:hover {
  transform: translateY(-4px) scale(1.005);
  border-color: rgba(214,31,58,.26);
  box-shadow: 0 34px 90px rgba(0,0,0,.32), 0 0 54px rgba(214,31,58,.16);
}
.premium-dashboard .student-top-row {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, .8fr);
  gap: 18px;
}
.premium-dashboard .student-welcome-card {
  min-height: 340px;
  border-radius: 30px;
  padding: clamp(24px, 4vw, 42px);
  background:
    radial-gradient(circle at 84% 0%, rgba(255,255,255,.16), transparent 30%),
    linear-gradient(135deg, rgba(214,31,58,.96), rgba(77,18,31,.9));
}
.premium-dashboard .student-welcome-card h2 {
  font-size: clamp(38px, 6vw, 66px);
  line-height: .96;
}
.premium-dashboard .student-welcome-card::after {
  content: "Current semester";
  position: absolute;
  right: 28px;
  top: 28px;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255,255,255,.14);
  border: 1px solid rgba(255,255,255,.2);
  color: #ffe4e6;
  font-size: 12px;
  font-weight: 950;
}
.premium-dashboard .student-avatar {
  width: 104px;
  height: 104px;
  border-radius: 28px;
  box-shadow: 0 22px 54px rgba(0,0,0,.22);
}
.premium-dashboard .quick-actions-card {
  border-radius: 30px;
  min-height: 340px;
}
.premium-dashboard .quick-action {
  min-height: 58px;
  border-radius: 18px;
  color: #f8fafc;
  background: rgba(9,11,17,.46);
  border-color: rgba(255,255,255,.10);
}
.premium-dashboard .quick-action:hover {
  color: #ffffff;
  transform: translateX(4px) scale(1.01);
  box-shadow: 0 20px 44px rgba(0,0,0,.24), 0 0 28px rgba(214,31,58,.14);
}
.premium-stat-grid,
.dashboard-analytics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.premium-stat-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.premium-stat-card,
.analytics-card {
  position: relative;
  overflow: hidden;
  border-radius: 26px;
  padding: 20px;
  min-height: 178px;
  animation: dashCardIn 360ms ease both;
  animation-delay: calc(var(--stagger, 0) * 60ms);
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.premium-stat-card::before,
.analytics-card::before {
  content: "";
  position: absolute;
  inset: -40% -20% auto auto;
  width: 170px;
  height: 170px;
  border-radius: 999px;
  background: rgba(214,31,58,.22);
  filter: blur(18px);
}
.premium-stat-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fb7185;
  background: rgba(214,31,58,.14);
}
.premium-stat-card span,
.analytics-card small,
.premium-dashboard .panel span,
.premium-dashboard .student-feature-card span {
  color: #aeb6c4;
}
.premium-stat-card > span {
  display: block;
  margin-top: 18px;
  font-weight: 850;
}
.premium-stat-card strong {
  display: block;
  margin-top: 8px;
  font-size: 34px;
  line-height: 1;
}
.premium-stat-card small {
  display: block;
  margin-top: 8px;
  color: #86efac;
  font-weight: 850;
}
.analytics-card {
  min-height: 290px;
}
.analytics-card header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #ffffff;
  font-weight: 950;
  margin-bottom: 18px;
}
.analytics-card header svg {
  color: #fb7185;
}
.dashboard-ring {
  width: 164px;
  height: 164px;
  margin: 16px auto;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: conic-gradient(#d61f3a calc(var(--value) * 1%), rgba(255,255,255,.12) 0);
  box-shadow: inset 0 0 0 15px #12141a, 0 0 42px rgba(214,31,58,.16);
  animation: dashRingFill 420ms ease both;
}
.dashboard-ring strong {
  font-size: 34px;
  line-height: 1;
}
.dashboard-ring span {
  display: block;
  font-size: 12px;
  font-weight: 850;
}
.marks-bars,
.weekly-activity {
  height: 150px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  gap: 12px;
  padding: 14px;
  border-radius: 22px;
  background: rgba(8,10,15,.36);
  border: 1px solid rgba(255,255,255,.08);
}
.marks-bars i,
.weekly-activity span {
  display: block;
  border-radius: 999px 999px 10px 10px;
  background: linear-gradient(180deg, #fb7185, #d61f3a);
  box-shadow: 0 0 22px rgba(214,31,58,.22);
  animation: dashBars 720ms ease both;
}
.weekly-activity span {
  height: var(--height);
  background: linear-gradient(180deg, #f8fafc, #d61f3a);
}
.course-progress-line {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  margin: 22px 0 10px;
  background: rgba(255,255,255,.12);
}
.course-progress-line span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d61f3a, #fb7185);
  animation: dashProgress 720ms ease both;
}
.premium-dashboard .student-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}
.premium-dashboard .student-feature-card {
  border-radius: 26px;
  min-height: 310px;
}
.premium-dashboard .notice-board {
  border-radius: 28px;
}
.premium-dashboard .notice-item,
.premium-dashboard .note-resource,
.premium-dashboard .assignment-resource,
.premium-dashboard .mark-resource,
.premium-dashboard .news-resource,
.premium-dashboard .video-resource,
.premium-dashboard .accordion-item,
.premium-dashboard .premium-empty {
  color: #e5e7eb;
  background: rgba(9,11,17,.52);
  border-color: rgba(255,255,255,.10);
}
.premium-dashboard strong,
.premium-dashboard h2 {
  color: #ffffff;
}
.premium-dashboard .empty-state {
  color: #aeb6c4;
}
.premium-dashboard .empty-state strong {
  color: #ffffff;
}
.premium-dashboard .mini-button,
.premium-dashboard .secondary,
.premium-dashboard .icon-button {
  background: rgba(255,255,255,.09);
  color: #f8fafc;
  border-color: rgba(255,255,255,.12);
}
.premium-dashboard .mini-button.red,
.premium-dashboard .primary {
  background: linear-gradient(135deg, #d61f3a, #8f1026);
  color: #ffffff;
  border-color: rgba(214,31,58,.42);
}
.premium-dashboard .floating-action {
  box-shadow: 0 24px 54px rgba(214,31,58,.32), 0 0 38px rgba(214,31,58,.24);
}
@keyframes dashPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dashCardIn { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes dashBars { from { transform: scaleY(.25); opacity: .4; } to { transform: scaleY(1); opacity: 1; } }
@keyframes dashProgress { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
@keyframes dashRingFill { from { --value: 0; } }
@media (max-width: 1240px) {
  .premium-stat-grid,
  .premium-dashboard .student-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .premium-dashboard.page-grid,
  .dashboard-analytics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 820px) {
  .premium-dashboard {
    margin: 0;
    padding: 14px;
    border-radius: 20px;
  }
  .premium-dashboard .student-top-row,
  .premium-stat-grid,
  .dashboard-analytics,
  .premium-dashboard .student-card-grid,
  .premium-dashboard.page-grid {
    grid-template-columns: 1fr;
  }
  .premium-dashboard .wide {
    grid-column: span 1;
  }
  .premium-dashboard .student-welcome-card::after {
    position: static;
    width: fit-content;
    margin-top: 12px;
  }
}
.student-premium {
  position: relative;
  isolation: isolate;
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(14px, 2vw, 22px);
  border-radius: 8px;
  color: #f8fafc;
  background:
    linear-gradient(rgba(225, 29, 72, .055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(225, 29, 72, .045) 1px, transparent 1px),
    linear-gradient(135deg, #07070b 0%, #0b0d13 44%, #110810 100%);
  background-size: 72px 72px, 72px 72px, auto;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 28px 90px rgba(0,0,0,.32);
}
.student-premium::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background:
    radial-gradient(ellipse at 45% 0%, rgba(214,31,58,.22), transparent 42%),
    linear-gradient(180deg, rgba(255,255,255,.035), transparent 24%);
  pointer-events: none;
}
.student-premium::after {
  content: "";
  position: absolute;
  inset: 86px 18px auto 18px;
  z-index: -1;
  height: 220px;
  border-radius: 8px;
  background:
    repeating-linear-gradient(104deg, transparent 0 16px, rgba(248,113,113,.08) 17px, transparent 18px),
    linear-gradient(90deg, rgba(214,31,58,.20), transparent 72%);
  opacity: .42;
  transform: perspective(900px) rotateX(58deg);
  transform-origin: top;
  filter: blur(.2px);
  pointer-events: none;
}
.student-premium .student-top-row {
  grid-template-columns: minmax(0, 1.85fr) minmax(280px, .72fr);
  gap: 14px;
  margin-bottom: 14px;
}
.student-premium .panel,
.student-premium .student-welcome-card,
.student-premium .student-feature-card,
.student-premium .premium-stat-card,
.student-premium .analytics-card {
  border-radius: 8px;
  border: 1px solid rgba(244,63,94,.28);
  background:
    linear-gradient(180deg, rgba(25,18,25,.88), rgba(9,10,16,.94)),
    linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,0));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.055),
    inset 0 -1px 0 rgba(244,63,94,.08),
    0 20px 54px rgba(0,0,0,.34),
    0 0 34px rgba(214,31,58,.075);
  backdrop-filter: blur(16px);
  transition: transform 210ms ease, box-shadow 210ms ease, border-color 210ms ease, background 210ms ease;
}
.student-premium .panel:hover,
.student-premium .student-feature-card:hover,
.student-premium .premium-stat-card:hover,
.student-premium .analytics-card:hover {
  transform: translateY(-3px);
  border-color: rgba(244,63,94,.46);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.07),
    0 26px 68px rgba(0,0,0,.42),
    0 0 42px rgba(214,31,58,.12);
}
.student-premium .student-welcome-card {
  min-height: 286px;
  padding: clamp(22px, 3.2vw, 34px);
  overflow: hidden;
  background-image:
    linear-gradient(90deg, rgba(10,9,15,.98) 0%, rgba(42,10,22,.88) 54%, rgba(13,9,14,.94) 100%),
    url("${dashboardHero}");
  background-size: cover;
  background-position: center right;
}
.student-premium .student-welcome-card::before {
  content: "";
  position: absolute;
  inset: auto -8% -44% 32%;
  height: 210px;
  background:
    repeating-linear-gradient(96deg, transparent 0 13px, rgba(244,63,94,.14) 14px, transparent 15px),
    linear-gradient(90deg, transparent, rgba(225,29,72,.24), transparent);
  transform: perspective(780px) rotateX(62deg);
  transform-origin: bottom;
  opacity: .75;
}
.student-premium .student-welcome-card::after {
  content: "Current semester";
  right: 24px;
  top: 24px;
  border-radius: 999px;
  background: rgba(244,63,94,.13);
  border-color: rgba(244,63,94,.24);
  color: #fecdd3;
  letter-spacing: .08em;
}
.student-premium .student-avatar {
  width: 76px;
  height: 76px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.14);
  background: linear-gradient(135deg, #f43f5e, #8f1026);
  box-shadow: 0 18px 42px rgba(214,31,58,.20), inset 0 1px 0 rgba(255,255,255,.18);
}
.student-premium .student-welcome-copy {
  position: relative;
  z-index: 1;
}
.student-premium .student-welcome-copy .eyebrow {
  color: #fb7185;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
}
.student-premium .student-welcome-card h2 {
  max-width: 720px;
  margin-top: 8px;
  font-size: clamp(34px, 4.6vw, 58px);
  line-height: 1;
  letter-spacing: 0;
  text-shadow: 0 18px 42px rgba(0,0,0,.36);
}
.student-premium .student-welcome-card p {
  color: #dbe2ee;
  font-weight: 750;
}
.student-premium .summary-chip-row {
  position: relative;
  z-index: 1;
  margin-top: auto;
}
.student-premium .summary-chip-row span {
  min-height: 36px;
  border-radius: 8px;
  color: #f8fafc;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}
.student-premium .welcome-glow {
  display: none;
}
.student-premium .quick-actions-card {
  min-height: 286px;
  padding: 18px;
}
.student-premium .quick-actions-card h2,
.student-premium .notice-board h2,
.student-premium .student-card-header h2,
.student-premium .analytics-card header span {
  font-size: 16px;
  letter-spacing: 0;
}
.student-premium .quick-action-grid {
  gap: 10px;
}
.student-premium .quick-action {
  min-height: 52px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(190,18,60,.24), rgba(15,23,42,.44));
  border: 1px solid rgba(244,63,94,.20);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
}
.student-premium .quick-action svg:first-child {
  width: 34px;
  height: 34px;
  padding: 8px;
  border-radius: 8px;
  color: #fff;
  background: linear-gradient(135deg, #e11d48, #7f1020);
  box-shadow: 0 10px 24px rgba(225,29,72,.20);
}
.student-premium .quick-action:hover {
  transform: translateX(3px);
  border-color: rgba(244,63,94,.44);
  background: linear-gradient(135deg, rgba(225,29,72,.34), rgba(15,23,42,.56));
}
.student-premium .student-lower-dashboard {
  display: grid;
  gap: 22px;
}
.student-premium .dashboard-section {
  display: grid;
  gap: 14px;
}
.student-premium .dashboard-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
}
.student-premium .dashboard-section-head h2 {
  margin: 0;
  color: #ffffff;
  font-size: clamp(18px, 2vw, 22px);
  letter-spacing: 0;
}
.student-premium .dashboard-section-head p {
  margin: 5px 0 0;
  color: #aeb6c4;
  font-size: 13px;
  line-height: 1.45;
}
.student-premium .premium-stat-grid {
  grid-template-columns: repeat(6, minmax(118px, 1fr));
  gap: 14px;
}
.student-premium .premium-stat-card {
  min-height: 138px;
  padding: 16px;
  display: grid;
  align-content: space-between;
}
.student-premium .premium-stat-card,
.student-premium .analytics-card,
.student-premium .student-feature-card,
.student-premium .student-notice-board {
  border-radius: 10px;
  border-color: rgba(244,63,94,.24);
  background:
    linear-gradient(180deg, rgba(28,20,28,.90), rgba(8,10,16,.96)),
    linear-gradient(135deg, rgba(255,255,255,.055), rgba(244,63,94,.03));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.06),
    0 18px 50px rgba(0,0,0,.32),
    0 0 26px rgba(214,31,58,.06);
}
.student-premium .premium-stat-card:hover,
.student-premium .analytics-card:hover,
.student-premium .student-feature-card:hover,
.student-premium .student-notice-board:hover {
  transform: translateY(-3px);
  border-color: rgba(244,63,94,.40);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.075),
    0 24px 60px rgba(0,0,0,.38),
    0 0 34px rgba(214,31,58,.10);
}
.student-premium .premium-stat-card::before,
.student-premium .analytics-card::before,
.student-premium .student-feature-card::before,
.student-premium .student-notice-board::before {
  width: 130px;
  height: 130px;
  background: linear-gradient(135deg, rgba(244,63,94,.18), transparent 68%);
  filter: blur(14px);
}
.student-premium .premium-stat-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  color: #fecdd3;
  background: rgba(225,29,72,.16);
  border: 1px solid rgba(244,63,94,.18);
}
.student-premium .premium-stat-card > span {
  margin-top: 10px;
  color: #aeb6c4;
  font-size: 12px;
  line-height: 1.25;
}
.student-premium .premium-stat-card strong {
  margin-top: 5px;
  font-size: clamp(24px, 2.2vw, 31px);
  letter-spacing: 0;
  overflow-wrap: anywhere;
}
.student-premium .premium-stat-card small {
  color: #cbd5e1;
  font-size: 11px;
  line-height: 1.3;
}
.student-premium .dashboard-analytics {
  gap: 16px;
}
.student-premium .analytics-card {
  min-height: 252px;
  padding: 18px;
  display: grid;
  align-content: space-between;
}
.student-premium .analytics-card header {
  margin-bottom: 10px;
}
.student-premium .dashboard-ring {
  width: clamp(132px, 12vw, 158px);
  height: clamp(132px, 12vw, 158px);
  margin: 2px auto;
  background:
    radial-gradient(circle, #090a0f 50%, transparent 51%),
    conic-gradient(#f43f5e calc(var(--value) * 1%), rgba(255,255,255,.08) 0);
  box-shadow:
    inset 0 0 0 12px rgba(7,8,13,.94),
    inset 0 0 24px rgba(244,63,94,.22),
    0 18px 42px rgba(0,0,0,.34),
    0 0 40px rgba(225,29,72,.20);
}
.student-premium .dashboard-ring > div {
  display: grid;
  place-items: center;
  gap: 2px;
}
.student-premium .dashboard-ring strong {
  font-size: clamp(30px, 3vw, 38px);
}
.student-premium .dashboard-ring span {
  font-size: 12px;
  color: #aeb6c4;
  font-weight: 850;
}
.student-premium .marks-bars,
.student-premium .weekly-activity {
  height: 134px;
  border-radius: 10px;
  gap: 14px;
  background:
    linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
    rgba(4,7,13,.50);
  background-size: 100% 25%;
  border-color: rgba(255,255,255,.09);
}
.student-premium .chart-bar-wrap,
.student-premium .summary-bar-wrap {
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: end;
  gap: 7px;
  color: #94a3b8;
  font-size: 10px;
  font-style: normal;
  text-align: center;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}
.student-premium .chart-bar-wrap i,
.student-premium .summary-bar-wrap i {
  display: block;
  width: 100%;
  min-height: 10px;
  align-self: end;
  border-radius: 7px 7px 3px 3px;
  background: linear-gradient(180deg, #fb7185, #be123c);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.20), 0 10px 26px rgba(225,29,72,.18);
  animation: dashBars 520ms ease both;
}
.student-premium .chart-bar-wrap em,
.student-premium .summary-bar-wrap em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}
.student-premium .chart-bar-wrap:nth-child(1) i { background: linear-gradient(180deg, #60a5fa, #1d4ed8); }
.student-premium .chart-bar-wrap:nth-child(2) i { background: linear-gradient(180deg, #c084fc, #7e22ce); }
.student-premium .chart-bar-wrap:nth-child(4) i { background: linear-gradient(180deg, #fbbf24, #d97706); }
.student-premium .summary-bar-wrap i {
  height: var(--height);
}
.student-premium .course-progress-line {
  height: 8px;
  background: rgba(255,255,255,.08);
}
.student-premium .student-card-grid {
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-flow: dense;
  gap: 16px;
}
.student-premium .student-feature-card {
  grid-column: span 3;
  min-height: 292px;
  padding: 18px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}
.student-premium .student-card-header {
  margin-bottom: 0;
  min-height: 38px;
  align-items: center;
  gap: 10px;
}
.student-premium .student-card-header > div {
  gap: 9px;
  min-width: 0;
}
.student-premium .student-card-header h2 {
  overflow-wrap: anywhere;
}
.student-premium .student-card-header svg {
  width: 36px;
  height: 36px;
  min-width: 36px;
  padding: 8px;
  border-radius: 8px;
  color: #fecdd3;
  background: rgba(225,29,72,.14);
  border: 1px solid rgba(244,63,94,.18);
}
.student-premium .notice-board {
  border-radius: 8px;
  min-height: 214px;
}
.student-premium .student-notice-board .notice-viewport {
  height: 132px;
}
.student-premium .student-notice-board .notice-item {
  min-height: 132px;
}
.student-premium .student-notice-board .premium-empty {
  min-height: 132px;
}
.student-premium .resource-list,
.student-premium .media-grid,
.student-premium .accordion-list {
  display: grid;
  gap: 10px;
  min-height: 0;
  align-content: start;
}
.student-premium .notice-item,
.student-premium .note-resource,
.student-premium .assignment-resource,
.student-premium .mark-resource,
.student-premium .news-resource,
.student-premium .video-resource,
.student-premium .accordion-item,
.student-premium .premium-empty {
  border-radius: 8px;
  background: rgba(6,8,14,.56);
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
}
.student-premium .note-resource,
.student-premium .assignment-resource,
.student-premium .mark-resource,
.student-premium .news-resource,
.student-premium .video-resource {
  padding: 12px;
  transition: transform 210ms ease, border-color 210ms ease, background 210ms ease, box-shadow 210ms ease;
}
.student-premium .note-resource,
.student-premium .news-resource {
  grid-template-columns: 46px minmax(0, 1fr);
}
.student-premium .assignment-resource,
.student-premium .mark-resource {
  gap: 10px;
}
.student-premium .assignment-resource > div:first-child,
.student-premium .mark-resource > div,
.student-premium .note-resource > div,
.student-premium .news-resource > div {
  min-width: 0;
}
.student-premium .note-resource strong,
.student-premium .assignment-resource strong,
.student-premium .mark-resource strong,
.student-premium .news-resource strong,
.student-premium .video-resource strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.student-premium .assignment-resource span:not(.subject-chip):not(.due-badge):not(.status-badge),
.student-premium .news-resource span:not(.subject-chip),
.student-premium .note-resource span,
.student-premium .video-resource > span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.student-premium .pdf-thumb,
.student-premium .news-thumb {
  width: 46px;
  height: 46px;
}
.student-premium .video-thumb {
  min-height: 116px;
}
.student-premium .card-button-row {
  gap: 7px;
}
.student-premium .assignment-meta {
  justify-items: end;
  align-self: stretch;
}
.student-premium .note-resource:hover,
.student-premium .assignment-resource:hover,
.student-premium .mark-resource:hover,
.student-premium .news-resource:hover,
.student-premium .video-resource:hover,
.student-premium .accordion-item:hover {
  transform: translateY(-2px);
  border-color: rgba(244,63,94,.28);
  background: rgba(22,13,20,.72);
}
.student-premium .mini-button {
  min-height: 34px;
  padding: 0 11px;
  border-radius: 8px;
  background: rgba(255,255,255,.065);
  border-color: rgba(255,255,255,.10);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
}
.student-premium .mini-button.red,
.student-premium .primary {
  background: linear-gradient(135deg, #e11d48, #881337);
  border-color: rgba(244,63,94,.38);
  box-shadow: 0 12px 28px rgba(225,29,72,.18);
}
.student-premium .subject-chip,
.student-premium .notice-badge,
.student-premium .due-badge,
.student-premium .status-badge,
.student-premium .grade-badge {
  border-radius: 999px;
  min-height: 24px;
  padding: 0 9px;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}
.student-premium .video-thumb,
.student-premium .news-thumb,
.student-premium .pdf-thumb,
.student-premium .empty-illustration {
  border-radius: 8px;
}
.student-premium .premium-empty {
  min-height: 198px;
  padding: 18px;
  align-content: center;
  gap: 9px;
  color: #aeb6c4;
  text-align: center;
}
.student-premium .empty-illustration {
  width: 48px;
  height: 48px;
  margin: 0 auto;
  color: #fecdd3;
  background: rgba(225,29,72,.14);
  border: 1px solid rgba(244,63,94,.18);
}
.student-premium .current-affair-thumb {
  position: relative;
  overflow: hidden;
}
.student-premium .current-affair-thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.student-premium .current-affair-thumb::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(8,7,12,.18), rgba(136,19,55,.34));
  opacity: 0;
}
.student-premium .current-affair-thumb.has-image::after {
  opacity: 1;
}
.student-premium .current-affair-thumb svg {
  position: relative;
  z-index: 1;
}
.student-premium .current-affair-thumb.has-image svg {
  opacity: 0;
}
.student-premium .floating-action {
  background: linear-gradient(135deg, #e11d48, #7f1020);
  box-shadow: 0 20px 46px rgba(225,29,72,.30), 0 0 28px rgba(244,63,94,.18);
}
@media (max-width: 1280px) {
  .student-premium .premium-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .student-premium .student-feature-card {
    grid-column: span 4;
  }
}
@media (max-width: 980px) {
  .student-premium .student-top-row,
  .student-premium .dashboard-analytics {
    grid-template-columns: 1fr;
  }
  .student-premium .premium-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .student-premium .student-feature-card {
    grid-column: span 6;
  }
}
@media (max-width: 640px) {
  .student-premium {
    margin: 0;
    padding: 12px;
    border-radius: 8px;
  }
  .student-premium .premium-stat-grid,
  .student-premium .student-card-grid {
    grid-template-columns: 1fr;
  }
  .student-premium .student-lower-dashboard {
    gap: 14px;
  }
  .student-premium .student-feature-card {
    grid-column: span 1;
    min-height: 0;
  }
  .student-premium .note-resource,
  .student-premium .news-resource,
  .student-premium .assignment-resource,
  .student-premium .mark-resource {
    grid-template-columns: 1fr;
  }
  .student-premium .assignment-meta {
    justify-items: start;
  }
  .student-premium .student-welcome-card {
    min-height: 300px;
    background-position: center;
  }
  .student-premium .student-welcome-card h2 {
    font-size: clamp(32px, 12vw, 44px);
  }
  .student-premium .summary-chip-row {
    display: grid;
  }
}
html[data-theme="light"] .premium-dashboard {
  color: #172033;
  background:
    radial-gradient(circle at 16% 6%, rgba(214,31,58,.10), transparent 30%),
    radial-gradient(circle at 88% 8%, rgba(37,99,235,.08), transparent 28%),
    linear-gradient(145deg, #f8fafc, #ffffff 48%, #f7f9fc);
  border: 1px solid rgba(203,213,225,.78);
  box-shadow: 0 24px 70px rgba(15,23,42,.08);
}
html[data-theme="light"] .premium-dashboard .panel,
html[data-theme="light"] .premium-dashboard .stat-card,
html[data-theme="light"] .premium-dashboard .student-feature-card,
html[data-theme="light"] .premium-dashboard .premium-stat-card,
html[data-theme="light"] .premium-dashboard .analytics-card,
html[data-theme="light"] .premium-dashboard .student-notice-board {
  color: #172033;
  border-color: rgba(203,213,225,.82);
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
  box-shadow: 0 20px 58px rgba(15,23,42,.09), 0 0 38px rgba(214,31,58,.05);
}
html[data-theme="light"] .premium-dashboard .panel:hover,
html[data-theme="light"] .premium-dashboard .stat-card:hover,
html[data-theme="light"] .premium-dashboard .student-feature-card:hover,
html[data-theme="light"] .premium-dashboard .premium-stat-card:hover,
html[data-theme="light"] .premium-dashboard .analytics-card:hover,
html[data-theme="light"] .premium-dashboard .student-notice-board:hover {
  border-color: rgba(214,31,58,.24);
  box-shadow: 0 28px 68px rgba(15,23,42,.13), 0 0 42px rgba(214,31,58,.08);
}
html[data-theme="light"] .premium-dashboard strong,
html[data-theme="light"] .premium-dashboard h2,
html[data-theme="light"] .premium-dashboard .analytics-card header,
html[data-theme="light"] .premium-dashboard .student-card-header h2 { color: #172033; }
html[data-theme="light"] .premium-dashboard .premium-stat-card span,
html[data-theme="light"] .premium-dashboard .analytics-card small,
html[data-theme="light"] .premium-dashboard .panel span,
html[data-theme="light"] .premium-dashboard .student-feature-card span,
html[data-theme="light"] .premium-dashboard .empty-state,
html[data-theme="light"] .premium-dashboard .dashboard-section-head p { color: #64748b; }
html[data-theme="light"] .premium-dashboard .quick-actions-card { color: #172033; background: linear-gradient(145deg, #ffffff, #f8fafc); }
html[data-theme="light"] .premium-dashboard .quick-action {
  color: #334155;
  background: #ffffff;
  border-color: rgba(203,213,225,.86);
  box-shadow: 0 10px 24px rgba(15,23,42,.05);
}
html[data-theme="light"] .premium-dashboard .quick-action:hover { color: #9d1430; background: #fff7f8; box-shadow: 0 18px 38px rgba(15,23,42,.09); }
html[data-theme="light"] .premium-dashboard .dashboard-ring {
  background: conic-gradient(#d61f3a calc(var(--value) * 1%), #e2e8f0 0);
  box-shadow: inset 0 0 0 15px #ffffff, 0 16px 38px rgba(15,23,42,.10);
}
html[data-theme="light"] .premium-dashboard .marks-bars,
html[data-theme="light"] .premium-dashboard .weekly-activity { background: #f1f5f9; border-color: rgba(203,213,225,.76); }
html[data-theme="light"] .premium-dashboard .course-progress-line { background: #e2e8f0; }
html[data-theme="light"] .premium-dashboard .notice-item,
html[data-theme="light"] .premium-dashboard .note-resource,
html[data-theme="light"] .premium-dashboard .assignment-resource,
html[data-theme="light"] .premium-dashboard .mark-resource,
html[data-theme="light"] .premium-dashboard .news-resource,
html[data-theme="light"] .premium-dashboard .video-resource,
html[data-theme="light"] .premium-dashboard .accordion-item,
html[data-theme="light"] .premium-dashboard .premium-empty {
  color: #334155;
  background: #f8fafc;
  border-color: rgba(203,213,225,.76);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
}
html[data-theme="light"] .premium-dashboard .notice-item:hover,
html[data-theme="light"] .premium-dashboard .note-resource:hover,
html[data-theme="light"] .premium-dashboard .assignment-resource:hover,
html[data-theme="light"] .premium-dashboard .mark-resource:hover,
html[data-theme="light"] .premium-dashboard .news-resource:hover,
html[data-theme="light"] .premium-dashboard .video-resource:hover,
html[data-theme="light"] .premium-dashboard .accordion-item:hover { background: #fff7f8; border-color: rgba(214,31,58,.24); }
html[data-theme="light"] .premium-dashboard .mini-button,
html[data-theme="light"] .premium-dashboard .secondary,
html[data-theme="light"] .premium-dashboard .icon-button { color: #334155; background: #ffffff; border-color: rgba(203,213,225,.9); }

html[data-theme="light"] .student-premium {
  color: #172033;
  background:
    linear-gradient(rgba(225,29,72,.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(225,29,72,.03) 1px, transparent 1px),
    linear-gradient(135deg, #f8fafc 0%, #ffffff 48%, #fff7f8 100%);
  background-size: 72px 72px, 72px 72px, auto;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 28px 80px rgba(15,23,42,.09);
}
html[data-theme="light"] .student-premium::before {
  background: radial-gradient(ellipse at 45% 0%, rgba(214,31,58,.10), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.46), transparent 24%);
}
html[data-theme="light"] .student-premium .student-welcome-card {
  color: #ffffff;
  border-color: rgba(244,63,94,.30);
  background-image:
    linear-gradient(90deg, rgba(10,9,15,.98) 0%, rgba(87,16,35,.88) 54%, rgba(22,12,20,.90) 100%),
    url("${dashboardHero}");
  box-shadow: 0 22px 58px rgba(74,13,31,.23);
}
html[data-theme="light"] .student-premium .student-welcome-card h2,
html[data-theme="light"] .student-premium .student-welcome-card strong { color: #ffffff; }
html[data-theme="light"] .student-premium .student-welcome-card p { color: #e2e8f0; }
html[data-theme="light"] .student-premium .student-welcome-copy .eyebrow { color: #fecdd3; }
html[data-theme="light"] .student-premium .summary-chip-row span { color: #ffffff; background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.16); }
html[data-theme="light"] .student-premium .premium-stat-card,
html[data-theme="light"] .student-premium .analytics-card,
html[data-theme="light"] .student-premium .student-feature-card,
html[data-theme="light"] .student-premium .student-notice-board,
html[data-theme="light"] .student-premium .quick-actions-card {
  color: #172033;
  border-color: rgba(203,213,225,.82);
  background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.94), 0 18px 48px rgba(15,23,42,.09), 0 0 24px rgba(214,31,58,.04);
}
html[data-theme="light"] .student-premium .premium-stat-card:hover,
html[data-theme="light"] .student-premium .analytics-card:hover,
html[data-theme="light"] .student-premium .student-feature-card:hover,
html[data-theme="light"] .student-premium .student-notice-board:hover { border-color: rgba(214,31,58,.24); box-shadow: 0 24px 58px rgba(15,23,42,.13); }
html[data-theme="light"] .student-premium .premium-stat-card small { color: #64748b; }
html[data-theme="light"] .student-premium .dashboard-ring {
  background: radial-gradient(circle, #ffffff 50%, transparent 51%), conic-gradient(#f43f5e calc(var(--value) * 1%), #e2e8f0 0);
  box-shadow: inset 0 0 0 12px #ffffff, inset 0 0 20px rgba(244,63,94,.12), 0 18px 38px rgba(15,23,42,.10);
}
html[data-theme="light"] .student-premium .marks-bars,
html[data-theme="light"] .student-premium .weekly-activity {
  background: linear-gradient(rgba(148,163,184,.13) 1px, transparent 1px), #f8fafc;
  background-size: 100% 25%;
  border-color: rgba(203,213,225,.76);
}
html[data-theme="light"] .student-premium .chart-bar-wrap,
html[data-theme="light"] .student-premium .summary-bar-wrap { color: #64748b; }
html[data-theme="light"] .student-premium .notice-item,
html[data-theme="light"] .student-premium .note-resource,
html[data-theme="light"] .student-premium .assignment-resource,
html[data-theme="light"] .student-premium .mark-resource,
html[data-theme="light"] .student-premium .news-resource,
html[data-theme="light"] .student-premium .video-resource,
html[data-theme="light"] .student-premium .accordion-item,
html[data-theme="light"] .student-premium .premium-empty { color: #334155; background: #ffffff; border-color: rgba(203,213,225,.78); }
html[data-theme="light"] .student-premium .note-resource:hover,
html[data-theme="light"] .student-premium .assignment-resource:hover,
html[data-theme="light"] .student-premium .mark-resource:hover,
html[data-theme="light"] .student-premium .news-resource:hover,
html[data-theme="light"] .student-premium .video-resource:hover,
html[data-theme="light"] .student-premium .accordion-item:hover { background: #fff7f8; border-color: rgba(214,31,58,.24); }
html[data-theme="light"] .student-premium .mini-button { color: #334155; background: #f8fafc; border-color: rgba(203,213,225,.86); }
html[data-theme="light"] .student-premium .premium-empty { color: #64748b; }

@media (prefers-reduced-motion: reduce) {
  .premium-dashboard *,
  .premium-dashboard *::before,
  .premium-dashboard *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  .premium-dashboard .floating-action,
  .premium-dashboard .welcome-glow {
    animation: none !important;
  }
}
`;
