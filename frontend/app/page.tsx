
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { format, subHours, subDays, startOfHour, startOfDay, eachHourOfInterval, eachDayOfInterval, isAfter, isBefore } from "date-fns";

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    // If running locally, this resolves to localhost:8000 or the local IP.
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return `http://${window.location.hostname}:8000`;
    }
  }
  return "http://localhost:8000";
};

// ─── Types ────────────────────────────────────────────────

interface HistoryItem {
  id: string | number;
  original: string;
  translation: string;
  timestamp: string;
  direction: string;
  user_id?: string;
  tokens?: number;
}

interface FeedbackEntry {
  id: string;
  original_word: string;
  flagged_translation: string;
  corrected_translation: string;
  full_original: string;
  full_translation: string;
  direction: string;
  timestamp: string;
  user_id?: string;
}

interface User {
  id: string;
  username: string;
  role: string;
}

// ─── Main App Shell ───────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("authUser");
    if (saved) setUser(JSON.parse(saved));
    setLoading(false);
  }, []);

  const logout = () => {
    setUser(null);
    localStorage.removeItem("authUser");
  };

  if (loading) return null;

  if (!user) {
    return <AuthScreen onLogin={(u) => { setUser(u); localStorage.setItem("authUser", JSON.stringify(u)); }} />;
  }

  if (user.role === "admin") {
    return <AdminDashboard user={user} onLogout={logout} />;
  }

  return <TranslatorApp user={user} onLogout={logout} />;
}

// ─── Auth Screen ──────────────────────────────────────────
function AuthScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const endpoint = isLogin ? "/auth/login" : "/auth/register";
    try {
      const res = await fetch(`${getApiBase()}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error");
      onLogin(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="tb-body tb-auth-container">
      <div className="tb-auth-card">
        <h1 className="tb-brand" style={{ marginBottom: "8px" }}>Translator Buddy</h1>
        <p className="tb-quote" style={{ marginBottom: "24px" }}>{isLogin ? "Welcome back" : "Create an account"}</p>

        {error && <div style={{ color: "red", marginBottom: "16px" }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input className="tb-auth-input" type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <input className="tb-auth-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button className="tb-auth-btn" type="submit">{isLogin ? "LOGIN" : "REGISTER"}</button>
        </form>

        <button className="tb-auth-toggle" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Need an account? Register" : "Already have an account? Login"}
        </button>
      </div>
      <GlobalStyles />
    </div>
  );
}


// ─── Time Range Config ─────────────────────────────────────
type TimeRange = "1H" | "6H" | "24H" | "7D" | "30D";

const TIME_RANGE_OPTIONS: { label: TimeRange; hours: number }[] = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 24 * 7 },
  { label: "30D", hours: 24 * 30 },
];

// ─── Build zero-padded time series ────────────────────────
function buildTimeSeries(hist: HistoryItem[], range: TimeRange) {
  const rangeHours = TIME_RANGE_OPTIONS.find(r => r.label === range)!.hours;
  const now = new Date();
  const start = subHours(now, rangeHours);

  // Zero-pad buckets
  let buckets: { time: string; label: string; apiCalls: number; tokens: number }[] = [];
  if (rangeHours <= 24) {
    // Hourly buckets
    const hours = eachHourOfInterval({ start: startOfHour(start), end: startOfHour(now) });
    buckets = hours.map(h => ({
      time: h.getTime().toString(),
      label: format(h, rangeHours <= 6 ? "HH:mm" : "HH:mm"),
      apiCalls: 0,
      tokens: 0,
    }));
  } else {
    // Daily buckets
    const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(now) });
    buckets = days.map(d => ({
      time: d.getTime().toString(),
      label: format(d, "MMM d"),
      apiCalls: 0,
      tokens: 0,
    }));
  }

  // Fill from history
  hist.forEach(item => {
    const d = new Date(item.timestamp);
    if (isBefore(d, start)) return;
    let bucketTime: number;
    if (rangeHours <= 24) {
      bucketTime = startOfHour(d).getTime();
    } else {
      bucketTime = startOfDay(d).getTime();
    }
    const bucket = buckets.find(b => b.time === bucketTime.toString());
    if (bucket) {
      bucket.apiCalls += 1;
      bucket.tokens += (item.tokens || 0);
    }
  });

  return buckets;
}

// ─── Custom Tooltip ────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
      padding: "10px 14px", color: "#f1f5f9", fontSize: "13px", minWidth: "140px"
    }}>
      <div style={{ color: "#94a3b8", marginBottom: "6px", fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: p.color }} />
            {p.name}
          </span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Analytics Chart Component ─────────────────────────────
function AnalyticsChart({
  history, color = "#3b82f6", title, metric
}: { history: HistoryItem[]; color?: string; title: string; metric: "apiCalls" | "tokens" }) {
  const [range, setRange] = useState<TimeRange>("24H");
  const data = buildTimeSeries(history, range);

  const total = data.reduce((s, d) => s + d[metric], 0);
  const peak = Math.max(...data.map(d => d[metric]));

  const gradId = `grad-${metric}`;

  return (
    <div className="tb-analytics-chart-wrap">
      <div className="tb-analytics-chart-header">
        <div>
          <div className="tb-card-label" style={{ marginBottom: 4 }}>{title}</div>
          <div style={{ display: "flex", gap: "20px" }}>
            <div>
              <span style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{total.toLocaleString()}</span>
              <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: 6 }}>total</span>
            </div>
            <div>
              <span style={{ fontSize: "28px", fontWeight: 800, color: color }}>{peak.toLocaleString()}</span>
              <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: 6 }}>peak</span>
            </div>
          </div>
        </div>
        <div className="tb-time-range-selector">
          {TIME_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.label}
              className={`tb-time-range-btn ${range === opt.label ? "active" : ""}`}
              onClick={() => setRange(opt.label)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: "240px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <RechartTooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey={metric}
              name={metric === "apiCalls" ? "API Calls" : "Tokens"}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Metric Stat Card ──────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="tb-stat-card">
      <div className="tb-card-label">{label}</div>
      <div className="tb-stat-value">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div className="tb-stat-sub">{sub}</div>}
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────
function AdminDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userHistory, setUserHistory] = useState<HistoryItem[]>([]);
  const [userFeedback, setUserFeedback] = useState<FeedbackEntry[]>([]);
  const [allHistory, setAllHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    fetch(`${getApiBase()}/users`)
      .then(res => res.json())
      .then(data => setUsers(data.filter((u: User) => u.role !== "admin")))
      .catch(console.error);

    fetch(`${getApiBase()}/history/all`)
      .then(res => res.json())
      .then(setAllHistory)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedUser) { setUserHistory([]); setUserFeedback([]); return; }
    fetch(`${getApiBase()}/history/${selectedUser.id}`)
      .then(res => res.json()).then(setUserHistory).catch(console.error);
    fetch(`${getApiBase()}/feedback?user_id=${selectedUser.id}`)
      .then(res => res.json()).then(setUserFeedback).catch(console.error);
  }, [selectedUser]);

  const userMetrics = users.map(u => {
    const uHist = allHistory.filter(h => h.user_id === u.id);
    return { ...u, apiCalls: uHist.length, tokens: uHist.reduce((a, h) => a + (h.tokens || 0), 0) };
  });

  const totalTokens = allHistory.reduce((a, h) => a + (h.tokens || 0), 0);

  return (
    <main className="tb-body" style={{ padding: 0, display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Appbar — same style as translator */}
      <div className="tb-appbar" style={{ borderRadius: 0, margin: 0, flexShrink: 0 }}>
        <div className="tb-header-left">
          <h1 className="tb-brand">Translator Buddy</h1>
          <span className="tb-quote">Admin Dashboard</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", color: "#546e7a", fontWeight: 600 }}>Admin</span>
          <button onClick={onLogout} className="tb-btn tb-btn-ghost" style={{ padding: "8px 18px" }}>Logout</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar — uses tb-card style */}
        <div style={{ width: "230px", background: "#ffffff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", color: "#78909c", textTransform: "uppercase" }}>Navigation</div>
          <div
            className={`tb-nav-item ${selectedUser === null ? "active" : ""}`}
            onClick={() => setSelectedUser(null)}
          >
            <span style={{ marginRight: 8 }}></span> Overview
          </div>
          <div style={{ padding: "16px 16px 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", color: "#78909c", textTransform: "uppercase", marginTop: 8 }}>Users</div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {userMetrics.map(u => (
              <div
                key={u.id}
                className={`tb-nav-item ${selectedUser?.id === u.id ? "active" : ""}`}
                onClick={() => setSelectedUser(u)}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{u.username}</span>
                  <span style={{ fontSize: "10px", color: selectedUser?.id === u.id ? "rgba(255,255,255,0.65)" : "#94a3b8" }}>
                    {u.apiCalls} calls · {u.tokens} tkns
                  </span>
                </div>
              </div>
            ))}
            {users.length === 0 && <div style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "13px" }}>No users yet</div>}
          </div>
        </div>

        {/* Main content — same #eceff1 background as translator body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: "#eceff1" }}>
          {selectedUser === null ? (
            // ── Overview ──
            <>
              <div style={{ marginBottom: "20px" }}>
                <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#263238" }}>Global Overview</h1>
                <p style={{ margin: "4px 0 0", color: "#78909c", fontSize: "13px" }}>All users · All time</p>
              </div>

              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
                <StatCard label="Total API Calls" value={allHistory.length} sub="across all users" />
                <StatCard label="Total Tokens" value={totalTokens} sub="consumed" />
                <StatCard label="Active Users" value={userMetrics.filter(u => u.apiCalls > 0).length} sub={`of ${users.length} registered`} />
              </div>

              {/* Charts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                <div className="tb-chart-card">
                  <AnalyticsChart history={allHistory} color="#6366f1" title="API Calls" metric="apiCalls" />
                </div>
                <div className="tb-chart-card">
                  <AnalyticsChart history={allHistory} color="#10b981" title="Token Usage" metric="tokens" />
                </div>
              </div>
            </>
          ) : (
            // ── Per-User View ──
            <>
              <div style={{ marginBottom: "20px" }}>
                <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#263238" }}>{selectedUser.username}</h1>
                <p style={{ margin: "4px 0 0", color: "#78909c", fontSize: "13px" }}>User activity dashboard</p>
              </div>

              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
                <StatCard label="Total API Calls" value={userHistory.length} sub="translations made" />
                <StatCard label="Total Tokens" value={userHistory.reduce((a, h) => a + (h.tokens || 0), 0)} sub="consumed" />
                <StatCard label="Corrections" value={userFeedback.length} sub="human reviews" />
              </div>

              {/* Charts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", marginBottom: "20px" }}>
                <div className="tb-chart-card">
                  <AnalyticsChart history={userHistory} color="#3b82f6" title="API Calls" metric="apiCalls" />
                </div>
                <div className="tb-chart-card">
                  <AnalyticsChart history={userHistory} color="#f59e0b" title="Token Usage" metric="tokens" />
                </div>
              </div>

              {/* History & Corrections */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="tb-card tb-col tb-history-card">
                  <div className="tb-card-label tb-history-label"><span>Translation History</span></div>
                  <div className="tb-history-list" style={{ maxHeight: 360 }}>
                    {userHistory.length === 0 ? <p className="tb-empty">No history.</p> : (
                      userHistory.slice().reverse().map(item => (
                        <div key={item.id} className="tb-history-item">
                          <div className="tb-history-badge">{item.direction}</div>
                          <p className="tb-history-original">{item.original}</p>
                          <p className="tb-history-translation">{item.translation}</p>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span className="tb-history-time">{new Date(item.timestamp).toLocaleString()}</span>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>{item.tokens || 0} tkns</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="tb-card tb-col tb-history-card">
                  <div className="tb-card-label tb-history-label"><span>Human Corrections</span></div>
                  <div className="tb-history-list" style={{ maxHeight: 360 }}>
                    {userFeedback.length === 0 ? <p className="tb-empty">No corrections.</p> : (
                      userFeedback.slice().reverse().map(fb => (
                        <div key={fb.id} className="tb-review-item">
                          <div className="tb-review-top"><div className="tb-review-direction">{fb.direction}</div></div>
                          <div className="tb-review-correction">
                            <span className="tb-review-wrong">{fb.flagged_translation}</span>
                            <span className="tb-review-arrow">→</span>
                            <span className="tb-review-right">{fb.corrected_translation}</span>
                          </div>
                          <span className="tb-review-time">{new Date(fb.timestamp).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <GlobalStyles />
    </main>
  );
}

// ─── Translator Component ─────────────────────────────────
function TranslatorApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState("en-ur");
  const [contextMsg, setContextMsg] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Feedback state
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"history" | "reviews">("history");
  const [flaggedWord, setFlaggedWord] = useState<string | null>(null);
  const [flaggedIndex, setFlaggedIndex] = useState<number | null>(null);
  const [correctionInput, setCorrectionInput] = useState("");
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHistory();
    fetchFeedback();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    if (flaggedWord !== null) {
      document.addEventListener("mousedown", handler);
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [flaggedWord]);

  useEffect(() => {
    if (feedbackToast) {
      const t = setTimeout(() => setFeedbackToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [feedbackToast]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${getApiBase()}/history/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.reverse()); // most recent first
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFeedback = async () => {
    try {
      const res = await fetch(`${getApiBase()}/feedback?user_id=${user.id}`);
      if (res.ok) {
        const data: FeedbackEntry[] = await res.json();
        setFeedbackList(data);
      }
    } catch (err) {
      console.error("Failed to load feedback:", err);
    }
  };

  const submitFeedback = async (word: string, correction: string) => {
    setFeedbackSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_word: getSourceWordForFlagged(word),
          flagged_translation: word,
          corrected_translation: correction,
          full_original: inputText,
          full_translation: outputText,
          direction: direction,
          user_id: user.id
        }),
      });
      if (res.ok) {
        setFeedbackToast(`Saved: "${word}" → "${correction}"`);
        await fetchFeedback();
      }
    } catch (err) {
      console.error("Failed to save feedback:", err);
    }
    setFeedbackSaving(false);
  };

  const deleteFeedback = async (id: string) => {
    try {
      const res = await fetch(`${getApiBase()}/feedback/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFeedbackList((prev) => prev.filter((f) => f.id !== id));
        setFeedbackToast("Feedback deleted");
      }
    } catch (err) {
      console.error("Failed to delete feedback:", err);
    }
  };

  const getSourceWordForFlagged = (word: string): string => {
    return word;
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    closePopover();

    const recentHistory = history.slice(0, 3).reverse().flatMap((item) => [
      { role: "user", content: item.original },
      { role: "assistant", content: item.translation },
    ]);

    try {
      const res = await fetch(`${getApiBase()}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          direction: direction,
          context: contextMsg,
          history: recentHistory,
          user_id: user.id
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Server error");

      setOutputText(data.translation);

      // Save to history backend
      const historyRes = await fetch(`${getApiBase()}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: String(Date.now()),
          user_id: user.id,
          original: data.original,
          translation: data.translation,
          direction: direction,
          tokens: data.tokens || 0,
          timestamp: new Date().toISOString()
        })
      });

      if (historyRes.ok) {
        const savedHistory = await historyRes.json();
        setHistory([savedHistory, ...history]);
      }

    } catch (error) {
      console.error(error);
      setOutputText("Error connecting to translation server. Is the backend running?");
    }
    setLoading(false);
  };

  const handleWordClick = (word: string, index: number, event: React.MouseEvent) => {
    const target = event.currentTarget as HTMLElement;
    const container = outputRef.current;
    if (!container) return;

    const wordRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setFlaggedWord(word);
    setFlaggedIndex(index);
    setCorrectionInput("");
    setPopoverPos({
      top: wordRect.bottom - containerRect.top + container.scrollTop + 6,
      left: wordRect.left - containerRect.left + wordRect.width / 2,
    });
  };

  const closePopover = () => {
    setFlaggedWord(null);
    setFlaggedIndex(null);
    setCorrectionInput("");
    setPopoverPos(null);
  };

  const handleFlagSubmit = async () => {
    if (!flaggedWord || !correctionInput.trim()) return;
    await submitFeedback(flaggedWord, correctionInput.trim());
    closePopover();
  };

  const copyOutput = () => {
    if (!outputText) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(outputText);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = outputText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const isFlaggedWord = (word: string): boolean => {
    return feedbackList.some((f) => f.flagged_translation === word && f.direction === direction);
  };

  const getCorrectionFor = (word: string): string | undefined => {
    const entry = feedbackList.find((f) => f.flagged_translation === word && f.direction === direction);
    return entry?.corrected_translation;
  };

  const isUrduInput = direction === "ur-en";
  const isUrduOutput = direction === "en-ur";
  const outputWords = outputText ? outputText.split(/(\s+)/) : [];

  return (
    <main className="tb-body">
      <div className="tb-wrap">

        <div className="tb-appbar">
          <div className="tb-header-left">
            <h1 className="tb-brand">Translator Buddy</h1>
            <span className="tb-quote">لفظوں کا سفر، دلوں تک</span>
          </div>
          <div className="tb-header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Image
              src="/joun-elia.png"
              alt="Jaun Elia"
              width={170}
              height={170}
              className="tb-portrait-img"
              style={{ width: "120px", height: "auto" }}
              priority
            />
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>{user.username}</div>
              <button onClick={onLogout} className="tb-btn tb-btn-ghost" style={{ padding: '6px 16px', fontSize: '12px' }}>Logout</button>
            </div>
          </div>
        </div>

        {/* Control Bar: Direction and Context */}
        <div className="tb-controls tb-card">
          <div className="tb-control-group">
            <label className="tb-card-label">Direction</label>
            <div className="tb-toggle-group">
              <button
                className={`tb-toggle-btn ${direction === "en-ur" ? "active" : ""}`}
                onClick={() => setDirection("en-ur")}
              >
                English to Urdu
              </button>
              <button
                className={`tb-toggle-btn ${direction === "ur-en" ? "active" : ""}`}
                onClick={() => setDirection("ur-en")}
              >
                Urdu to English
              </button>
            </div>
          </div>

          <div className="tb-control-group flex-1">
            <label className="tb-card-label">Context / Tone (Optional)</label>
            <input
              type="text"
              className="tb-context-input"
              placeholder="e.g., Gritty realism, poetic, formal, simple..."
              value={contextMsg}
              onChange={(e) => setContextMsg(e.target.value)}
            />
          </div>
        </div>

        <div className="tb-grid">
          {/* ─── Input Panel ─── */}
          <div className="tb-card tb-col">
            <div className="tb-card-label">{isUrduInput ? "Urdu Input" : "English Input"}</div>
            <textarea
              className="tb-textarea"
              dir={isUrduInput ? "rtl" : "ltr"}
              placeholder={isUrduInput ? "یہاں متن درج کریں..." : "Enter text to translate..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="tb-row-between">
              <span className="tb-charcount">{inputText.length} {isUrduInput ? "حروف" : "chars"}</span>
              <button
                onClick={handleTranslate}
                disabled={loading || !inputText}
                className="tb-btn"
              >
                {loading ? "TRANSLATING…" : "TRANSLATE"}
              </button>
            </div>
          </div>

          {/* ─── Output Panel ─── */}
          <div className="tb-card tb-col">
            <div className="tb-card-label tb-output-label">
              <span>{isUrduInput ? "English Output" : "Urdu Output"}</span>
              {outputText && (
                <span className="tb-flag-hint">
                  <span className="tb-flag-icon">🏳️</span> Click any word to flag &amp; correct
                </span>
              )}
            </div>
            <div
              ref={outputRef}
              dir={isUrduOutput ? "rtl" : "ltr"}
              className="tb-output tb-output-interactive"
            >
              {outputText ? (
                <span className="tb-word-container">
                  {outputWords.map((token, i) => {
                    if (/^\s+$/.test(token)) {
                      return <span key={i}>{token}</span>;
                    }
                    const flagged = isFlaggedWord(token);
                    const correction = getCorrectionFor(token);
                    return (
                      <span
                        key={i}
                        className={`tb-word ${flagged ? "tb-word-flagged" : ""} ${flaggedIndex === i ? "tb-word-active" : ""}`}
                        onClick={(e) => handleWordClick(token, i, e)}
                        title={flagged ? `Corrected: ${correction}` : "Click to flag this word"}
                      >
                        {token}
                        {flagged && <span className="tb-word-badge">✓</span>}
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span className="tb-placeholder">
                  {isUrduInput ? "Translation will appear here." : "ترجمہ یہاں ظاہر ہوگا۔"}
                </span>
              )}

              {/* Inline correction popover */}
              {flaggedWord !== null && popoverPos && (
                <div
                  ref={popoverRef}
                  className="tb-popover"
                  style={{ top: popoverPos.top, left: popoverPos.left }}
                >
                  <div className="tb-popover-arrow" />
                  <div className="tb-popover-header">
                    <span className="tb-popover-label">Flagged:</span>
                    <span className="tb-popover-word">{flaggedWord}</span>
                  </div>
                  <input
                    type="text"
                    className="tb-popover-input"
                    dir={isUrduOutput ? "rtl" : "ltr"}
                    placeholder="Type correct translation…"
                    value={correctionInput}
                    onChange={(e) => setCorrectionInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFlagSubmit()}
                    autoFocus
                  />
                  <div className="tb-popover-actions">
                    <button className="tb-popover-cancel" onClick={closePopover}>Cancel</button>
                    <button
                      className="tb-popover-save"
                      onClick={handleFlagSubmit}
                      disabled={feedbackSaving || !correctionInput.trim()}
                    >
                      {feedbackSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="tb-row-between">
              <span className="tb-charcount">{outputText.length} {isUrduOutput ? "حروف" : "chars"}</span>
              <button onClick={copyOutput} disabled={!outputText} className="tb-btn tb-btn-ghost">
                COPY
              </button>
            </div>
          </div>

          {/* ─── History / Reviews Panel ─── */}
          <div className="tb-card tb-col tb-history-card">
            {/* Tab switcher */}
            <div className="tb-tab-bar">
              <button
                className={`tb-tab ${activeTab === "history" ? "tb-tab-active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                History
              </button>
              <button
                className={`tb-tab ${activeTab === "reviews" ? "tb-tab-active" : ""}`}
                onClick={() => setActiveTab("reviews")}
              >
                Human Reviews
                {feedbackList.length > 0 && (
                  <span className="tb-tab-badge">{feedbackList.length}</span>
                )}
              </button>
            </div>

            {/* ── History Tab ── */}
            {activeTab === "history" && (
              <>
                <div className="tb-card-label tb-history-label">
                  <span>Recent Translations</span>
                </div>
                <div className="tb-history-list">
                  {history.length === 0 ? (
                    <p className="tb-empty">Nothing translated yet.</p>
                  ) : (
                    history.map((item) => {
                      const isItemUrduIn = item.direction === "ur-en";
                      return (
                        <div
                          key={item.id}
                          className="tb-history-item"
                          onClick={() => { setInputText(item.original); setOutputText(item.translation); setDirection(item.direction || "en-ur"); }}
                        >
                          <div className="tb-history-badge">{isItemUrduIn ? "UR→EN" : "EN→UR"}</div>
                          <p dir={isItemUrduIn ? "rtl" : "ltr"} className="tb-history-original">{item.original}</p>
                          <p dir={isItemUrduIn ? "ltr" : "rtl"} className="tb-history-translation">{item.translation}</p>
                          <span className="tb-history-time">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {/* ── Human Reviews Tab ── */}
            {activeTab === "reviews" && (
              <>
                <div className="tb-card-label tb-history-label">
                  <span>Correction Memory</span>
                  <span className="tb-review-subtitle">Fed to model as context</span>
                </div>
                <div className="tb-history-list">
                  {feedbackList.length === 0 ? (
                    <div className="tb-empty-state">
                      <div className="tb-empty-icon">🏳️</div>
                      <p className="tb-empty">No corrections yet.</p>
                      <p className="tb-empty-sub">Click any word in the translation output to flag and correct it.</p>
                    </div>
                  ) : (
                    feedbackList.slice().reverse().map((fb) => (
                      <div key={fb.id} className="tb-review-item">
                        <div className="tb-review-top">
                          <div className="tb-review-direction">
                            {fb.direction === "en-ur" ? "EN→UR" : "UR→EN"}
                          </div>
                          <button
                            className="tb-review-delete"
                            onClick={() => deleteFeedback(fb.id)}
                            title="Delete this correction"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="tb-review-correction">
                          <span className="tb-review-wrong">{fb.flagged_translation}</span>
                          <span className="tb-review-arrow">→</span>
                          <span className="tb-review-right">{fb.corrected_translation}</span>
                        </div>
                        {fb.full_original && (
                          <p className="tb-review-context" title={fb.full_original}>
                            Source: {fb.full_original.length > 60 ? fb.full_original.slice(0, 60) + "…" : fb.full_original}
                          </p>
                        )}
                        <span className="tb-review-time">
                          {new Date(fb.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="tb-footer">
          <span>&copy; {new Date().getFullYear()} Translator Buddy</span>
        </div>
      </div>

      {feedbackToast && (
        <div className="tb-toast">
          <span className="tb-toast-icon">✓</span>
          {feedbackToast}
        </div>
      )}

      <GlobalStyles />
    </main>
  );
}

// ─── Global Styles Component ──────────────────────────────
function GlobalStyles() {
  return (
    <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap');

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }

        .tb-body {
          min-height: 100vh;
          width: 100%;
          background: #eceff1;
          font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', Arial, sans-serif;
          color: #263238;
          padding: 20px 32px 50px;
        }

        .tb-wrap { width: 100%; margin: 0 auto; }

        .tb-appbar {
          background: #ffffff;
          color: #000000;
          padding: 24px 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.12);
        }
        
        .tb-header-left { display: flex; flex-direction: column; gap: 4px; }
        .tb-brand { font-size: 42px; font-weight: 800; letter-spacing: -0.5px; margin: 0; font-family: inherit; }
        .tb-quote { font-size: 22px; color: #546e7a; margin-top: 4px; }
        .tb-portrait-img { border-radius: 8px; object-fit: contain; display: block; }

        .tb-card {
          background: #ffffff;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
          padding: 24px;
        }

        .tb-controls { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 20px; padding: 16px 24px; align-items: center; }
        .tb-control-group { display: flex; flex-direction: column; gap: 8px; }
        .flex-1 { flex: 1; min-width: 250px; }

        .tb-toggle-group { display: flex; background: #f1f5f9; border-radius: 6px; padding: 4px; }
        .tb-toggle-btn {
          flex: 1; padding: 8px 16px; border: none; background: transparent; color: #64748b;
          font-size: 13px; font-weight: 600; border-radius: 4px; cursor: pointer; transition: all 0.2s ease;
        }
        .tb-toggle-btn.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .tb-context-input {
          width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px;
          font-size: 14px; outline: none; color: #334155; transition: border-color 0.2s ease; font-family: inherit;
        }
        .tb-context-input:focus { border-color: #000000; }

        .tb-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; width: 100%; }
        @media (max-width: 980px) { .tb-grid { grid-template-columns: 1fr 1fr; } .tb-history-card { grid-column: span 2; } }
        @media (max-width: 640px) { .tb-grid { grid-template-columns: 1fr; } .tb-history-card { grid-column: span 1; } .tb-appbar { flex-direction: column; text-align: center; gap: 16px; } }

        .tb-col { display: flex; flex-direction: column; }
        .tb-card-label { font-size: 13px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: #78909c; margin-bottom: 8px; }

        .tb-textarea {
          width: 100%; height: 260px; padding: 16px; border: none; border-bottom: 2px solid #cfd8dc;
          background: #f8fafc; border-radius: 6px 6px 0 0; font-size: 17px; font-family: inherit;
          resize: none; outline: none; color: #263238; transition: border-color 0.15s ease, background 0.15s ease; line-height: 1.6;
        }
        .tb-textarea[dir="rtl"] { font-size: 20px; line-height: 1.8; }
        .tb-textarea:focus { border-bottom-color: #000000; background: #ffffff; }

        .tb-output {
          height: 260px; overflow-y: auto; padding: 16px; background: #f8fafc; border-radius: 6px;
          font-size: 17px; line-height: 1.6; color: #263238; position: relative;
        }
        .tb-output[dir="rtl"] { font-size: 22px; line-height: 1.8; }
        .tb-output-interactive { cursor: default; }
        .tb-output-label { display: flex; justify-content: space-between; align-items: center; }
        .tb-flag-hint { font-size: 11px; font-weight: 400; color: #94a3b8; display: flex; align-items: center; gap: 4px; animation: tb-pulse 2s ease-in-out infinite; }
        .tb-flag-icon { font-size: 13px; }
        @keyframes tb-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

        .tb-word-container { display: inline; }
        .tb-word { cursor: pointer; border-radius: 3px; padding: 1px 2px; margin: 0 1px; transition: all 0.15s ease; position: relative; display: inline; }
        .tb-word:hover { background: rgba(59, 130, 246, 0.08); box-shadow: 0 2px 0 0 #3b82f6; }
        .tb-word-flagged { background: rgba(34, 197, 94, 0.08); box-shadow: 0 2px 0 0 #22c55e; }
        .tb-word-flagged:hover { background: rgba(34, 197, 94, 0.15); box-shadow: 0 2px 0 0 #16a34a; }
        .tb-word-active { background: rgba(59, 130, 246, 0.15) !important; box-shadow: 0 2px 0 0 #2563eb !important; }
        .tb-word-badge { font-size: 9px; color: #22c55e; position: absolute; top: -6px; right: -6px; font-weight: bold; }
        .tb-placeholder { color: #b0bec5; font-size: 16px; }

        .tb-popover {
          position: absolute; z-index: 100; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08); padding: 14px 16px; min-width: 260px;
          transform: translateX(-50%); animation: tb-pop-in 0.15s ease-out;
        }
        @keyframes tb-pop-in { from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.96); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
        .tb-popover-arrow { position: absolute; top: -6px; left: 50%; transform: translateX(-50%) rotate(45deg); width: 12px; height: 12px; background: #ffffff; border-left: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0; }
        .tb-popover-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .tb-popover-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #ef4444; }
        .tb-popover-word { font-size: 16px; font-weight: 700; color: #0f172a; background: #fef2f2; padding: 2px 8px; border-radius: 4px; border: 1px solid #fecaca; }
        .tb-popover-input { width: 100%; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 15px; outline: none; color: #0f172a; font-family: inherit; transition: border-color 0.15s ease; }
        .tb-popover-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        .tb-popover-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
        .tb-popover-cancel { padding: 6px 14px; border: 1px solid #e2e8f0; border-radius: 6px; background: #ffffff; color: #64748b; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
        .tb-popover-cancel:hover { background: #f8fafc; border-color: #cbd5e1; }
        .tb-popover-save { padding: 6px 14px; border: none; border-radius: 6px; background: #0f172a; color: #ffffff; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
        .tb-popover-save:hover:not(:disabled) { background: #1e293b; }
        .tb-popover-save:disabled { background: #cbd5e1; color: #94a3b8; cursor: not-allowed; }

        .tb-row-between { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
        .tb-charcount { font-size: 12px; color: #90a4ae; }

        .tb-btn {
          background: #000000; border: 1px solid #000000; border-radius: 6px; color: #ffffff;
          font-size: 13px; font-weight: 600; letter-spacing: 0.8px; padding: 10px 24px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
        }
        .tb-btn:hover:not(:disabled) { background: #333333; }
        .tb-btn:disabled { background: #e2e8f0; border-color: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
        .tb-btn-ghost { background: #ffffff; color: #000000; }
        .tb-btn-ghost:hover:not(:disabled) { background: #f1f5f9; }

        .tb-tab-bar { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid #f1f5f9; }
        .tb-tab { flex: 1; padding: 10px 16px; border: none; background: none; font-size: 13px; font-weight: 600; color: #94a3b8; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .tb-tab:hover { color: #475569; }
        .tb-tab-active { color: #0f172a; border-bottom-color: #0f172a; }
        .tb-tab-badge { font-size: 10px; font-weight: 700; background: #0f172a; color: #ffffff; padding: 1px 6px; border-radius: 10px; min-width: 18px; text-align: center; }

        .tb-history-card { height: 100%; }
        .tb-history-label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .tb-link-btn { background: none; border: none; color: #ef4444; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; cursor: pointer; padding: 0; }
        .tb-link-btn:hover { text-decoration: underline; }
        .tb-history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; max-height: 320px; }
        .tb-empty { color: #94a3b8; font-size: 14px; text-align: center; margin-top: 24px; }
        .tb-empty-state { display: flex; flex-direction: column; align-items: center; padding: 32px 16px; }
        .tb-empty-icon { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
        .tb-empty-sub { color: #b0bec5; font-size: 12px; text-align: center; margin-top: 4px; }
        
        .tb-history-item { background: #f8fafc; border-radius: 6px; padding: 12px 14px; cursor: pointer; transition: background 0.15s ease; border: 1px solid transparent; position: relative; }
        .tb-history-item:hover { background: #ffffff; border-color: #e2e8f0; }
        .tb-history-badge { position: absolute; top: 8px; right: 12px; font-size: 10px; font-weight: bold; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
        .tb-history-original { margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 40px; }
        .tb-history-original[dir="rtl"] { font-size: 16px; }
        .tb-history-translation { margin: 0 0 6px 0; font-size: 15px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tb-history-translation[dir="rtl"] { font-size: 17px; }
        .tb-history-time { font-size: 11px; color: #94a3b8; }

        .tb-review-subtitle { font-size: 10px; font-weight: 400; color: #22c55e; background: #f0fdf4; padding: 2px 8px; border-radius: 10px; }
        .tb-review-item { background: #f8fafc; border-radius: 8px; padding: 12px 14px; border: 1px solid #e2e8f0; transition: all 0.15s ease; }
        .tb-review-item:hover { border-color: #cbd5e1; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
        .tb-review-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .tb-review-direction { font-size: 10px; font-weight: 700; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
        .tb-review-delete { background: none; border: none; color: #cbd5e1; font-size: 14px; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: all 0.15s ease; line-height: 1; }
        .tb-review-delete:hover { color: #ef4444; background: #fef2f2; }
        .tb-review-correction { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .tb-review-wrong { font-size: 15px; font-weight: 600; color: #ef4444; text-decoration: line-through; text-decoration-color: #fca5a5; }
        .tb-review-arrow { font-size: 14px; color: #94a3b8; }
        .tb-review-right { font-size: 15px; font-weight: 700; color: #22c55e; }
        .tb-review-context { font-size: 11px; color: #94a3b8; margin: 6px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tb-review-time { font-size: 10px; color: #b0bec5; display: block; margin-top: 4px; }

        .tb-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #ffffff; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.2); z-index: 1000; animation: tb-toast-in 0.3s ease-out; }
        @keyframes tb-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .tb-toast-icon { color: #22c55e; font-weight: bold; }

        .tb-footer { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; padding-top: 24px; }

        /* Auth Screen Extra CSS */
        .tb-auth-container { display: flex; justify-content: center; align-items: center; padding: 20px; }
        .tb-auth-card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
        .tb-auth-input { width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 16px; }
        .tb-auth-btn { width: 100%; padding: 12px; background: #000; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
        .tb-auth-btn:hover { background: #333; }
        .tb-auth-toggle { background: none; border: none; color: #3b82f6; margin-top: 16px; cursor: pointer; font-size: 14px; text-decoration: underline; }
        
        /* Admin Dashboard Nav */
        .tb-nav-item { padding: 10px 12px; border-radius: 8px; cursor: pointer; margin: 2px 8px; font-size: 13px; font-weight: 500; color: #475569; display: flex; align-items: center; transition: all 0.15s ease; }
        .tb-nav-item:hover { background: #f1f5f9; color: #0f172a; }
        .tb-nav-item.active { background: #0f172a; color: #fff; }

        /* Stat Cards */
        .tb-stat-card { background: #fff; border-radius: 12px; padding: 20px 24px; border: 1px solid #e2e8f0; }
        .tb-stat-value { font-size: 32px; font-weight: 800; color: #0f172a; margin: 4px 0; line-height: 1; }
        .tb-stat-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }

        /* Chart Card */
        .tb-chart-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px 24px; }

        /* Chart wrapper */
        .tb-analytics-chart-wrap { width: 100%; }
        .tb-analytics-chart-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }

        /* Time range selector */
        .tb-time-range-selector { display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px; flex-shrink: 0; }
        .tb-time-range-btn { padding: 5px 12px; border: none; background: transparent; color: #64748b; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; }
        .tb-time-range-btn:hover { color: #0f172a; background: #e2e8f0; }
        .tb-time-range-btn.active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    `}</style>
  );
}
