import { Bell, Bot, BookOpen, CalendarCheck, ClipboardList, CreditCard, FileText, Gauge, GraduationCap, KeyRound, LogOut, Megaphone, Newspaper, PanelLeftClose, PanelLeftOpen, Trash2, Trophy, UsersRound, X, Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";

const links = [
  { to: "/", label: "Dashboard", icon: Gauge, roles: ["super_admin", "teacher", "student"] },
  { to: "/directory", label: "People", icon: UsersRound, roles: ["super_admin", "teacher"] },
  { to: "/learning", label: "Learning", icon: BookOpen, roles: ["super_admin", "teacher", "student"] },
  { to: "/operations", label: "Operations", icon: ClipboardList, roles: ["super_admin", "teacher", "student"] },
  { to: "/ai-tutor", label: "AI Tutor", icon: Bot, roles: ["student"] },
];

export function AppShell() {
  const { user, profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const visibleLinks = links.filter((link) => link.roles.includes(user.role));
  function signOut() {
    logout();
    navigate("/login", { replace: true });
  }
  return (
    <div className={`app-shell ${open ? "nav-open" : ""} ${collapsed ? "nav-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-head">
          <div className="brand">
            <div className="brand-mark">R</div>
            <div className="brand-copy">
              <strong>RedHero</strong>
              <span>Learning Portal</span>
            </div>
          </div>
          <button className="collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav>
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink key={link.to} to={link.to} end={link.to === "/"}>
                <Icon size={20} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-actions">
          <button className="logout" onClick={() => navigate("/change-password")}>
            <KeyRound size={18} />
            <span>Change password</span>
          </button>
          <button className="logout" onClick={signOut}>
          <LogOut size={18} />
          <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button className="menu-button" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen((value) => !value)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <p>{user.role.replace("_", " ").toUpperCase()}</p>
            <h1>{profile?.name || user.name}</h1>
          </div>
          <div className="topbar-actions">
            <NotificationCenter user={user} />
            <div className="identity">
              <GraduationCap size={20} />
              <span>{profile?.student_id || profile?.teacher_id || "Admin Console"}</span>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function NotificationCenter({ user }) {
  const seed = useMemo(() => notificationSeed(user.role), [user.role]);
  const [items, setItems] = useState(seed);
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.read).length;

  function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  }

  function remove(id) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const groups = [
    ["Today", items.filter((item) => item.group === "Today")],
    ["Yesterday", items.filter((item) => item.group === "Yesterday")],
    ["Older", items.filter((item) => item.group === "Older")],
  ];

  return (
    <div className="notification-center">
      <button className="notification-bell" aria-label="Open notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-tooltip="Notifications">
        <Bell size={20} />
        {unread > 0 && <span>{unread}</span>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Notifications">
          <header>
            <div>
              <strong>Notifications</strong>
              <span>{unread} unread updates</span>
            </div>
            <button onClick={markAllRead}>Mark all read</button>
          </header>
          <div className="notification-list">
            {groups.map(([label, groupItems]) => (
              groupItems.length > 0 && (
                <div className="notification-group" key={label}>
                  <small>{label}</small>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <article className={`notification-item ${item.read ? "read" : "unread"}`} key={item.id}>
                        <div className={`notification-icon ${item.tone}`}><Icon size={17} /></div>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.message}</span>
                          <em>{item.time}</em>
                        </div>
                        <button aria-label={`Delete ${item.title}`} onClick={() => remove(item.id)}><Trash2 size={15} /></button>
                      </article>
                    );
                  })}
                </div>
              )
            ))}
            {items.length === 0 && <div className="notification-empty">All caught up.</div>}
          </div>
        </section>
      )}
    </div>
  );
}

function notificationSeed(role) {
  const common = [
    { id: "notice-1", group: "Today", title: "Notice", message: "New announcement posted on the notice board.", time: "Now", icon: Megaphone, tone: "red", read: false },
    { id: "learning-1", group: "Today", title: "Learning Content", message: "Fresh notes and videos are available in Learning.", time: "15 min ago", icon: FileText, tone: "blue", read: false },
    { id: "blog-1", group: "Yesterday", title: "Blog", message: "A new study article is ready to read.", time: "Yesterday", icon: Newspaper, tone: "green", read: true },
    { id: "current-1", group: "Older", title: "Current Affairs", message: "Weekly current affairs digest has been published.", time: "2 days ago", icon: Newspaper, tone: "violet", read: true },
  ];
  if (role === "student") {
    return [
      { id: "assignment-1", group: "Today", title: "Assignment", message: "A pending assignment needs your attention.", time: "5 min ago", icon: ClipboardList, tone: "red", read: false },
      { id: "attendance-1", group: "Today", title: "Attendance", message: "Attendance summary updated for this month.", time: "1 hr ago", icon: CalendarCheck, tone: "green", read: false },
      { id: "marks-1", group: "Yesterday", title: "Marks", message: "Recent assessment marks are available.", time: "Yesterday", icon: Trophy, tone: "blue", read: true },
      { id: "fee-1", group: "Older", title: "Fee", message: "Fee structure is available in Operations.", time: "3 days ago", icon: CreditCard, tone: "amber", read: true },
      ...common,
    ];
  }
  return [
    { id: "assignment-admin-1", group: "Today", title: "Assignment", message: "Assignment workflow is ready for updates.", time: "10 min ago", icon: ClipboardList, tone: "red", read: false },
    { id: "marks-admin-1", group: "Yesterday", title: "Marks", message: "Marks records were recently updated.", time: "Yesterday", icon: Trophy, tone: "blue", read: true },
    ...common,
  ];
}
