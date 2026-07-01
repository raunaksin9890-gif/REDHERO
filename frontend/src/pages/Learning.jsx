import { ArrowRight, BookOpen, Clock3, Download, Eye, FileText, GraduationCap, Layers3, Megaphone, Newspaper, Pencil, PlayCircle, PlaySquare, Save, Send, Sparkles, Trash2, TrendingUp, UploadCloud, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { ConfirmDialog, EmptyState, LoadingOverlay, useToast } from "../components/UX.jsx";

const endpoints = [
  { key: "notes", title: "Notes Library", icon: FileText, path: "/notes/" },
  { key: "videos", title: "Lecture Videos", icon: PlaySquare, path: "/videos/" },
  { key: "notices", title: "Notice Board", icon: Megaphone, path: "/notices/" },
  { key: "blogs", title: "Blogs", icon: Newspaper, path: "/blogs/" },
  { key: "currentAffairs", title: "Current Affairs", icon: Newspaper, path: "/current-affairs/" },
];

export function Learning() {
  const { user, profile } = useAuth();
  const [data, setData] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      setBusy(true);
      const pairs = await Promise.all(endpoints.map(async (item) => [item.key, (await api(item.path)).results || []]));
      setData(Object.fromEntries(pairs));
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

  const totalItems = endpoints.reduce((sum, section) => sum + (data[section.key] || []).length, 0);
  const learningStats = [
    { label: "Lessons", value: totalItems, icon: Layers3 },
    { label: "Notes", value: (data.notes || []).length, icon: FileText },
    { label: "Videos", value: (data.videos || []).length, icon: PlayCircle },
  ];
  const courseCards = buildCourseCards(data);

  return (
    <div className="learning-hub">
      <style>{learningHubStyles}</style>
      <section className="learning-hero">
        <div>
          <span className="learning-kicker"><Sparkles size={15} /> RedHero Learning</span>
          <h1>Learning Hub</h1>
          <p>Continue notes, lectures, announcements, articles, and current affairs from one polished classroom workspace.</p>
          <div className="recent-lesson">
            <Clock3 size={17} />
            <span>Recently viewed lesson</span>
            <strong>{firstAvailableTitle(data) || "Algebra Basics"}</strong>
          </div>
        </div>
        <div className="learning-stat-grid">
          {learningStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article className="learning-stat" key={stat.label}>
                <Icon size={20} />
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </article>
            );
          })}
        </div>
      </section>

      <section className="course-grid" aria-label="Learning courses">
        {courseCards.map((course, index) => {
          const Icon = course.icon;
          return (
            <article className="course-card" key={course.title} style={{ "--course-accent": course.accent, "--stagger": index }}>
              <div className="course-thumb">
                <Icon size={30} />
                <span>{course.tag}</span>
              </div>
              <div className="course-copy">
                <span>{course.meta}</span>
                <h2>{course.title}</h2>
                <p>{course.description}</p>
              </div>
              <div className="course-progress" aria-label={`${course.progress}% complete`}>
                <div className="completion-ring" style={{ "--value": course.progress }}><strong>{course.progress}%</strong></div>
                <a className="continue-button" href="#learning-content"><span>Continue Learning</span><ArrowRight size={16} /></a>
              </div>
            </article>
          );
        })}
      </section>

      <div id="learning-content" className="learning-content-grid">
        {user.role !== "student" && <ContentForm user={user} onSaved={load} setMessage={setMessage} />}
        {endpoints.map((section) => {
          const Icon = section.icon;
          return (
            <section className="panel learning-section" key={section.key}>
              <h2><Icon size={20} /> {section.title}</h2>
              <div className="stack">
                {(data[section.key] || []).map((item) => (
                  <ContentItem key={item.id} section={section} item={item} user={user} onSaved={load} setMessage={setMessage} />
                ))}
                {(data[section.key] || []).length === 0 && <EmptyState title="No items available" message={profile?.class_level ? `Nothing for Class ${profile.class_level} yet.` : "Published learning content will appear here."} />}
              </div>
            </section>
          );
        })}
      </div>
      <LoadingOverlay show={busy} label="Loading learning content" />
      {message && <div className="inline-message">{message}</div>}
    </div>
  );
}

function firstAvailableTitle(data) {
  for (const key of ["videos", "notes", "blogs", "currentAffairs", "notices"]) {
    if (data[key]?.[0]?.title) return data[key][0].title;
  }
  return "";
}

function buildCourseCards(data) {
  return [
    { title: data.notes?.[0]?.title || "Algebra Basics", description: "Structured notes, PDF references, and concept checkpoints for fast revision.", meta: `${data.notes?.length || 0} notes available`, tag: "PDF", progress: Math.min(96, 48 + (data.notes?.length || 0) * 8), icon: GraduationCap, accent: "#ff375f" },
    { title: data.blogs?.[0]?.title || "Historical Figures", description: "Editorial-style learning stories with concise reading flow and context.", meta: `${data.blogs?.length || 0} articles`, tag: "Read", progress: Math.min(92, 42 + (data.blogs?.length || 0) * 10), icon: Newspaper, accent: "#8b5cf6" },
    { title: data.currentAffairs?.[0]?.title || "Mathematics", description: "Current affairs and practice topics arranged for continuous study momentum.", meta: `${data.currentAffairs?.length || 0} updates`, tag: "Digest", progress: Math.min(90, 36 + (data.currentAffairs?.length || 0) * 9), icon: TrendingUp, accent: "#22c55e" },
    { title: data.videos?.[0]?.title || "Lecture Videos", description: "Video lessons with fast resume controls and a polished watch-first layout.", meta: `${data.videos?.length || 0} videos`, tag: "Watch", progress: Math.min(98, 50 + (data.videos?.length || 0) * 7), icon: PlayCircle, accent: "#38bdf8" },
  ];
}

function ContentForm({ user, onSaved, setMessage }) {
  const allowedEndpoints = user.role === "super_admin" ? endpoints : endpoints.filter((item) => ["notes", "videos", "notices"].includes(item.key));
  const [type, setType] = useState(allowedEndpoints[0].key);
  const [form, setForm] = useState({ title: "", class_level: "10", subject: "Mathematics", chapter: "", description: "", url: "", body: "" });
  const [progress, setProgress] = useState(0);
  const toast = useToast();

  async function submit(event) {
    event.preventDefault();
    const bodyByType = {
      notes: { title: form.title, class_level: form.class_level, subject: form.subject, chapter: form.chapter, pdf_url: form.url },
      videos: { title: form.title, class_level: form.class_level, subject: form.subject, chapter: form.chapter, description: form.description, youtube_url: form.url },
      notices: { title: form.title, body: form.body, class_level: form.class_level },
      blogs: { title: form.title, category: "Study Tips", content: form.body, published: true },
      currentAffairs: { title: form.title, summary: form.body, category: "Educational News" },
    };
    const path = endpoints.find((item) => item.key === type).path;
    try {
      setProgress(45);
      await api(path, { method: "POST", body: JSON.stringify(bodyByType[type]) });
      setProgress(100);
      setMessage("Published successfully");
      toast?.show("Published successfully");
      setForm({ title: "", class_level: "10", subject: "Mathematics", chapter: "", description: "", url: "", body: "" });
      onSaved();
      window.setTimeout(() => setProgress(0), 700);
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
      setProgress(0);
    }
  }

  return (
    <section className="panel wide learning-section publish-panel">
      <h2><Send size={20} /> Publish Learning Content</h2>
      <form className="content-form" onSubmit={submit}>
        <select value={type} onChange={(event) => setType(event.target.value)}>{allowedEndpoints.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}</select>
        <input placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        {["notes", "videos", "notices"].includes(type) && <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} />}
        {["notes", "videos"].includes(type) && <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />}
        {["notes", "videos"].includes(type) && <input placeholder="Chapter" value={form.chapter} onChange={(event) => setForm({ ...form, chapter: event.target.value })} />}
        {["notes", "videos"].includes(type) && (
          <label className="upload-drop">
            <UploadCloud size={18} />
            <input placeholder={type === "notes" ? "PDF URL" : "YouTube URL"} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
          </label>
        )}
        {["notices", "blogs", "currentAffairs"].includes(type) && <textarea placeholder="Content" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required />}
        {progress > 0 && <div className="progress"><span style={{ width: `${progress}%` }} /></div>}
        <button className="primary">Publish</button>
      </form>
    </section>
  );
}

function ContentItem({ section, item, user, onSaved, setMessage }) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: item.title || "",
    class_level: item.class_level || "10",
    subject: item.subject || "Mathematics",
    chapter: item.chapter || "",
    description: item.description || "",
    url: item.pdf_url || item.youtube_url || "",
    body: item.body || item.content || item.summary || "",
    category: item.category || "Study Tips",
  });
  const canManage = user.role === "super_admin" || (user.role === "teacher" && ["notes", "videos", "notices"].includes(section.key));
  const toast = useToast();

  function payload() {
    if (section.key === "notes") return { id: item.id, title: draft.title, class_level: draft.class_level, subject: draft.subject, chapter: draft.chapter, pdf_url: draft.url };
    if (section.key === "videos") return { id: item.id, title: draft.title, class_level: draft.class_level, subject: draft.subject, chapter: draft.chapter, description: draft.description, youtube_url: draft.url };
    if (section.key === "notices") return { id: item.id, title: draft.title, body: draft.body, class_level: draft.class_level };
    if (section.key === "blogs") return { id: item.id, title: draft.title, category: draft.category, content: draft.body, published: true };
    return { id: item.id, title: draft.title, summary: draft.body, category: draft.category };
  }

  async function save() {
    try {
      await api(section.path, { method: "PUT", body: JSON.stringify(payload()) });
      setEditing(false);
      setMessage("Updated successfully");
      toast?.show("Updated successfully");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function remove() {
    try {
      await api(`${section.path}?id=${item.id}`, { method: "DELETE" });
      setMessage("Deleted successfully");
      toast?.show("Deleted successfully");
      setConfirmOpen(false);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  if (editing) {
    return (
      <article className="row-item learning-item editing-item">
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        {["notes", "videos", "notices"].includes(section.key) && <input value={draft.class_level} onChange={(event) => setDraft({ ...draft, class_level: event.target.value })} />}
        {["notes", "videos"].includes(section.key) && <input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />}
        {["notes", "videos"].includes(section.key) && <input value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} />}
        {["notes", "videos"].includes(section.key) && <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />}
        {["notices", "blogs", "currentAffairs"].includes(section.key) && <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />}
        <button className="icon-button" title="Save" onClick={save}><Save size={16} /></button>
        <button className="icon-button" title="Cancel" onClick={() => setEditing(false)}><X size={16} /></button>
      </article>
    );
  }

  return (
    <article className={`row-item learning-item ${section.key}-item`}>
      <div className="learning-item-head">
        <div className="item-icon">{section.key === "videos" ? <PlayCircle size={20} /> : section.key === "notes" ? <FileText size={20} /> : section.key === "notices" ? <Megaphone size={20} /> : <BookOpen size={20} />}</div>
        <div>
          <strong>{item.title}</strong>
          <span>{item.subject || item.category || item.class_level} {item.chapter ? `· ${item.chapter}` : ""}</span>
        </div>
      </div>
      {item.body && <span>{item.body}</span>}
      {item.content && <span>{item.content}</span>}
      {item.summary && <span>{item.summary}</span>}
      {item.pdf_url && <iframe className="pdf-preview" src={item.pdf_url} title={`${item.title} preview`} />}
      <div className="quick-actions">
        {item.youtube_url && <a className="secondary link-button" href={item.youtube_url} target="_blank" rel="noreferrer"><Eye size={16} /> Open video</a>}
        {item.pdf_url && <a className="secondary link-button" href={item.pdf_url} target="_blank" rel="noreferrer"><Download size={16} /> Download PDF</a>}
      </div>
      {canManage && (
        <span>
          <button className="icon-button" title="Edit" onClick={() => setEditing(true)}><Pencil size={16} /></button>
          <button className="icon-button" title="Delete" onClick={() => setConfirmOpen(true)}><Trash2 size={16} /></button>
        </span>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${item.title}?`}
        message="This removes the learning item from the library."
        confirmLabel="Delete"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
      />
    </article>
  );
}

const learningHubStyles = `
.learning-hub {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(16px, 2.4vw, 28px);
  border-radius: 28px;
  background:
    radial-gradient(circle at 16% 8%, rgba(214,31,58,.24), transparent 30%),
    radial-gradient(circle at 82% 6%, rgba(56,189,248,.14), transparent 28%),
    linear-gradient(145deg, #111318, #171923 48%, #101217);
  color: #f8fafc;
  animation: learningPageIn 360ms ease both;
}
.learning-hub .learning-hero,
.learning-hub .course-card,
.learning-hub .panel {
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
  box-shadow: 0 24px 80px rgba(0,0,0,.26), 0 0 46px rgba(214,31,58,.10);
  backdrop-filter: blur(22px);
}
.learning-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, .75fr);
  gap: 24px;
  align-items: stretch;
  border-radius: 28px;
  padding: clamp(24px, 4vw, 42px);
  overflow: hidden;
  position: relative;
}
.learning-hero::after {
  content: "";
  position: absolute;
  right: -80px;
  top: -80px;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgba(214,31,58,.28);
  filter: blur(12px);
  animation: learningFloat 5s ease-in-out infinite;
}
.learning-kicker {
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
.learning-hero h1 {
  margin: 18px 0 10px;
  font-size: clamp(38px, 6vw, 72px);
  letter-spacing: 0;
  line-height: .95;
}
.learning-hero p {
  max-width: 760px;
  color: #aeb6c4;
  line-height: 1.7;
  font-size: 17px;
  margin: 0;
}
.recent-lesson {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: #cbd5e1;
}
.recent-lesson strong {
  color: #ffffff;
}
.learning-stat-grid {
  display: grid;
  gap: 12px;
  align-content: center;
  position: relative;
  z-index: 1;
}
.learning-stat {
  min-height: 92px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px 12px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(8,10,15,.38);
  border: 1px solid rgba(255,255,255,.1);
}
.learning-stat svg { color: #fb7185; }
.learning-stat strong { font-size: 28px; }
.learning-stat span { grid-column: 2; color: #9ca3af; font-weight: 800; }
.course-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin: 22px 0;
}
.course-card {
  min-height: 330px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 18px;
  padding: 20px;
  border-radius: 26px;
  position: relative;
  overflow: hidden;
  animation: learningCardIn 380ms ease both;
  animation-delay: calc(var(--stagger, 0) * 70ms);
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.course-card::before {
  content: "";
  position: absolute;
  inset: -30% -20% auto auto;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--course-accent), transparent 55%);
  filter: blur(16px);
}
.course-card:hover {
  transform: translateY(-8px) scale(1.01);
  border-color: color-mix(in srgb, var(--course-accent), white 20%);
  box-shadow: 0 34px 90px rgba(0,0,0,.32), 0 0 54px color-mix(in srgb, var(--course-accent), transparent 72%);
}
.course-thumb {
  min-height: 118px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border-radius: 22px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--course-accent), transparent 62%), rgba(255,255,255,.08)),
    radial-gradient(circle at 20% 10%, rgba(255,255,255,.2), transparent 26%);
  color: #ffffff;
}
.course-thumb span {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.14);
  font-size: 12px;
  font-weight: 900;
}
.course-copy span { color: #aeb6c4; font-weight: 850; font-size: 13px; }
.course-copy h2 { margin: 8px 0; font-size: 24px; letter-spacing: 0; }
.course-copy p { margin: 0; color: #aeb6c4; line-height: 1.55; }
.course-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.completion-ring {
  width: 62px;
  height: 62px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--course-accent) calc(var(--value) * 1%), rgba(255,255,255,.14) 0);
  box-shadow: inset 0 0 0 8px rgba(16,18,24,.95);
}
.completion-ring strong { font-size: 14px; }
.continue-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 999px;
  color: #ffffff;
  background: linear-gradient(135deg, #d61f3a, #7f1d1d);
  box-shadow: 0 16px 34px rgba(214,31,58,.22);
}
.learning-content-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.learning-hub .wide { grid-column: span 2; }
.learning-section {
  border-radius: 24px;
  padding: 22px;
  color: #f8fafc;
}
.learning-section h2 { color: #ffffff; }
.learning-hub input,
.learning-hub select,
.learning-hub textarea {
  color: #f8fafc;
  background: rgba(10,12,18,.58);
  border-color: rgba(255,255,255,.12);
}
.learning-hub input::placeholder,
.learning-hub textarea::placeholder { color: #778195; }
.learning-item {
  border-radius: 20px;
  padding: 16px;
  color: #e5e7eb;
  background: rgba(9,11,17,.52);
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 32px rgba(0,0,0,.16);
}
.learning-item:hover {
  transform: translateY(-4px);
  border-color: rgba(214,31,58,.28);
  box-shadow: 0 22px 48px rgba(0,0,0,.22), 0 0 34px rgba(214,31,58,.12);
}
.learning-item-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.learning-item-head strong { color: #ffffff; font-size: 16px; }
.learning-item span { color: #aeb6c4; }
.item-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #fb7185;
  background: rgba(214,31,58,.14);
}
.learning-hub .secondary,
.learning-hub .icon-button {
  background: rgba(255,255,255,.09);
  color: #f8fafc;
  border-color: rgba(255,255,255,.12);
}
.learning-hub .primary {
  background: linear-gradient(135deg, #d61f3a, #8f1026);
}
.learning-hub .empty-state { color: #aeb6c4; }
.learning-hub .empty-state strong { color: #ffffff; }
@keyframes learningPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes learningCardIn { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes learningFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(12px); } }
@media (max-width: 1180px) {
  .course-grid, .learning-content-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .learning-hub { margin: 0; padding: 14px; border-radius: 20px; }
  .learning-hero, .course-grid, .learning-content-grid { grid-template-columns: 1fr; }
  .learning-hub .wide { grid-column: span 1; }
  .course-card { min-height: 290px; }
}
`;
