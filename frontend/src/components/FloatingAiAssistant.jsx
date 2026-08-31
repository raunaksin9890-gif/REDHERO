import { Bot, LoaderCircle, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useExamAttempt } from "./ExamAttemptContext.jsx";

const LazyAiTutorChat = lazy(() => import("../pages/AiTutor.jsx").then((module) => ({ default: module.AiTutorChat })));

export function FloatingAiAssistant({ user }) {
  const { activeAttemptId } = useExamAttempt();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (activeAttemptId) setOpen(false);
  }, [activeAttemptId]);

  useEffect(() => {
    if (!mounted) return undefined;
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [mounted]);

  if (user?.role !== "student" || activeAttemptId) return null;

  function openDrawer() {
    setMounted(true);
    setOpen(true);
  }

  return (
    <div className="floating-ai-assistant">
      <style>{floatingAiStyles}</style>
      <button
        type="button"
        className="floating-ai-button"
        aria-label={open ? "Close RedHero AI Tutor" : "Ask RedHero AI"}
        aria-expanded={open}
        data-tooltip="Ask RedHero AI"
        onClick={() => (open ? setOpen(false) : openDrawer())}
      >
        <Bot size={23} />
      </button>

      {mounted && (
        <aside className={`floating-ai-drawer ${open ? "open" : ""}`} aria-hidden={!open} aria-label="RedHero AI Tutor">
          <header className="floating-ai-header">
            <div className="floating-ai-title">
              <span className="floating-ai-icon"><Bot size={20} /></span>
              <div>
                <strong>RedHero AI Tutor</strong>
                <small>Ask a study doubt</small>
              </div>
            </div>
            <button type="button" className="floating-ai-close" aria-label="Close RedHero AI Tutor" title="Close" onClick={() => setOpen(false)}>
              <X size={19} />
            </button>
          </header>
          <div className="floating-ai-content">
            <Suspense fallback={<div className="floating-ai-loading"><LoaderCircle size={20} /> Loading AI Tutor</div>}>
              <LazyAiTutorChat showHeader={false} />
            </Suspense>
          </div>
        </aside>
      )}
    </div>
  );
}

const floatingAiStyles = `
.floating-ai-assistant {
  position: relative;
  z-index: 60;
}
.floating-ai-button {
  position: fixed;
  right: 28px;
  bottom: 96px;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 999px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--red), var(--red-dark));
  box-shadow: 0 18px 44px rgba(215,25,32,.28), 0 0 0 5px rgba(215,25,32,.08);
  cursor: pointer;
  animation: floating-ai-pulse 3.8s ease-in-out infinite;
  transition: transform 180ms ease, box-shadow 180ms ease;
}
.floating-ai-button:hover {
  transform: translateY(-3px) scale(1.04);
  box-shadow: 0 22px 52px rgba(215,25,32,.34), 0 0 0 7px rgba(215,25,32,.10);
}
.floating-ai-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(420px, 100vw);
  display: flex;
  flex-direction: column;
  color: var(--ink);
  background: var(--surface-glass-strong);
  border-left: 1px solid var(--theme-border);
  box-shadow: -24px 0 70px rgba(15,23,42,.2);
  transform: translateX(100%);
  visibility: hidden;
  pointer-events: none;
  transition: transform 260ms cubic-bezier(.2,.8,.2,1), visibility 260ms ease;
}
.floating-ai-drawer.open {
  transform: translateX(0);
  visibility: visible;
  pointer-events: auto;
}
.floating-ai-header {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
}
.floating-ai-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.floating-ai-title > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.floating-ai-title strong,
.floating-ai-title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-ai-title strong { font-size: 15px; }
.floating-ai-title small { color: var(--muted); font-size: 12px; }
.floating-ai-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
  color: var(--red);
  background: color-mix(in srgb, var(--red), transparent 88%);
}
.floating-ai-close {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}
.floating-ai-close:hover { color: var(--red); border-color: var(--red); }
.floating-ai-content {
  min-height: 0;
  flex: 1;
  display: flex;
  padding: 16px;
  overflow: hidden;
}
.floating-ai-content .ai-chat-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent !important;
  transform: none;
}
.floating-ai-content .prompt-suggestions {
  max-height: 88px;
  overflow: auto;
}
.floating-ai-content .chat-window { min-height: 0; }
.floating-ai-loading {
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: var(--muted);
  font-weight: 750;
}
.floating-ai-loading svg { animation: spin .8s linear infinite; color: var(--red); }
@keyframes floating-ai-pulse {
  0%, 100% { box-shadow: 0 18px 44px rgba(215,25,32,.28), 0 0 0 5px rgba(215,25,32,.08); }
  50% { box-shadow: 0 20px 48px rgba(215,25,32,.32), 0 0 0 8px rgba(215,25,32,.04); }
}
@media (max-width: 680px) {
  .floating-ai-button { right: 16px; bottom: 82px; width: 52px; height: 52px; }
  .floating-ai-drawer { width: 100vw; }
  .floating-ai-content { padding: 12px; }
  .floating-ai-content .ai-chat-panel .chat-form { grid-template-columns: 1fr 44px; }
  .floating-ai-content .ai-chat-panel .chat-form select { grid-column: 1 / -1; }
}
html[data-theme="dark"] .floating-ai-drawer {
  color: var(--ink);
  background: #0d1726;
  border-left-color: var(--theme-border);
  box-shadow: -24px 0 70px rgba(0,0,0,.34);
}
html[data-theme="dark"] .floating-ai-header { border-bottom-color: var(--theme-border); }
html[data-theme="dark"] .floating-ai-close { color: var(--ink); background: rgba(17,27,43,.88); }
html[data-theme="dark"] .floating-ai-content .ai-chat-panel {
  color: #f8fafc;
}
html[data-theme="light"] .floating-ai-content .ai-chat-panel {
  color: #172033;
}
html[data-theme="light"] .floating-ai-content .ai-chat-panel .prompt-suggestions button {
  color: #334155;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .floating-ai-content .ai-chat-panel .chat-window {
  background: #f1f5f9;
  border-color: rgba(203,213,225,.82);
}
html[data-theme="light"] .floating-ai-content .ai-chat-panel .bubble.assistant {
  color: #172033;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .floating-ai-content .ai-chat-panel input,
html[data-theme="light"] .floating-ai-content .ai-chat-panel select,
html[data-theme="light"] .floating-ai-content .ai-chat-panel textarea {
  color: #172033;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .floating-ai-content .ai-chat-panel input::placeholder,
html[data-theme="light"] .floating-ai-content .ai-chat-panel textarea::placeholder { color: #94a3b8; }
@media (prefers-reduced-motion: reduce) {
  .floating-ai-button,
  .floating-ai-drawer,
  .floating-ai-close { animation: none; transition-duration: 1ms; }
}
`;
