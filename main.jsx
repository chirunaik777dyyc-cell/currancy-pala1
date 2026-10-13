import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BadgeCheck, Bell, Check, ChevronDown,
  CircleHelp, Copy, Eye, EyeOff, History, Home, LogOut, Menu, Search, Send,
  Settings, ShieldCheck, Sparkles, Wallet, X, Zap
} from "lucide-react";
import "./styles.css";

const API = "/api";
const TOKEN_KEY = "pala_session_token";
const money = value => `PA ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const initials = name => (name || "PA").slice(0, 2).toUpperCase();

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed. Please try again.");
  return body;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [view, setView] = useState("overview");
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [hideBalance, setHideBalance] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const notify = useCallback(message => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const loadDashboard = useCallback(async currentToken => {
    const [me, history] = await Promise.all([
      request("/me", { token: currentToken }),
      request("/transactions?limit=50", { token: currentToken })
    ]);
    setUser(me.user);
    setWallet(me.wallet);
    setTransactions(history.transactions);
  }, []);

  useEffect(() => {
    let active = true;
    if (!token) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    loadDashboard(token).catch(() => {
      if (!active) return;
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setUser(null);
      setWallet(null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, loadDashboard]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(""); setUser(null); setWallet(null); setTransactions([]);
    setView("overview"); setAuthMode("login");
    notify("You have signed out.");
  };

  const refresh = async () => {
    await loadDashboard(token);
  };

  if (loading) return <div className="loading-screen"><div className="brand-mark">PA</div><div className="loader" /><p>Preparing your Pala wallet…</p></div>;
  if (!token || !user) return <AuthScreen mode={authMode} setMode={setAuthMode} onSuccess={result => {
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    setToken(result.token);
    if (result.balance) setWallet({ balance: result.balance, currency: "PAL", symbol: "PA" });
  }} />;

  const nav = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "activity", label: "Activity", icon: History },
    { id: "send", label: "Send Pala", icon: Send },
    { id: "settings", label: "Settings", icon: Settings }
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark">PA</div><div><strong>Pala</strong><span>Digital currency</span></div><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-label">YOUR WALLET</div>
      <nav>{nav.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => { setView(item.id); setMobileMenu(false); setError(""); }}><item.icon size={18}/><span>{item.label}</span>{item.id === "send" && <span className="nav-shortcut">↗</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><ShieldCheck size={17}/></div><strong>Your demo wallet</strong><p>Pala credits are test units, not real money.</p><button onClick={() => setView("settings")}>Learn more <span>→</span></button></div>
        <button className="nav-item logout-item" onClick={logout}><LogOut size={18}/><span>Sign out</span></button>
        <div className="profile-mini"><div className="avatar">{initials(user.username)}</div><div className="profile-text"><strong>{user.username}</strong><span>{user.email}</span></div><BadgeCheck size={16} className="verified-icon"/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20}/></button><span className="breadcrumb">Workspace</span><span className="crumb-slash">/</span><strong>{nav.find(n => n.id === view)?.label || "Overview"}</strong></div><div className="topbar-right"><div className="network-pill"><span className="status-dot"/> Demo network</div><button className="icon-button notification-button" title="Notifications" onClick={() => notify("You're all caught up.")}><Bell size={18}/><i/></button><div className="top-avatar">{initials(user.username)}</div></div></header>
      <div className="content">
        {view === "overview" && <Overview user={user} wallet={wallet} transactions={transactions} hideBalance={hideBalance} setHideBalance={setHideBalance} setView={setView} refresh={refresh} />}
        {view === "activity" && <Activity transactions={transactions} />}
        {view === "send" && <SendPanel token={token} wallet={wallet} onComplete={async message => { await refresh(); notify(message); setView("overview"); }} />}
        {view === "settings" && <SettingsPanel user={user} token={token} onUser={setUser} notify={notify} />}
      </div>
      <footer className="footer"><span>© {new Date().getFullYear()} Pala project</span><span><span className="status-dot"/> All systems operational</span><span>PAL · Version 1.0.0</span></footer>
    </main>
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function AuthScreen({ mode, setMode, onSuccess }) {
  const [fields, setFields] = useState({ username: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = e => setFields(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request(`/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST", body: JSON.stringify(fields)
      });
      onSuccess(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="auth-layout">
    <section className="auth-promo"><div className="promo-orb orb-one"/><div className="promo-orb orb-two"/><div className="promo-brand"><div className="brand-mark">PA</div><span>Pala</span></div><div className="promo-content"><div className="eyebrow"><Sparkles size={14}/> YOUR DIGITAL CURRENCY</div><h1>Money moves.<br/><em>Possibilities</em> open.</h1><p>A clean, modern wallet experience built around Pala — your own demo currency.</p><div className="promo-stat"><div className="stat-symbol">PA</div><div><strong>One currency. New possibilities.</strong><span>Simple transfers, clear history, your wallet.</span></div></div></div><div className="promo-bottom"><span>Designed for the next idea.</span><span>PAL / 001</span></div></section>
    <section className="auth-side"><div className="auth-box"><div className="auth-heading"><div className="auth-mini-mark">PA</div><div className="eyebrow">WELCOME TO PALA</div><h2>{mode === "login" ? "Welcome back" : "Create your wallet"}</h2><p>{mode === "login" ? "Sign in to continue to your dashboard." : "Get started with 1,000 demo PA credits."}</p></div>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <label>Username<div className="input-wrap"><span>@</span><input name="username" value={fields.username} onChange={update} placeholder="yourusername" minLength="3" maxLength="24" required autoComplete="username"/></div></label>}
        <label>Email address<div className="input-wrap"><input type="email" name="email" value={fields.email} onChange={update} placeholder="you@example.com" required autoComplete="email"/></div></label>
        <label>Password<div className="input-wrap"><input type="password" name="password" value={fields.password} onChange={update} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"} minLength={mode === "register" ? 10 : 1} required autoComplete={mode === "login" ? "current-password" : "new-password"}/></div></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? <span className="button-spinner"/> : mode === "login" ? "Sign in to Pala" : "Create my wallet"} <span>→</span></button>
      </form>
      <div className="auth-switch">{mode === "login" ? "New to Pala?" : "Already have a wallet?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}> {mode === "login" ? "Create an account" : "Sign in"}</button></div>
      <div className="auth-disclaimer"><ShieldCheck size={15}/> Demo currency only. PA credits have no cash value.</div>
    </div><div className="auth-foot">PALA DIGITAL WALLET <span>•</span> BUILT FOR IDEAS</div></section>
  </div>;
}

function Overview({ user, wallet, transactions, hideBalance, setHideBalance, setView, refresh }) {
  const balance = wallet?.balance || "0.00";
  const received = transactions.filter(t => t.direction === "received").reduce((n, t) => n + Number(t.amount), 0);
  const sent = transactions.filter(t => t.direction === "sent").reduce((n, t) => n + Number(t.amount), 0);
  const latest = transactions.slice(0, 5);
  const copyUsername = async () => { try { await navigator.clipboard.writeText(user.username); } catch {} };
  return <div className="page-enter">
    <div className="welcome-row"><div><div className="eyebrow">TUESDAY, OCTOBER 13, 2026 <span className="tiny-spark">✦</span></div><h1>Good to see you, {user.username} <span className="wave">✳</span></h1><p>Here's what's happening with your Pala wallet.</p></div><button className="outline-button" onClick={refresh}><span>↻</span> Refresh data</button></div>
    <div className="overview-grid">
      <section className="balance-card"><div className="balance-card-top"><div><span className="card-overline">TOTAL WALLET BALANCE</span><div className="balance-label">Available Pala <button className="balance-eye" onClick={() => setHideBalance(v => !v)} aria-label={hideBalance ? "Show balance" : "Hide balance"}>{hideBalance ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div></div><div className="balance-chip"><span className="status-dot"/> ACTIVE</div></div><div className="big-balance">{hideBalance ? "PA ••••••" : money(balance)}</div><div className="balance-meta"><span><span className="balance-spark">✦</span> Demo credits</span><span>Currency code <strong>PAL</strong></span></div><div className="balance-divider"/><div className="balance-actions"><button onClick={() => setView("send")} className="balance-send"><Send size={16}/> Send Pala <span>↗</span></button><button onClick={copyUsername} className="balance-receive"><Copy size={16}/> Copy username</button></div><div className="card-watermark">PA</div></section>
      <section className="quick-card"><div className="section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h3>Wallet snapshot</h3></div><div className="heading-icon"><Zap size={18}/></div></div><div className="snapshot-row"><div className="snapshot-icon received"><ArrowDownLeft size={18}/></div><div className="snapshot-text"><strong>Received</strong><span>Recent activity</span></div><div className="snapshot-value positive">+{money(received)}</div></div><div className="snapshot-row"><div className="snapshot-icon sent"><ArrowUpRight size={18}/></div><div className="snapshot-text"><strong>Sent</strong><span>Recent activity</span></div><div className="snapshot-value">−{money(sent)}</div></div><div className="snapshot-note"><div className="note-icon"><CircleHelp size={15}/></div><span>Totals reflect your latest {transactions.length} transactions.</span></div></section>
    </div>
    <div className="section-title-row"><div><span className="eyebrow">KEEP TRACK</span><h2>Recent transactions</h2></div><button className="text-button" onClick={() => setView("activity")}>View all activity <span>→</span></button></div>
    <section className="transaction-card">{latest.length ? latest.map(t => <TransactionRow key={t.id} transaction={t} />) : <EmptyTransactions/>}</section>
    <div className="bottom-grid"><section className="tip-card"><div className="tip-graphic"><div className="tip-circle"><Sparkles size={22}/></div><div className="tip-line line-a"/><div className="tip-line line-b"/></div><div><div className="eyebrow">A LITTLE TIP</div><h3>Your username is your wallet address</h3><p>Share your username with another Pala user so they can send you demo credits.</p></div><button className="tip-arrow" onClick={() => setView("settings")}>↗</button></section><section className="security-card"><div className="security-badge"><ShieldCheck size={19}/></div><div><strong>Stay in control</strong><p>Use a unique password and sign out on shared devices.</p></div><button onClick={() => setView("settings")}>Settings <span>→</span></button></section></div>
  </div>;
}

function TransactionRow({ transaction: t }) {
  const isSent = t.direction === "sent";
  const isWelcome = t.direction === "welcome";
  const Icon = isSent ? ArrowUpRight : ArrowDownLeft;
  return <div className="transaction-row"><div className={`transaction-icon ${isSent ? "tx-sent" : isWelcome ? "tx-welcome" : "tx-received"}`}>{isWelcome ? <Sparkles size={18}/> : <Icon size={18}/>}</div><div className="transaction-info"><strong>{isWelcome ? "Welcome credits" : `${isSent ? "Sent to" : "Received from"} ${t.counterparty || "Pala user"}`}</strong><span>{t.note || (isWelcome ? "Pala demo wallet" : "Pala transfer")} <i>·</i> {dateText(t.createdAt)}</span></div><div className={`transaction-amount ${isSent ? "amount-out" : "amount-in"}`}>{isSent ? "−" : "+"}{money(t.amount)}</div><div className={`tx-status ${isWelcome ? "status-welcome" : "status-complete"}`}>{isWelcome ? "CREDITED" : "COMPLETE"}</div></div>;
}
function EmptyTransactions() { return <div className="empty-state"><div className="empty-icon"><History size={23}/></div><strong>No transactions yet</strong><p>Your transfers will appear here once you get started.</p></div>; }

function Activity({ transactions }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => transactions.filter(t => {
    const matchFilter = filter === "all" || t.direction === filter;
    const matchSearch = `${t.counterparty} ${t.note} ${t.amount}`.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  }), [transactions, filter, search]);
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">YOUR WALLET RECORD</div><h1>Activity</h1><p>Every Pala movement, together in one place.</p></div><div className="activity-count">{transactions.length} records</div></div><section className="activity-panel"><div className="activity-tools"><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"/></div><div className="filter-tabs">{[["all","All"],["sent","Sent"],["received","Received"],["welcome","Credits"]].map(([v,l]) => <button key={v} className={filter === v ? "selected" : ""} onClick={() => setFilter(v)}>{l}</button>)}</div></div>{filtered.length ? <div className="transaction-list">{filtered.map(t => <TransactionRow key={t.id} transaction={t}/>)}</div> : <EmptyTransactions/>}<div className="activity-foot">Showing {filtered.length} of {transactions.length} transactions</div></section></div>;
}

function SendPanel({ token, wallet, onComplete }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const validAmount = /^\d{1,12}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  const submit = async e => {
    e.preventDefault(); setError(""); setSuccess(null);
    if (!validAmount) { setError("Enter a valid amount greater than zero, with up to 2 decimals."); return; }
    setBusy(true);
    try {
      const result = await request("/transfers", { token, method: "POST", body: JSON.stringify({ recipient, amount, note }) });
      setSuccess(result); setAmount(""); setNote(""); setRecipient("");
      await onComplete("Transfer completed successfully.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">QUICK & SIMPLE</div><h1>Send Pala</h1><p>Transfer demo credits to another Pala wallet.</p></div><div className="transfer-heading-icon"><ArrowLeftRight size={21}/></div></div><div className="send-layout"><section className="send-form-card"><div className="form-card-title"><div className="heading-icon"><Send size={18}/></div><div><h3>Transfer details</h3><p>Double-check the details before sending.</p></div></div><form onSubmit={submit} className="transfer-form"><label>Recipient username or email<div className="input-wrap recipient-input"><span>@</span><input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Who are you sending to?" minLength="3" maxLength="254" required/></div><small>Use the exact username or email linked to their Pala account.</small></label><label>Amount to send<div className="amount-input-wrap"><span>PA</span><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" required/><button type="button" onClick={() => setAmount(String(Math.max(0, Number(wallet?.balance || 0)).toFixed(2)))}>MAX</button></div><small>Available balance: <strong>{money(wallet?.balance)}</strong></small></label><label>Note <span className="optional-label">OPTIONAL</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="What's this transfer for?" maxLength="140" rows="3"/><small className="char-count">{note.length}/140</small></label>{error && <div className="form-error">{error}</div>}{success && <div className="success-message"><Check size={16}/> Transfer recorded.</div>}<div className="transfer-summary"><span>Transfer amount</span><strong>{money(validAmount ? amount : 0)}</strong><span>Network fee</span><strong className="fee-free">0.00 PA</strong><div/><span>Total</span><strong>{money(validAmount ? amount : 0)}</strong></div><button className="primary-button full-button" type="submit" disabled={busy || !recipient.trim() || !validAmount}>{busy ? <span className="button-spinner"/> : <><Send size={16}/> Review & send</>} <span>→</span></button><div className="form-footnote"><ShieldCheck size={14}/> Transfers are final in this demo environment.</div></form></section><aside className="send-side"><div className="available-card"><div className="available-icon"><Wallet size={20}/></div><span>AVAILABLE BALANCE</span><strong>{money(wallet?.balance)}</strong><p>PAL · Pala demo credits</p></div><div className="how-card"><div className="how-icon"><Zap size={18}/></div><h3>How it works</h3><div className="how-step"><span>1</span><div><strong>Enter a recipient</strong><p>Use their Pala username or email.</p></div></div><div className="how-step"><span>2</span><div><strong>Choose an amount</strong><p>Transfers are limited to your available balance.</p></div></div><div className="how-step"><span>3</span><div><strong>Send securely</strong><p>Your wallet and their wallet update together.</p></div></div></div><div className="warning-card"><CircleHelp size={17}/><p><strong>Demo currency notice</strong> Pala is a software prototype. PA credits are not real money and cannot be redeemed.</p></div></aside></div></div>;
}

function SettingsPanel({ user, token, onUser, notify }) {
  const [username, setUsername] = useState(user.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const save = async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request("/profile", { token, method: "PATCH", body: JSON.stringify({ username }) });
      onUser(result.user); notify("Profile updated.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Settings</h1><p>Manage your Pala profile and learn about this demo.</p></div><div className="transfer-heading-icon"><Settings size={21}/></div></div><div className="settings-layout"><section className="settings-card"><div className="settings-section-heading"><div className="settings-icon"><Settings size={19}/></div><div><h3>Profile details</h3><p>Your public wallet identity.</p></div></div><form className="settings-form" onSubmit={save}><label>Username<div className="input-wrap"><span>@</span><input value={username} onChange={e => setUsername(e.target.value)} minLength="3" maxLength="24" required/></div><small>3–24 letters, numbers, or underscores. Other users can use this to send you Pala.</small></label><label>Email address<div className="input-wrap"><input value={user.email} disabled readOnly/></div><small>Email changes are not available in this prototype.</small></label>{error && <div className="form-error">{error}</div>}<button className="primary-button" type="submit" disabled={busy || username === user.username}>{busy ? "Saving…" : "Save changes"} <span>→</span></button></form></section><section className="settings-card currency-settings"><div className="settings-section-heading"><div className="settings-icon currency-settings-icon">PA</div><div><h3>Currency details</h3><p>Your custom currency configuration.</p></div></div><div className="setting-line"><span>Currency name</span><strong>Pala</strong></div><div className="setting-line"><span>Symbol</span><strong className="symbol-tag">PA</strong></div><div className="setting-line"><span>Currency code</span><strong>PAL</strong></div><div className="setting-line"><span>Decimal places</span><strong>2</strong></div><div className="setting-line"><span>Network</span><strong><span className="status-dot"/> Demo ledger</strong></div><div className="setting-line"><span>Cash value</span><strong>None</strong></div></section><section className="settings-card about-card"><div className="settings-section-heading"><div className="settings-icon"><ShieldCheck size={19}/></div><div><h3>Security & limitations</h3><p>Important information about this build.</p></div></div><div className="about-item"><Check size={16}/><span>Passwords are hashed before storage.</span></div><div className="about-item"><Check size={16}/><span>Transfers are recorded in a PostgreSQL database transaction.</span></div><div className="about-item"><Check size={16}/><span>API routes require a signed session token.</span></div><div className="about-item warning"><CircleHelp size={16}/><span>This is not a blockchain, bank, regulated currency, or payment service. Credits have no cash value.</span></div><button className="outline-button help-toggle" onClick={() => setShowHelp(v => !v)}>{showHelp ? "Hide deployment notes" : "Show deployment notes"} <ChevronDown size={15}/></button>{showHelp && <div className="deployment-notes"><p><strong>Before public launch:</strong> arrange a security review, configure HTTPS and database backups, define terms and privacy policy, and consult qualified legal/financial professionals before adding real-money functionality.</p><p><strong>Deploy:</strong> push this repository to GitHub, then create a Render Blueprint using the included <code>render.yaml</code>.</p></div>}</section></div></div>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
