import { BookOpen, Bot, BrainCircuit, FileText, Lightbulb, MessageCircle, PenTool, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { api } from "../api/client.js";

function MarkdownMessage({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        code: ({ inline, className, children, ...props }) =>
          inline ? (
            <code className="inline-code" {...props}>{children}</code>
          ) : (
            <pre className="code-block"><code className={className} {...props}>{children}</code></pre>
          ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function AiTutor() {
  const [subject, setSubject] = useState("Mathematics");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!message.trim()) return;
    const question = message;
    setChat((items) => [...items, { role: "student", content: question }]);
    setMessage("");
    setBusy(true);
    try {
      const result = await api("/ai/chat/", { method: "POST", body: JSON.stringify({ subject, message: question }) });
      setChat((items) => [...items, { role: "assistant", content: result.chat.answer }]);
    } catch (err) {
      setChat((items) => [...items, { role: "assistant", content: err.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ai-tutor-page">
      <style>{aiTutorPremiumStyles}</style>
      <div className="ai-hero">
        <div>
          <span className="ai-kicker"><Sparkles size={15} /> RedHero intelligence</span>
          <h1>AI Tutor</h1>
          <div className="ai-kinetic" aria-hidden="true">
            <span>Explain clearly</span>
            <span>Solve step by step</span>
            <span>Revise faster</span>
          </div>
          <p>Ask Maths, Science, English, or Social Science questions.</p>
        </div>
        <div className="ai-orb-wrap" aria-hidden="true">
          <div className="ai-orb"><Bot size={42} /></div>
        </div>
      </div>

      <div className="ai-layout">
        <aside className="ai-learning-cards" aria-label="AI learning cards">
          <InfoCard icon={MessageCircle} title="Recent conversations" value={chat.length} />
          <InfoCard icon={Lightbulb} title="Suggested learning" value={subject} />
          <InfoCard icon={BookOpen} title="Quick revision" value="Ready" />
          <InfoCard icon={PenTool} title="Practice questions" value="Ask now" />
        </aside>

        <div className="chat-panel ai-chat-panel">
          <header>
            <div className="chat-title-icon"><BrainCircuit size={24} /></div>
            <div>
              <h2>AI Doubt Solver</h2>
              <p>Ask Maths, Science, English, or Social Science questions.</p>
            </div>
          </header>

          <div className="prompt-suggestions">
            {["Explain today's topic", "Solve this problem", "Create notes", "Generate quiz", "Summarize lecture"].map((prompt) => (
              <button key={prompt} type="button" onClick={() => setMessage(prompt)}>{prompt}</button>
            ))}
          </div>

          <div className="chat-window">
            {chat.map((item, index) => (
              <div className={`bubble ${item.role}`} key={`${item.role}-${index}`}>
                {item.role === "assistant" ? <MarkdownMessage content={item.content} /> : item.content}
              </div>
            ))}
            {busy && (
              <div className="bubble assistant typing-bubble">
                <span /><span /><span />
              </div>
            )}
            {chat.length === 0 && <div className="empty ai-empty"><FileText size={22} /> Your class tutor is ready.</div>}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option>Mathematics</option>
              <option>Science</option>
              <option>English</option>
              <option>Social Science</option>
            </select>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type your question" />
            <button className="icon-button" disabled={busy} title="Send"><Send size={18} /></button>
          </form>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ icon: Icon, title, value }) {
  return (
    <article className="ai-info-card">
      <Icon size={20} />
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

const aiTutorPremiumStyles = `
.ai-tutor-page {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(16px, 2.4vw, 28px);
  border-radius: 28px;
  color: #f8fafc;
  background:
    radial-gradient(circle at 16% 6%, rgba(214,31,58,.24), transparent 30%),
    radial-gradient(circle at 88% 8%, rgba(148,163,184,.12), transparent 28%),
    linear-gradient(145deg, #101216, #171922 48%, #111318);
  animation: aiPageIn 340ms ease both;
}
.ai-hero,
.ai-chat-panel,
.ai-info-card {
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
  box-shadow: 0 24px 80px rgba(0,0,0,.26), 0 0 46px rgba(214,31,58,.10);
  backdrop-filter: blur(22px);
}
.ai-hero {
  min-height: 300px;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(240px, .7fr);
  gap: 24px;
  align-items: center;
  border-radius: 30px;
  padding: clamp(24px, 4vw, 42px);
  overflow: hidden;
  position: relative;
  margin-bottom: 22px;
}
.ai-kicker {
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
.ai-hero h1 {
  margin: 18px 0 8px;
  font-size: clamp(44px, 7vw, 82px);
  line-height: .92;
  letter-spacing: 0;
}
.ai-hero p {
  margin: 12px 0 0;
  color: #aeb6c4;
  line-height: 1.7;
  font-size: 17px;
}
.ai-kinetic {
  height: 38px;
  overflow: hidden;
  display: grid;
  align-items: center;
  color: #ffffff;
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 950;
}
.ai-kinetic span {
  grid-area: 1 / 1;
  opacity: 0;
  transform: translateY(22px);
  animation: aiKinetic 5.1s ease-in-out infinite;
}
.ai-kinetic span:nth-child(2) { animation-delay: 1.7s; }
.ai-kinetic span:nth-child(3) { animation-delay: 3.4s; }
.ai-orb-wrap {
  min-height: 220px;
  display: grid;
  place-items: center;
}
.ai-orb {
  width: 180px;
  height: 180px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: #ffffff;
  background:
    radial-gradient(circle at 35% 30%, rgba(255,255,255,.48), transparent 18%),
    radial-gradient(circle at 50% 50%, rgba(214,31,58,.8), rgba(127,29,29,.36) 62%, rgba(255,255,255,.08));
  box-shadow: 0 0 70px rgba(214,31,58,.34), inset 0 0 34px rgba(255,255,255,.18);
  animation: aiOrbFloat 4.8s ease-in-out infinite;
}
.ai-layout {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
}
.ai-learning-cards {
  display: grid;
  gap: 14px;
  align-content: start;
}
.ai-info-card {
  display: grid;
  gap: 10px;
  min-height: 132px;
  border-radius: 24px;
  padding: 18px;
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.ai-info-card:hover,
.ai-chat-panel:hover {
  transform: translateY(-5px) scale(1.005);
  border-color: rgba(214,31,58,.26);
  box-shadow: 0 34px 90px rgba(0,0,0,.32), 0 0 54px rgba(214,31,58,.16);
}
.ai-info-card svg { color: #fb7185; }
.ai-info-card span { color: #aeb6c4; font-weight: 850; }
.ai-info-card strong { color: #ffffff; font-size: 20px; overflow-wrap: anywhere; }
.ai-chat-panel {
  height: min(760px, calc(100vh - 150px));
  border-radius: 28px;
  padding: 20px;
  color: #f8fafc;
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.ai-chat-panel header {
  display: flex;
  align-items: center;
  gap: 14px;
}
.chat-title-icon {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fb7185;
  background: rgba(214,31,58,.14);
}
.ai-chat-panel h2 {
  color: #ffffff;
  margin: 0;
}
.ai-chat-panel p {
  color: #aeb6c4;
}
.prompt-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.prompt-suggestions button {
  min-height: 38px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  padding: 0 13px;
  color: #f8fafc;
  background: rgba(255,255,255,.08);
  cursor: pointer;
  font-weight: 850;
}
.prompt-suggestions button:hover {
  transform: translateY(-2px) scale(1.02);
  background: rgba(214,31,58,.18);
  box-shadow: 0 16px 34px rgba(214,31,58,.14);
}
.ai-chat-panel .chat-window {
  background: rgba(8,10,15,.44);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 24px;
}
.ai-chat-panel .bubble {
  border-radius: 24px;
  animation: aiBubbleIn 240ms ease both;
}
.ai-chat-panel .bubble.student {
  background: linear-gradient(135deg, #d61f3a, #8f1026);
  box-shadow: 0 18px 38px rgba(214,31,58,.18);
}
.ai-chat-panel .bubble.assistant {
  color: #f8fafc;
  background: rgba(255,255,255,.08);
  border-color: rgba(255,255,255,.12);
  box-shadow: 0 18px 38px rgba(0,0,0,.18);
}
.ai-chat-panel .bubble.assistant p,
.ai-chat-panel .bubble.assistant h1,
.ai-chat-panel .bubble.assistant h2,
.ai-chat-panel .bubble.assistant h3,
.ai-chat-panel .bubble.assistant h4 {
  color: #f8fafc;
}
.typing-bubble {
  display: inline-flex;
  gap: 7px;
  width: fit-content;
}
.typing-bubble span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #fb7185;
  animation: aiTyping 900ms ease-in-out infinite;
}
.typing-bubble span:nth-child(2) { animation-delay: 130ms; }
.typing-bubble span:nth-child(3) { animation-delay: 260ms; }
.ai-empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: #aeb6c4;
}
.ai-chat-panel .chat-form {
  grid-template-columns: 200px 1fr 48px;
}
.ai-chat-panel input,
.ai-chat-panel select {
  color: #f8fafc;
  background: rgba(10,12,18,.58);
  border-color: rgba(255,255,255,.12);
}
.ai-chat-panel input::placeholder { color: #778195; }
.ai-chat-panel .icon-button {
  width: 48px;
  min-width: 48px;
  height: 48px;
  border-radius: 18px;
  color: #ffffff;
  background: linear-gradient(135deg, #d61f3a, #8f1026);
  border-color: rgba(214,31,58,.42);
}
@keyframes aiPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes aiBubbleIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes aiOrbFloat { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-12px) scale(1.03); } }
@keyframes aiTyping { 0%, 100% { opacity: .35; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-4px); } }
@keyframes aiKinetic {
  0% { opacity: 0; transform: translateY(22px); filter: blur(5px); }
  12%, 26% { opacity: 1; transform: translateY(0); filter: blur(0); }
  38%, 100% { opacity: 0; transform: translateY(-22px); filter: blur(5px); }
}
@media (max-width: 980px) {
  .ai-hero,
  .ai-layout {
    grid-template-columns: 1fr;
  }
  .ai-learning-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ai-chat-panel {
    height: calc(100vh - 120px);
  }
}
@media (max-width: 680px) {
  .ai-tutor-page {
    margin: 0;
    padding: 14px;
    border-radius: 20px;
  }
  .ai-learning-cards,
  .ai-chat-panel .chat-form {
    grid-template-columns: 1fr;
  }
  .ai-chat-panel {
    height: auto;
    min-height: 680px;
  }
  .ai-chat-panel .chat-window {
    min-height: 360px;
  }
}
`;
