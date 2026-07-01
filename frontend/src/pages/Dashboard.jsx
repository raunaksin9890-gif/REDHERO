import { ArrowRight, BarChart3, Bookmark, BookOpen, CalendarCheck, ChartNoAxesCombined, Clapperboard, Clock3, Download, Eye, FileText, GraduationCap, Layers3, Megaphone, Newspaper, Play, Send, Sparkles, Trophy, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { EmptyState, SkeletonGrid } from "../components/UX.jsx";

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

  if (error) return <div className="panel error-state">{error}</div>;
  if (!data) return <SkeletonGrid count={6} />;

  if (user.role === "super_admin") {
    return (
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
    return (
      <div className="premium-dashboard teacher-dashboard page-grid">
        <style>{dashboardPremiumStyles}</style>
        <NoticeList notices={data.recent_notices} />
        <Stat index={0} icon={UsersRound} label="Assigned Students" value={data.students} trend="Your classes" />
        <Stat index={1} icon={BookOpen} label="Assigned Classes" value={data.assigned_classes?.join(", ") || "-"} trend="Current access" />
      </div>
    );
  }

  return (
    <div className="student-dashboard premium-dashboard student-premium">
      <style>{dashboardPremiumStyles}</style>
      <section className="student-top-row">
        <WelcomeCard profile={data.profile} attendance={data.attendance_percentage} assignments={studentExtra.assignments} notes={studentExtra.notes} />
        <QuickActions />
      </section>
      <PremiumStats data={data} extras={studentExtra} />
      <StudentAnalytics data={data} extras={studentExtra} />
      <NoticeList notices={data.latest_notices} featured />
      <section className="student-card-grid">
        <AttendanceCard percentage={data.attendance_percentage} />
        <MarksCard items={data.marks || []} />
        <AssignmentsCard items={studentExtra.assignments.slice(0, 4)} />
        <TimetablePanel items={studentExtra.timetables} />
        <NotesCard items={studentExtra.notes.slice(0, 3)} />
        <VideosCard items={data.recent_videos || []} />
        <BlogsCard items={studentExtra.blogs.slice(0, 3)} />
        <CurrentAffairsCard items={data.current_affairs || []} />
      </section>
      <Link className="floating-action" to="/learning" data-tooltip="Open learning library">
        <BookOpen size={20} />
      </Link>
    </div>
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
  return (
    <section className="dashboard-analytics">
      <article className="analytics-card attendance-analytics-card">
        <header><CalendarCheck size={20} /><span>Attendance Ring</span></header>
        <div className="dashboard-ring" style={{ "--value": attendance }}>
          <strong><CountValue value={`${attendance}%`} /></strong>
          <span>Attendance</span>
        </div>
      </article>
      <article className="analytics-card marks-graph-card">
        <header><BarChart3 size={20} /><span>Marks Graph</span></header>
        <div className="marks-bars">
          {(marks.length ? marks.slice(0, 5) : [{ percentage: 0 }, { percentage: 0 }, { percentage: 0 }]).map((item, index) => (
            <i key={`${item.id || "mark"}-${index}`} style={{ height: `${Math.max(12, Math.min(Number(item.percentage || averageMarks || 0), 100))}%` }} />
          ))}
        </div>
        <small>Average {averageMarks}%</small>
      </article>
      <article className="analytics-card activity-card">
        <header><Layers3 size={20} /><span>Academic Summary</span></header>
        <div className="weekly-activity">
          <span style={{ "--height": "58%" }} />
          <span style={{ "--height": "72%" }} />
          <span style={{ "--height": "48%" }} />
          <span style={{ "--height": "86%" }} />
          <span style={{ "--height": "64%" }} />
        </div>
        <div className="course-progress-line"><span style={{ width: `${progress}%` }} /></div>
        <small>{progress}% course activity</small>
      </article>
    </section>
  );
}

function CountValue({ value }) {
  const numeric = typeof value === "number" ? value : Number(String(value).replace("%", ""));
  const suffix = String(value).endsWith("%") ? "%" : "";
  const [display, setDisplay] = useState(Number.isFinite(numeric) ? 0 : value);

  useEffect(() => {
    if (!Number.isFinite(numeric)) {
      setDisplay(value);
      return;
    }
    const duration = 850;
    const start = performance.now();
    let frame;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(numeric * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [numeric, value]);

  return <>{display}{suffix}</>;
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
        {notices.length === 0 && <EmptyState title="No notices yet" message="Published notices will appear here." />}
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
        {periods.length === 0 && <EmptyState title="No timetable" message="Timetable entries will appear here." />}
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

function CardEmpty({ title, message }) {
  return (
    <div className="premium-empty">
      <div className="empty-illustration"><Sparkles size={24} /></div>
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

function NotesCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 0 }}>
      <CardHeader icon={FileText} title="Notes Library" action={<Link className="mini-button" to="/learning">All notes</Link>} />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty title="No notes yet" message="Class notes and PDFs will appear here." />}
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

function VideosCard({ items = [] }) {
  return (
    <section className="student-feature-card stagger-card" style={{ "--stagger": 1 }}>
      <CardHeader icon={Clapperboard} title="Lecture Videos" action={<Link className="mini-button" to="/learning">Watch all</Link>} />
      <div className="media-grid">
        {items.length === 0 && <CardEmpty title="No videos yet" message="New lessons will appear here." />}
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
        {items.length === 0 && <CardEmpty title="No assignments" message="Assigned work will appear here." />}
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
      <CardHeader icon={Trophy} title="Marks" />
      <div className="resource-list">
        {items.length === 0 && <CardEmpty title="No marks yet" message="Recent marks will appear here." />}
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
        {items.length === 0 && <CardEmpty title="No blogs yet" message="Helpful articles will appear here." />}
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
        {items.length === 0 && <CardEmpty title="No current affairs" message="Latest news cards will appear here." />}
        {items.map((item) => (
          <article className="news-resource" key={item.id}>
            <div className="news-thumb"><Sparkles size={22} /></div>
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
  transform: translateY(-6px) scale(1.01);
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
`;
