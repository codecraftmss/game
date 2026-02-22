import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logout, isCurrentUserAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, ShieldCheck, Users, CheckCircle, Ban, Clock, Filter, Search,
  TrendingUp, UserCheck, UserX, Tv2, WifiOff, Wrench, CircleDot,
  ChevronDown, Send, Wifi, RefreshCw, Trophy, AlertTriangle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────
type Room = {
  id: string; name: string; label: string;
  min_bet: number; max_bet: number;
  status: "ONLINE" | "OFFLINE" | "LIVE" | "MAINTENANCE";
};

type GameState = {
  id: string; room_id: string;
  betting_phase: "1ST_BET" | "2ND_BET";
  betting_status: "OPEN" | "CLOSED";
  timer_seconds: number; current_round: number;
  result: "ANDAR" | "BAHAR" | null;
  target_card: string | null; is_live: boolean;
};

type GameHistory = {
  id: string; round_number: number;
  result: "ANDAR" | "BAHAR" | null;
  target_card: string | null; total_payout: number; created_at: string;
};

type UserProfile = {
  id: string; name: string; phone: string | null;
  status: "PENDING" | "APPROVED" | "BLOCKED";
  created_at: string;
};

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "BLOCKED";
const ROOM_STATUS_CYCLE: Room["status"][] = ["ONLINE", "LIVE", "OFFLINE", "MAINTENANCE"];

// ─── Card Data ───────────────────────────────────────────────────
const SUITS = [
  { name: "Hearts", sym: "♥", color: "#e74c3c" },
  { name: "Diamonds", sym: "♦", color: "#e74c3c" },
  { name: "Clubs", sym: "♣", color: "#1a1a2e" },
  { name: "Spades", sym: "♠", color: "#1a1a2e" },
];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// ─── Main Component ──────────────────────────────────────────────
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sessionStartRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Room selector
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  // Game state for selected room
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameHistory, setGameHistory] = useState<GameHistory[]>([]);
  const [timerDisplay, setTimerDisplay] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; outcome: "ANDAR" | "BAHAR" | null }>({ open: false, outcome: null });

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState("");

  // Card selection
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // User management
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Room management
  const [roomActionLoading, setRoomActionLoading] = useState<string | null>(null);

  // Status bar
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [latency, setLatency] = useState(12);

  // ── Session Timer ──
  useEffect(() => {
    const t = setInterval(() => setSessionSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const fmtSession = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Auth check ──
  useEffect(() => {
    const check = async () => {
      if (!(await isCurrentUserAdmin())) { navigate("/admin/login"); }
    };
    check();
  }, [navigate]);

  // ── Fetch rooms ──
  const fetchRooms = useCallback(async () => {
    const { data } = await supabase.from("rooms").select("id,name,label,min_bet,max_bet,status").order("created_at");
    if (data && data.length > 0) {
      setRooms(data as Room[]);
      if (!selectedRoomId) setSelectedRoomId(data[0].id);
    }
  }, [selectedRoomId]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // ── Fetch game state for selected room ──
  const fetchGameState = useCallback(async () => {
    if (!selectedRoomId) return;
    const { data } = await supabase.from("game_state").select("*").eq("room_id", selectedRoomId).maybeSingle();
    if (data) {
      setGameState(data as GameState);
      setTimerDisplay(data.timer_seconds);
      setSelectedCard(data.target_card);
    }
  }, [selectedRoomId]);

  // ── Fetch game history ──
  const fetchHistory = useCallback(async () => {
    if (!selectedRoomId) return;
    const { data } = await supabase.from("game_history").select("*").eq("room_id", selectedRoomId).order("created_at", { ascending: false }).limit(10);
    if (data) setGameHistory(data as GameHistory[]);
  }, [selectedRoomId]);

  useEffect(() => { fetchGameState(); fetchHistory(); }, [fetchGameState, fetchHistory]);

  // ── Realtime: game_state ──
  useEffect(() => {
    if (!selectedRoomId) return;
    const ch = supabase.channel(`admin-gs-${selectedRoomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_state", filter: `room_id=eq.${selectedRoomId}` },
        (p) => { setGameState(p.new as GameState); setTimerDisplay((p.new as GameState).timer_seconds); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedRoomId]);

  // ── Realtime: rooms ──
  useEffect(() => {
    const ch = supabase.channel("admin-rooms-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms" },
        (p) => setRooms(prev => prev.map(r => r.id === (p.new as Room).id ? p.new as Room : r)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Countdown display timer ──
  useEffect(() => {
    if (timerRunning && timerDisplay > 0) {
      timerRef.current = setInterval(() => setTimerDisplay(p => { if (p <= 1) { clearInterval(timerRef.current!); setTimerRunning(false); return 0; } return p - 1; }), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Fetch users ──
  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (data) { setUsers(data as UserProfile[]); setUsersLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    let result = users;
    if (filter !== "ALL") result = result.filter(u => u.status === filter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter(u => u.name?.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q)); }
    setFilteredUsers(result);
  }, [users, filter, searchQuery]);

  // ── Game state update helper ──
  const updateGameState = async (patch: Partial<GameState>) => {
    if (!selectedRoomId || !gameState) return;
    const { error } = await supabase.from("game_state").update({ ...patch, updated_at: new Date().toISOString() }).eq("room_id", selectedRoomId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setGameState(prev => prev ? { ...prev, ...patch } : prev);
  };

  // ── OPEN / CLOSE betting ──
  const handleBettingToggle = async (status: "OPEN" | "CLOSED") => {
    await updateGameState({ betting_status: status, result: null });
    toast({ title: status === "OPEN" ? "✅ Betting Opened" : "🔒 Betting Closed", description: `${rooms.find(r => r.id === selectedRoomId)?.name} — ${status}` });
    if (status === "OPEN") { setTimerDisplay(30); setTimerRunning(true); }
    else { setTimerRunning(false); }
  };

  // ── Phase toggle ──
  const handlePhaseToggle = async (phase: "1ST_BET" | "2ND_BET") => {
    await updateGameState({ betting_phase: phase });
    toast({ title: `Phase: ${phase}`, description: "Betting phase updated." });
  };

  // ── Select target card ──
  const handleCardSelect = async (card: string) => {
    setSelectedCard(card);
    await updateGameState({ target_card: card });
    toast({ title: "🃏 Joker Card Set", description: card });
  };

  // ── Trigger result ──
  const handleTriggerResult = async (outcome: "ANDAR" | "BAHAR") => {
    setConfirmModal({ open: false, outcome: null });
    await updateGameState({ result: outcome, betting_status: "CLOSED" });
    setTimerRunning(false);
    // Save to history
    await supabase.from("game_history").insert({
      room_id: selectedRoomId,
      round_number: gameState?.current_round || 1,
      result: outcome,
      target_card: selectedCard,
      total_payout: 0,
    });
    // Advance round
    await updateGameState({ current_round: (gameState?.current_round || 1) + 1, result: outcome });
    toast({ title: `🏆 ${outcome} Wins!`, description: "Result triggered and broadcast." });
    fetchHistory();
  };

  // ── Room status change ──
  const handleRoomStatus = async (room: Room, newStatus: Room["status"]) => {
    setRoomActionLoading(room.id);
    const { error } = await supabase.from("rooms").update({ status: newStatus }).eq("id", room.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Room Updated", description: `${room.name} → ${newStatus}` }); }
    setRoomActionLoading(null);
  };

  // ── User action ──
  const handleUserAction = async (userId: string, action: "APPROVED" | "BLOCKED") => {
    setActionLoading(userId);
    try {
      const { data: { user: cu } } = await supabase.auth.getUser();
      const u: any = { status: action };
      if (action === "APPROVED") u.approved_at = new Date().toISOString();
      await supabase.from("profiles").update(u).eq("id", userId);
      await supabase.from("admin_actions").insert({ admin_id: cu?.id, target_user_id: userId, action: action === "APPROVED" ? "approve" : "block" });
      toast({ title: action === "APPROVED" ? "User Approved" : "User Blocked" });
      fetchUsers();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setActionLoading(null); }
  };

  const handleLogout = async () => { await logout(); navigate("/admin/login"); };

  // ── Selected room name ──
  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  const stats = {
    total: users.length,
    pending: users.filter(u => u.status === "PENDING").length,
    approved: users.filter(u => u.status === "APPROVED").length,
    blocked: users.filter(u => u.status === "BLOCKED").length,
  };

  const roomStatusBadge = (status: Room["status"]) => {
    const map = {
      ONLINE: { cls: "room-badge-online", icon: <CircleDot className="w-3 h-3" />, label: "ONLINE" },
      LIVE: { cls: "room-badge-live", icon: <Tv2 className="w-3 h-3" />, label: "LIVE" },
      OFFLINE: { cls: "room-badge-offline", icon: <WifiOff className="w-3 h-3" />, label: "OFFLINE" },
      MAINTENANCE: { cls: "room-badge-maintenance", icon: <Wrench className="w-3 h-3" />, label: "MAINT" },
    };
    const m = map[status];
    return <span className={`${m.cls} flex items-center gap-1`}>{m.icon}{m.label}</span>;
  };

  const timerPct = Math.max(0, Math.min(100, (timerDisplay / 30) * 100));

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", color: "#e2e8f0" }}>

      {/* ── HEADER ── */}
      <header style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }} className="sticky top-0 z-50">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/card_fan_logo.png" alt="Royal Star" className="w-9 h-auto" />
            <div>
              <div className="font-bold text-amber-400 text-base tracking-wider">Royal Star</div>
              <div className="text-[10px] text-white/30 uppercase tracking-widest">Admin Control Center</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <Wifi className="w-3.5 h-3.5" />
              <span>{latency}ms</span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-all">
              <LogOut className="w-3.5 h-3.5" />Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6 space-y-8">

        {/* ══════════════════════════════════════════════════
            SECTION 1: GAME CONTROL
            ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-6 rounded-full bg-amber-400" />
            <h2 className="text-xl font-black text-white tracking-wider uppercase">Game Control</h2>
          </div>

          {/* Room Selector + Stats Bar */}
          <div className="rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="relative">
              <select
                value={selectedRoomId}
                onChange={e => setSelectedRoomId(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 rounded-xl text-sm font-bold text-white cursor-pointer focus:outline-none"
                style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)" }}
              >
                {rooms.map(r => <option key={r.id} value={r.id} style={{ background: "#1a1a2e" }}>{r.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 pointer-events-none" />
            </div>

            {/* Stats */}
            {[
              { label: "Round", value: `#${gameState?.current_round || 1}` },
              { label: "Phase", value: gameState?.betting_phase || "—" },
              { label: "Status", value: gameState?.betting_status || "—", gold: gameState?.betting_status === "OPEN" },
              { label: "Room", value: selectedRoom?.status || "—" },
            ].map(s => (
              <div key={s.label} className="text-center px-3">
                <div className="text-[9px] text-white/30 uppercase tracking-widest">{s.label}</div>
                <div className={`text-sm font-black ${s.gold ? "text-emerald-400" : "text-white"}`}>{s.value}</div>
              </div>
            ))}

            <button onClick={() => { fetchGameState(); fetchHistory(); }} className="ml-auto text-white/30 hover:text-white/70 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* 3-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ── LEFT: History + Broadcast ── */}
            <div className="space-y-4">
              {/* Game History */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-bold text-white">Game History</span>
                  </div>
                  <span className="text-[10px] text-white/30">Last 10 Rounds</span>
                </div>
                <div className="divide-y divide-white/5">
                  {gameHistory.length === 0 ? (
                    <div className="px-4 py-6 text-center text-white/20 text-xs">No rounds played yet</div>
                  ) : gameHistory.map((h) => (
                    <div key={h.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-white/3 transition-colors">
                      <div>
                        <div className="text-xs font-bold text-white/80">Round #{h.round_number}</div>
                        <div className="text-[10px] text-white/30">{h.target_card || "—"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${h.result === "ANDAR" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {h.result}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 border-t border-white/5">
                  <button className="text-[10px] text-amber-400/60 hover:text-amber-400 transition-colors font-bold uppercase tracking-wider">View Full Logs →</button>
                </div>
              </div>

              {/* Broadcast */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Broadcast</span>
                  <span className="text-[10px] text-white/30 ml-1">{selectedRoom?.name}</span>
                </div>
                <textarea
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                  placeholder="Message to all players in this room..."
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 resize-none focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <button
                  onClick={() => { toast({ title: "📢 Broadcast Sent", description: broadcastMsg }); setBroadcastMsg(""); }}
                  disabled={!broadcastMsg.trim()}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30"
                  style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24" }}
                >
                  Send Notification
                </button>
              </div>
            </div>

            {/* ── CENTER: Game Control ── */}
            <div className="space-y-4">

              {/* Phase Toggle */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Betting Phase</div>
                <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  {(["1ST_BET", "2ND_BET"] as const).map(phase => (
                    <button key={phase} onClick={() => handlePhaseToggle(phase)}
                      className="flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-all"
                      style={{
                        background: gameState?.betting_phase === phase ? "rgba(245,158,11,0.25)" : "transparent",
                        color: gameState?.betting_phase === phase ? "#fbbf24" : "rgba(255,255,255,0.3)",
                        borderRight: phase === "1ST_BET" ? "1px solid rgba(255,255,255,0.08)" : undefined,
                      }}>
                      {phase}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Timer</div>
                <div className="text-5xl font-black text-center tabular-nums mb-3"
                  style={{ color: timerDisplay <= 10 ? "#f87171" : timerDisplay <= 20 ? "#fbbf24" : "#4ade80" }}>
                  {String(timerDisplay).padStart(2, "0")}s
                </div>
                <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${timerPct}%`, background: timerDisplay <= 10 ? "#f87171" : timerDisplay <= 20 ? "#fbbf24" : "#4ade80" }} />
                </div>
              </div>

              {/* OPEN / CLOSE */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleBettingToggle("OPEN")}
                  disabled={gameState?.betting_status === "OPEN"}
                  className="py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30"
                  style={{ background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.4)", color: "#4ade80" }}>
                  ✦ OPEN
                </button>
                <button onClick={() => handleBettingToggle("CLOSED")}
                  disabled={gameState?.betting_status === "CLOSED"}
                  className="py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30"
                  style={{ background: "rgba(248,113,113,0.15)", border: "1.5px solid rgba(248,113,113,0.4)", color: "#f87171" }}>
                  ✦ CLOSE
                </button>
              </div>

              {/* TRIGGER BUTTONS */}
              <div className="grid grid-cols-2 gap-3">
                {(["ANDAR", "BAHAR"] as const).map(outcome => (
                  <button key={outcome}
                    onClick={() => setConfirmModal({ open: true, outcome })}
                    disabled={gameState?.betting_status !== "CLOSED"}
                    className="py-5 rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-25 relative overflow-hidden"
                    style={{
                      background: outcome === "ANDAR" ? "linear-gradient(135deg, #c0392b, #7b241c)" : "linear-gradient(135deg, #1a3a4a, #0d2233)",
                      border: "1.5px solid rgba(255,255,255,0.1)",
                      fontSize: 13,
                    }}>
                    <div className="text-white/40 text-[9px] tracking-widest mb-0.5">TRIGGER</div>
                    <div className="text-white text-base">{outcome}</div>
                  </button>
                ))}
              </div>

              {gameState?.result && (
                <div className="rounded-xl py-2 text-center" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <span className="text-amber-400 font-black text-sm">🏆 Last Result: {gameState.result}</span>
                </div>
              )}
            </div>

            {/* ── RIGHT: Card Selector ── */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-sm font-bold text-white">🃏 Target Card</span>
                {selectedCard && (
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded-lg text-xs font-black"
                      style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
                      {selectedCard}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected card preview */}
              {selectedCard && (
                <div className="px-4 py-3 flex justify-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="relative" style={{
                    width: 60, height: 84, borderRadius: 10,
                    background: "white", border: "2px solid #f1c40f",
                    boxShadow: "0 0 20px rgba(241,196,15,0.5), 0 8px 24px rgba(0,0,0,0.5)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    animation: "jokerPop 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                  }}>
                    {(() => {
                      const suit = SUITS.find(s => selectedCard.includes(s.sym));
                      const val = selectedCard.replace(suit?.sym || "", "");
                      return <>
                        <div className="absolute top-1 left-2 font-black text-xs leading-none" style={{ color: suit?.color }}>{val}</div>
                        <div className="text-2xl" style={{ color: suit?.color }}>{suit?.sym}</div>
                        <div className="absolute bottom-1 right-2 font-black text-xs leading-none rotate-180" style={{ color: suit?.color }}>{val}</div>
                      </>;
                    })()}
                  </div>
                </div>
              )}

              {/* 4-row card grid */}
              <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 360 }}>
                {SUITS.map(suit => (
                  <div key={suit.name}>
                    <div className="text-[9px] uppercase tracking-widest mb-1.5 flex items-center gap-1"
                      style={{ color: suit.color === "#e74c3c" ? "#f87171" : "rgba(255,255,255,0.3)" }}>
                      <span>{suit.sym}</span> {suit.name}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {VALUES.map(val => {
                        const card = `${val}${suit.sym}`;
                        const isSelected = selectedCard === card;
                        return (
                          <button key={card} onClick={() => handleCardSelect(card)}
                            title={card}
                            className="transition-all duration-150"
                            style={{
                              width: "100%", aspectRatio: "2/3", borderRadius: 5,
                              background: isSelected ? "white" : "rgba(255,255,255,0.07)",
                              border: isSelected ? "2px solid #f1c40f" : "1px solid rgba(255,255,255,0.1)",
                              boxShadow: isSelected ? "0 0 10px rgba(241,196,15,0.6)" : "0 2px 6px rgba(0,0,0,0.3)",
                              transform: isSelected ? "translateY(-3px) scale(1.08)" : undefined,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer",
                              color: isSelected ? suit.color : (suit.color === "#e74c3c" ? "#f87171" : "rgba(255,255,255,0.5)"),
                              fontSize: 9, fontWeight: 900,
                            }}>
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            SECTION 2: ROOM MANAGEMENT (existing)
            ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-6 rounded-full bg-emerald-400" />
            <h2 className="text-xl font-black text-white tracking-wider uppercase">Room Management</h2>
            <span className="text-xs text-white/30 bg-white/5 rounded-full px-3 py-1">
              {rooms.filter(r => r.status === "ONLINE" || r.status === "LIVE").length} active
            </span>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                    {["Room", "Min Bet", "Max Bet", "Status", "Control"].map((h, i) => (
                      <th key={h} className={`py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-white/30 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(room => (
                    <tr key={room.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 px-5">
                        <div className="font-semibold text-white text-sm">{room.name}</div>
                        <div className="text-[10px] text-white/30">{room.label}</div>
                      </td>
                      <td className="py-3 px-5 text-white/50 text-sm">₹{room.min_bet.toLocaleString()}</td>
                      <td className="py-3 px-5 text-white/50 text-sm">₹{room.max_bet.toLocaleString()}</td>
                      <td className="py-3 px-5">{roomStatusBadge(room.status)}</td>
                      <td className="py-3 px-5">
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {ROOM_STATUS_CYCLE.filter(s => s !== room.status).map(s => (
                            <button key={s} disabled={roomActionLoading === room.id} onClick={() => handleRoomStatus(room, s)}
                              className={`room-ctrl-btn room-ctrl-${s.toLowerCase()} text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg transition-all disabled:opacity-40`}>
                              → {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            SECTION 3: USER MANAGEMENT (existing)
            ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-6 rounded-full bg-blue-400" />
            <h2 className="text-xl font-black text-white tracking-wider uppercase">User Management</h2>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total", value: stats.total, icon: <Users className="w-4 h-4 text-blue-400" />, color: "text-blue-400" },
              { label: "Pending", value: stats.pending, icon: <Clock className="w-4 h-4 text-amber-400" />, color: "text-amber-400" },
              { label: "Approved", value: stats.approved, icon: <UserCheck className="w-4 h-4 text-emerald-400" />, color: "text-emerald-400" },
              { label: "Blocked", value: stats.blocked, icon: <UserX className="w-4 h-4 text-red-400" />, color: "text-red-400" },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between mb-1">{s.icon}<TrendingUp className="w-3 h-3 text-white/20" /></div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search + Filter */}
          <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <Input placeholder="Search by name or phone..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20" />
              </div>
              <div className="flex gap-2">
                {(["ALL", "PENDING", "APPROVED", "BLOCKED"] as StatusFilter[]).map(f => (
                  <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}
                    className={filter === f ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "border-white/10 text-white/30 hover:text-white hover:bg-white/5"}>
                    <Filter className="w-3 h-3 mr-1" />{f}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                    {["Name", "Phone", "Status", "Joined", "Actions"].map((h, i) => (
                      <th key={h} className={`py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-white/30 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr><td colSpan={5} className="text-center py-10 text-white/20">Loading...</td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-white/20">{searchQuery ? "No users match." : "No users found."}</td></tr>
                  ) : filteredUsers.map(user => (
                    <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 px-5 text-white text-sm font-medium">{user.name || "—"}</td>
                      <td className="py-3 px-5 text-white/40 text-sm">{user.phone || "—"}</td>
                      <td className="py-3 px-5">
                        {user.status === "PENDING" && <Badge variant="outline" className="border-amber-500/40 text-amber-400 gap-1 text-[10px]"><Clock className="w-2.5 h-2.5" />Pending</Badge>}
                        {user.status === "APPROVED" && <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 gap-1 text-[10px]"><CheckCircle className="w-2.5 h-2.5" />Approved</Badge>}
                        {user.status === "BLOCKED" && <Badge variant="outline" className="border-red-500/40 text-red-400 gap-1 text-[10px]"><Ban className="w-2.5 h-2.5" />Blocked</Badge>}
                      </td>
                      <td className="py-3 px-5 text-white/30 text-xs">{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-5">
                        <div className="flex gap-2 justify-end">
                          {user.status !== "APPROVED" && (
                            <Button size="sm" disabled={actionLoading === user.id} onClick={() => handleUserAction(user.id, "APPROVED")}
                              className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs h-7">
                              <CheckCircle className="w-3 h-3 mr-1" />Approve
                            </Button>
                          )}
                          {user.status !== "BLOCKED" && (
                            <Button size="sm" variant="outline" disabled={actionLoading === user.id} onClick={() => handleUserAction(user.id, "BLOCKED")}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7">
                              <Ban className="w-3 h-3 mr-1" />Block
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!usersLoading && filteredUsers.length > 0 && (
              <div className="py-3 text-center text-[11px] text-white/20" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                Showing {filteredUsers.length} of {users.length} users
              </div>
            )}
          </div>
        </section>

        {/* ── BOTTOM STATUS BAR ── */}
        <div className="rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { label: "Latency", value: `${latency}ms`, color: "text-emerald-400" },
            { label: "House Edge", value: "2.5%", color: "text-amber-400" },
            { label: "Session", value: fmtSession(sessionSeconds), color: "text-blue-400" },
            { label: "Server", value: "ONLINE", color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-[9px] text-white/20 uppercase tracking-widest">{s.label}</span>
              <span className={`text-xs font-black ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </main>

      {/* ── CONFIRM MODAL ── */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl p-8 max-w-sm w-full mx-4 text-center" style={{ background: "#12121f", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 25px 60px rgba(0,0,0,0.7)" }}>
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h3 className="text-xl font-black text-white mb-2">Confirm Result</h3>
            <p className="text-white/40 text-sm mb-6">
              Trigger <span className={`font-black ${confirmModal.outcome === "ANDAR" ? "text-red-400" : "text-blue-400"}`}>{confirmModal.outcome}</span> as the winner?
              <br /><span className="text-xs">This cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ open: false, outcome: null })}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-all">
                Cancel
              </button>
              <button onClick={() => confirmModal.outcome && handleTriggerResult(confirmModal.outcome)}
                className="flex-1 py-3 rounded-xl text-sm font-black text-white transition-all"
                style={{ background: confirmModal.outcome === "ANDAR" ? "linear-gradient(135deg,#c0392b,#7b241c)" : "linear-gradient(135deg,#1a3a4a,#0d2233)" }}>
                ✓ Confirm {confirmModal.outcome}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
