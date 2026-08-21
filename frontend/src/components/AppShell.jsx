import { Bell, Bot, BookOpen, CalendarCheck, ClipboardList, CreditCard, FileText, Gauge, GraduationCap, KeyRound, LogOut, Megaphone, MessageCircle, Newspaper, PanelLeftClose, PanelLeftOpen, Target, Trash2, Trophy, UsersRound, X, Menu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "./AuthProvider.jsx";

const links = [
  { to: "/", label: "Dashboard", icon: Gauge, roles: ["super_admin", "teacher", "student"] },
  { to: "/directory", label: "People", icon: UsersRound, roles: ["super_admin", "teacher"] },
  { to: "/learning", label: "Learning", icon: BookOpen, roles: ["super_admin", "teacher", "student"] },
  { to: "/operations", label: "Operations", icon: ClipboardList, roles: ["super_admin", "teacher", "student"] },
  { to: "/practice-progress", label: "Practice", icon: Target, roles: ["super_admin", "teacher", "student"] },
  { to: "/ai-tutor", label: "AI Tutor", icon: Bot, roles: ["student"] },
];

export function AppShell() {
  const { user, profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const visibleLinks = links.filter((link) => link.roles.includes(user.role));

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function closeNavigation() {
    setOpen(false);
  }

  function signOut() {
    closeNavigation();
    logout();
    navigate("/login", { replace: true });
  }
  return (
    <div className={`app-shell ${open ? "nav-open" : ""} ${collapsed ? "nav-collapsed" : ""}`}>
      <div className="nav-backdrop" aria-hidden="true" onClick={closeNavigation} />
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-head">
          <div className="brand">
            <div className="brand-mark">
              <span className="redhero-logo" aria-hidden="true" />
            </div>
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
              <NavLink key={link.to} to={link.to} end={link.to === "/"} onClick={closeNavigation}>
                <Icon size={20} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-actions">
          {user.role === "student" && (
            <button className="logout" onClick={() => { closeNavigation(); navigate("/contact-us"); }}>
              <MessageCircle size={18} />
              <span>Contact Us</span>
            </button>
          )}
          <button className="logout" onClick={() => { closeNavigation(); navigate("/change-password"); }}>
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
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.read).length;

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api("/notifications/");
      setItems((data.results || []).map(mapNotification));
    } catch {
      setItems((current) => current);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const poll = window.setInterval(loadNotifications, 45000);
    function refreshOnFocus() {
      if (!document.hidden) loadNotifications();
    }
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [loadNotifications, user.id]);

  useEffect(() => {
    if (open) loadNotifications();
  }, [loadNotifications, open]);

  async function markAllRead() {
    const previous = items;
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    try {
      await api("/notifications/mark-all-read/", { method: "POST" });
    } catch {
      setItems(previous);
    }
  }

  async function remove(id) {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await api(`/notifications/${id}/`, { method: "DELETE" });
    } catch {
      setItems(previous);
    }
  }

  async function openNotification(item) {
    if (!item.read) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      try {
        await api(`/notifications/${item.id}/read/`, { method: "POST" });
      } catch {
        loadNotifications();
      }
    }
    if (item.target_url) {
      setOpen(false);
      navigate(item.target_url);
    }
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
                      <article
                        className={`notification-item ${item.read ? "read" : "unread"}`}
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNotification(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") openNotification(item);
                        }}
                      >
                        <div className={`notification-icon ${item.tone}`}><Icon size={17} /></div>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.message}</span>
                          <em>{item.time}</em>
                        </div>
                        <button
                          aria-label={`Delete ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            remove(item.id);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
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

const notificationIcons = {
  assignment: ClipboardList,
  attendance: CalendarCheck,
  blog: Newspaper,
  current_affairs: Newspaper,
  fee: CreditCard,
  learning: FileText,
  marks: Trophy,
  notice: Megaphone,
  timetable: CalendarCheck,
  video: FileText,
  note: FileText,
  bell: Bell,
  key: KeyRound,
};

function mapNotification(item) {
  return {
    id: item.id,
    title: item.title,
    message: item.message,
    target_url: item.target_url,
    tone: item.tone || "red",
    icon: notificationIcons[item.icon] || notificationIcons[item.type] || Bell,
    read: Boolean(item.read ?? item.is_read),
    group: groupNotification(item.created_at),
    time: timeAgo(item.created_at),
  };
}

function groupNotification(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Older";
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startToday.getDate() - 1);
  if (date >= startToday) return "Today";
  if (date >= startYesterday) return "Yesterday";
  return "Older";
}

function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
