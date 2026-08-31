import { Bell, Bot, BookOpen, CalendarCheck, ClipboardList, CreditCard, FileText, Gauge, GraduationCap, KeyRound, LoaderCircle, LogOut, Megaphone, MessageCircle, Newspaper, PanelLeftClose, PanelLeftOpen, Search, Target, Trash2, Trophy, UsersRound, X, Menu } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "./AuthProvider.jsx";
import { useExamAttempt } from "./ExamAttemptContext.jsx";
import { FloatingAiAssistant } from "./FloatingAiAssistant.jsx";
import { ThemeToggle } from "./ThemeProvider.jsx";

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
  const { activeAttemptId } = useExamAttempt();
  const visibleLinks = links.filter((link) => link.roles.includes(user.role) && !(link.to === "/ai-tutor" && activeAttemptId));

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
          {user.role === "super_admin" && (
            <button className="logout" onClick={() => { closeNavigation(); navigate("/contact-us"); }}>
              <MessageCircle size={18} />
              <span>Contact Messages</span>
            </button>
          )}
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
          <GlobalSearch />
          <div className="topbar-actions">
            <ThemeToggle />
            <NotificationCenter user={user} />
            <div className="identity">
              <GraduationCap size={20} />
              <span>{profile?.student_id || profile?.teacher_id || "Admin Console"}</span>
            </div>
          </div>
        </header>
        <div className="route-transition" key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <FloatingAiAssistant user={user} />
    </div>
  );
}

const globalSearchIcons = {
  student: UsersRound,
  note: BookOpen,
  notice: Megaphone,
  question: ClipboardList,
};

function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api(`/global-search/?q=${encodeURIComponent(needle)}`);
        if (!cancelled) setResults(data.results || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleKeyboard(event) {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (event.key === "/" && !["input", "textarea", "select"].includes(activeTag)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    function handleOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("keydown", handleKeyboard);
    document.addEventListener("pointerdown", handleOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyboard);
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  function chooseResult(result) {
    setOpen(false);
    setQuery("");
    if (result.path) navigate(result.path);
  }

  return (
    <div className="global-search" ref={rootRef}>
      <label className="global-search-field">
        {loading ? <LoaderCircle className="global-search-spinner" size={18} /> : <Search size={18} />}
        <input
          aria-label="Search students, notes, notices and questions"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search students, notes, notices..."
          ref={inputRef}
          value={query}
        />
        <kbd>/</kbd>
      </label>
      {open && (
        <section className="global-search-panel" aria-label="Search results">
          {query.trim().length < 2 && <div className="global-search-hint">Type at least 2 letters to search.</div>}
          {query.trim().length >= 2 && !loading && results.length === 0 && <div className="global-search-hint">No matching result found.</div>}
          {results.map((result) => {
            const Icon = globalSearchIcons[result.type] || Search;
            return (
              <button key={`${result.type}-${result.id}`} onClick={() => chooseResult(result)} type="button">
                <span className={`global-result-icon ${result.type}`}><Icon size={17} /></span>
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </span>
                <em>{result.type}</em>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

function NotificationCenter({ user }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const previousUnread = useRef(null);
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

  useEffect(() => {
    if (previousUnread.current === null) {
      previousUnread.current = unread;
      return undefined;
    }
    if (unread > previousUnread.current) {
      setPulse(false);
      window.requestAnimationFrame(() => setPulse(true));
      const timer = window.setTimeout(() => setPulse(false), 520);
      previousUnread.current = unread;
      return () => window.clearTimeout(timer);
    }
    previousUnread.current = unread;
    return undefined;
  }, [unread]);

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
      <button className={`notification-bell ${pulse ? "notify-pulse" : ""}`} aria-label="Open notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-tooltip="Notifications">
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
  const createdAt = parseNotificationDate(item.created_at);
  return {
    id: item.id,
    title: item.title,
    message: item.message,
    target_url: item.target_url,
    tone: item.tone || "red",
    icon: notificationIcons[item.icon] || notificationIcons[item.type] || Bell,
    read: Boolean(item.read ?? item.is_read),
    group: groupNotification(createdAt),
    time: timeAgo(createdAt),
  };
}

function parseNotificationDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function groupNotification(date) {
  if (!date) return "Older";
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startToday.getDate() - 1);
  if (date >= startToday) return "Today";
  if (date >= startYesterday) return "Yesterday";
  return "Older";
}

function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
