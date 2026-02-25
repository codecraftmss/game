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
  ChevronDown, Send, Wifi, RefreshCw, Trophy, AlertTriangle, Coins
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

  // Room selector
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  // Game state for selected room
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameHistory, setGameHistory] = useState<GameHistory[]>([]);

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
        (p) => { setGameState(p.new as GameState); })
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
    // Save to history
    // Payout logic via RPC
    const { data: settleData, error: settleError } = await (supabase.rpc("settle_round" as any, {
      p_room_id: selectedRoomId,
      p_round_number: gameState?.current_round || 1,
      p_winning_side: outcome
    }) as any);

    if (settleError) {
      console.error("Settlement error:", settleError);
    } else {
      console.log("Settlement result:", settleData);
    }

    // Advance round
    await updateGameState({ current_round: (gameState?.current_round || 1) + 1, result: outcome });
    toast({ 
      title: `🏆 ${outcome} Wins!`, 
      description: settleData?.success 
        ? `Round settled: ${settleData.processed} bets processed.` 
        : "Round triggered, but settlement failed." 
    });
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
            <button 
              onClick={() => navigate("/admin/token-management")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-500/80 hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/40 transition-all bg-amber-500/5"
            >
              <Coins className="w-3.5 h-3.5" />Tokens
            </button>
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

      <main className="container mx-auto px-6 py-6 space-y-12">

        {/* ROOM SELECTOR + STATS HEADER */}
        <div className="rounded-2xl p-4 mb-2 flex flex-wrap items-center gap-4 bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="relative">
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2 rounded-xl text-sm font-bold text-white cursor-pointer focus:outline-none bg-amber-500/10 border border-amber-500/30"
            >
              {rooms.map(r => <option key={r.id} value={r.id} style={{ background: "#1a1a2e" }}>{r.name}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 pointer-events-none" />
          </div>

          {[
            { label: "Round", value: `#${gameState?.current_round || 1}` },
            { label: "Phase", value: gameState?.betting_phase || "—" },
            { label: "Status", value: gameState?.betting_status || "—", gold: gameState?.betting_status === "OPEN" },
            { label: "Room", value: selectedRoom?.status || "—" },
          ].map(s => (
            <div key={s.label} className="text-center px-4 border-l border-white/10">
              <div className="text-[9px] text-white/30 uppercase tracking-widest">{s.label}</div>
              <div className={`text-sm font-black ${s.gold ? "text-emerald-400" : "text-white"}`}>{s.value}</div>
            </div>
          ))}

          <div className="ml-auto flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-white/20 uppercase">Latency: <span className="text-emerald-400 font-bold">{latency}ms</span></span>
              <span className="text-[10px] text-white/20 uppercase">Session: <span className="text-blue-400 font-bold">{fmtSession(sessionSeconds)}</span></span>
            </div>
            <button onClick={() => { fetchGameState(); fetchHistory(); }} className="text-white/30 hover:text-white transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── SECTION 1: GAME CONTROL (The 4-Column Grid) ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1.5 h-5 rounded-full bg-amber-400" />
            <h2 className="text-lg font-black text-white tracking-widest uppercase">Live Control</h2>
          </div>

          <div className="grid grid-cols-12 gap-4 h-[440px]">
            {/* COLUMN 1: History & Broadcast */}
            <div className="col-span-3 space-y-4 flex flex-col">
              <div className="rounded-2xl flex-1 flex flex-col overflow-hidden bg-black/40 border border-white/5">
                <div className="px-4 py-2.5 flex items-center justify-between bg-white/5 border-b border-white/5">
                  <div className="flex items-center gap-2 uppercase tracking-widest">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-black text-white">History</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-white/5 scrollbar-hide">
                  {gameHistory.length === 0 ? (
                    <div className="p-10 text-center text-white/10 text-[10px]">No rounds</div>
                  ) : gameHistory.slice(0, 10).map((h) => (
                    <div key={h.id} className="px-4 py-2 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div>
                        <div className="text-[10px] font-black text-white/80">Round #{h.round_number}</div>
                        <div className="text-[9px] text-white/30">{h.target_card || "—"}</div>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${h.result === "ANDAR" ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                        {h.result}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-black text-white uppercase tracking-wider">Broadcast</span>
                </div>
                <textarea
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                  placeholder="Message players..."
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/20 resize-none focus:outline-none bg-black/40 border border-white/10"
                />
                <button
                  onClick={() => { toast({ title: "📢 Broadcast Sent", description: broadcastMsg }); setBroadcastMsg(""); }}
                  disabled={!broadcastMsg.trim()}
                  className="mt-3 w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                >
                  Broadcast
                </button>
              </div>
            </div>

            {/* COLUMN 2: Phase & Main Controls */}
            <div className="col-span-3 flex flex-col gap-3">
              <div className="rounded-2xl p-3 bg-white/5 border border-white/10 shrink-0">
                <div className="text-[9px] text-white/20 uppercase tracking-[0.2em] mb-2">Phase Control</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["1ST_BET", "2ND_BET"] as const).map(phase => (
                    <button key={phase} onClick={() => handlePhaseToggle(phase)}
                      className="py-2 text-[9px] font-black uppercase tracking-wider transition-all rounded-xl border"
                      style={{
                        background: gameState?.betting_phase === phase ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.02)",
                        color: gameState?.betting_phase === phase ? "#fbbf24" : "rgba(255,255,255,0.15)",
                        borderColor: gameState?.betting_phase === phase ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.05)",
                      }}>
                      {phase}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-3">
                <button onClick={() => handleBettingToggle("OPEN")}
                  disabled={gameState?.betting_status === "OPEN"}
                  className="flex-1 rounded-2xl text-sm font-black uppercase tracking-[0.1em] transition-all disabled:opacity-30 flex flex-col items-center justify-center gap-1 shadow-2xl active:scale-95 border-2 group"
                  style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(20,83,45,0.3))", borderColor: "rgba(74,222,128,0.4)", color: "#4ade80" }}>
                  <div className="text-[9px] opacity-40 font-medium tracking-[0.3em]">MANUAL</div>
                  ✦ OPEN BETTING
                </button>
                <button onClick={() => handleBettingToggle("CLOSED")}
                  disabled={gameState?.betting_status === "CLOSED"}
                  className="flex-1 rounded-2xl text-sm font-black uppercase tracking-[0.1em] transition-all disabled:opacity-30 flex flex-col items-center justify-center gap-1 shadow-2xl active:scale-95 border-2 group"
                  style={{ background: "linear-gradient(135deg, rgba(248,113,113,0.15), rgba(127,29,29,0.3))", borderColor: "rgba(248,113,113,0.4)", color: "#f87171" }}>
                  <div className="text-[9px] opacity-40 font-medium tracking-[0.3em]">MANUAL</div>
                  ✦ CLOSE BETTING
                </button>
              </div>

              <div className="rounded-2xl p-3 bg-black/40 border border-white/5 shrink-0">
                <div className="text-[8px] text-white/20 uppercase tracking-[0.3em] mb-2 text-center">Trigger Result</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["ANDAR", "BAHAR"] as const).map(outcome => (
                    <button key={outcome}
                      onClick={() => setConfirmModal({ open: true, outcome })}
                      disabled={gameState?.betting_status !== "CLOSED"}
                      className="py-3 rounded-xl font-black text-xs uppercase tracking-[0.1em] transition-all disabled:opacity-10 relative overflow-hidden group border active:scale-95"
                      style={{
                        background: outcome === "ANDAR" ? "linear-gradient(135deg, #c0392b, #7b241c)" : "linear-gradient(135deg, #1a3a4a, #0d2233)",
                        borderColor: "rgba(255,255,255,0.1)",
                      }}>
                      <div className="text-white group-hover:scale-110 transition-all duration-300">{outcome}</div>
                      {gameState?.result === outcome && (
                        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-white/80" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* COLUMN 3: The Target Card */}
            <div className="col-span-2 flex flex-col items-center justify-center bg-white/2 rounded-2xl border border-white/5 p-4 shadow-inner">
              <div className="text-center w-full">
                <div className="text-[10px] text-amber-500 font-black uppercase tracking-[0.4em] mb-6">Target Joker</div>

                {selectedCard ? (
                  <div className="relative group mx-auto">
                    <div className="absolute -inset-6 bg-amber-400/20 blur-[40px] rounded-full animate-pulse group-hover:bg-amber-400/30" />
                    <div className="relative w-24 h-36 bg-white rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.9)] border-[6px] border-amber-400 flex flex-col items-center justify-center overflow-hidden transition-all duration-500 transform hover:scale-110"
                      style={{ boxShadow: "0 0 30px rgba(245,158,11,0.6), inset 0 0 20px rgba(245,158,11,0.4)" }}>
                      {(() => {
                        const suit = SUITS.find(s => selectedCard.includes(s.sym));
                        const val = selectedCard.replace(suit?.sym || "", "");
                        return <>
                          <div className="absolute top-2 left-2 font-black text-xl leading-none" style={{ color: suit?.color }}>{val}</div>
                          <div className="text-5xl drop-shadow-md select-none" style={{ color: suit?.color }}>{suit?.sym}</div>
                          <div className="absolute bottom-2 right-2 font-black text-xl leading-none rotate-180" style={{ color: suit?.color }}>{val}</div>
                          <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent pointer-events-none" />
                        </>;
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="w-24 h-36 mx-auto rounded-xl border-[3px] border-dashed border-white/10 flex items-center justify-center bg-black/40 transition-colors">
                    <div className="text-[9px] text-white/10 font-black uppercase tracking-widest text-center px-2 leading-relaxed">Select Card<br />to Start</div>
                  </div>
                )}

                <div className="mt-8">
                  {selectedCard ? (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 shadow-lg">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      <span className="text-[9px] font-black text-amber-400 tracking-[0.2em] uppercase">{selectedCard} IS LIVE</span>
                    </div>
                  ) : (
                    <div className="text-[9px] text-white/20 font-bold uppercase tracking-widest italic">Waiting...</div>
                  )}
                </div>
              </div>
            </div>

            {/* COLUMN 4: Card Selection Grid */}
            <div className="col-span-4 bg-black/40 rounded-2xl p-4 border border-white/10 flex flex-col shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Set Target Card</span>
                <Badge variant="outline" className="text-[8px] bg-white/5 border-white/10 text-white/30 uppercase px-1.5 py-0 h-4">Real-time</Badge>
              </div>

              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {SUITS.map(suit => (
                  <div key={suit.name} className="flex flex-col">
                    <div className="flex items-center gap-1.5 mb-1.5 px-1">
                      <span className="text-lg leading-none" style={{ color: suit.color === "#e74c3c" ? "#f87171" : "white" }}>{suit.sym}</span>
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/20">{suit.name}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {VALUES.map(val => {
                        const card = `${val}${suit.sym}`;
                        const isSelected = selectedCard === card;
                        return (
                          <button key={card} onClick={() => handleCardSelect(card)}
                            className="relative aspect-[3/4] flex items-center justify-center rounded-lg text-xs font-black transition-all duration-300 border hover:border-white/30"
                            style={{
                              background: isSelected ? "white" : "rgba(255,255,255,0.02)",
                              borderColor: isSelected ? "#fbbf24" : "rgba(255,255,255,0.08)",
                              color: isSelected ? suit.color : (suit.color === "#e74c3c" ? "#f87171" : "rgba(255,255,255,0.3)"),
                              boxShadow: isSelected ? "0 0 20px rgba(251,191,36,0.6), 0 3px 10px rgba(0,0,0,0.5)" : "none",
                              transform: isSelected ? "scale(1.15) translateY(-1px)" : "none",
                              zIndex: isSelected ? 30 : 1,
                            }}>
                            {val}
                            {isSelected && <div className="absolute inset-0 bg-white/10 rounded-lg animate-pulse" />}
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

        {/* ── SECTION 2: ROOM MANAGEMENT (RESTORED TO PREVIOUS) ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 rounded-full bg-emerald-400" />
            <h2 className="text-xl font-black text-white tracking-widest uppercase">Room Management</h2>
            <span className="text-xs text-white/20 bg-white/5 rounded-full px-4 py-1 ml-2">
              {rooms.filter(r => r.status === "ONLINE" || r.status === "LIVE").length} active terminals
            </span>
          </div>

          <div className="rounded-3xl overflow-hidden bg-white/3 border border-white/10 backdrop-blur-sm shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {["Room", "Min Bet", "Max Bet", "Status", "Control"].map((h, i) => (
                      <th key={h} className={`py-4 px-6 text-[11px] font-black uppercase tracking-widest text-white/40 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rooms.map(room => (
                    <tr key={room.id} className="hover:bg-white/5 transition-all group">
                      <td className="py-4 px-6">
                        <div className="font-black text-white text-base group-hover:text-amber-400 transition-colors">{room.name}</div>
                        <div className="text-[11px] text-white/30 uppercase tracking-wider">{room.label}</div>
                      </td>
                      <td className="py-4 px-6 text-white/60 font-bold">₹{room.min_bet.toLocaleString()}</td>
                      <td className="py-4 px-6 text-white/60 font-bold">₹{room.max_bet.toLocaleString()}</td>
                      <td className="py-4 px-6">{roomStatusBadge(room.status)}</td>
                      <td className="py-4 px-6">
                        <div className="flex gap-2 justify-end flex-wrap">
                          {ROOM_STATUS_CYCLE.filter(s => s !== room.status).map(s => (
                            <button key={s} disabled={roomActionLoading === room.id} onClick={() => handleRoomStatus(room, s)}
                              className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all disabled:opacity-40
                                ${s === "LIVE" ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20" :
                                  s === "ONLINE" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20" :
                                    "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}>
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

        {/* ── SECTION 3: USER MANAGEMENT (RESTORED TO PREVIOUS) ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 rounded-full bg-blue-400" />
            <h2 className="text-xl font-black text-white tracking-widest uppercase">User Access & Controls</h2>
          </div>

          {/* User Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Players", value: stats.total, icon: <Users className="w-5 h-5 text-blue-400" />, color: "text-blue-400" },
              { label: "Pending Requests", value: stats.pending, icon: <Clock className="w-5 h-5 text-amber-400" />, color: "text-amber-400" },
              { label: "Approved Users", value: stats.approved, icon: <UserCheck className="w-5 h-5 text-emerald-400" />, color: "text-emerald-400" },
              { label: "Blocked Accounts", value: stats.blocked, icon: <UserX className="w-5 h-5 text-red-400" />, color: "text-red-400" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-5 bg-white/3 border border-white/10 shadow-xl">
                <div className="flex items-center justify-between mb-2">{s.icon}<div className="w-1.5 h-1.5 rounded-full bg-white/20" /></div>
                <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-white/30 uppercase tracking-[0.2em] mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Global Search & Filters */}
          <div className="rounded-2xl p-6 mb-6 bg-white/3 border border-white/10 backdrop-blur-md">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <Input placeholder="Search user ID, name or phone..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="pl-12 bg-black/20 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl focus:border-amber-500/40 transition-all font-medium" />
              </div>
              <div className="flex gap-2 p-1 bg-black/20 rounded-xl border border-white/5">
                {(["ALL", "PENDING", "APPROVED", "BLOCKED"] as StatusFilter[]).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all
                      ${filter === f ? "bg-amber-500/20 text-amber-400 shadow-lg scale-105" : "text-white/30 hover:text-white"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Users Main Table */}
          <div className="rounded-3xl overflow-hidden bg-white/3 border border-white/10 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {["Member", "Terminal/Phone", "Status", "Joined On", "Authorization"].map((h, i) => (
                      <th key={h} className={`py-4 px-6 text-[11px] font-black uppercase tracking-widest text-white/40 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {usersLoading ? (
                    <tr><td colSpan={5} className="text-center py-16 text-white/10 uppercase tracking-[0.3em] font-black">Decrypting Users...</td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-16 text-white/10 uppercase tracking-[0.3em] font-black">No Records Found</td></tr>
                  ) : filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-white/5 transition-all group">
                      <td className="py-4 px-6">
                        <div className="font-black text-white group-hover:text-amber-400 transition-colors uppercase tracking-wider">{user.name || "UNNAMED_ENTITY"}</div>
                        <div className="text-[10px] text-white/20 font-mono">{user.id.slice(0, 8)}...</div>
                      </td>
                      <td className="py-4 px-6 text-white/50 font-mono text-sm">{user.phone || "HIDDEN"}</td>
                      <td className="py-4 px-6">
                        {user.status === "PENDING" && <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/5 px-3 py-1 rounded-lg uppercase text-[9px] font-black italic">Awaiting Approval</Badge>}
                        {user.status === "APPROVED" && <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5 px-3 py-1 rounded-lg uppercase text-[9px] font-black">Verified User</Badge>}
                        {user.status === "BLOCKED" && <Badge variant="outline" className="border-red-500/40 text-red-400 bg-red-500/5 px-3 py-1 rounded-lg uppercase text-[9px] font-black italic">Terminal Blocked</Badge>}
                      </td>
                      <td className="py-4 px-6 text-white/30 text-xs font-bold">{new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                      <td className="py-4 px-6">
                        <div className="flex gap-2 justify-end">
                          {user.status !== "APPROVED" && (
                            <button onClick={() => handleUserAction(user.id, "APPROVED")} disabled={actionLoading === user.id}
                              className="bg-emerald-500 text-black font-black text-[10px] uppercase px-4 py-2 rounded-xl hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50">
                              Approve
                            </button>
                          )}
                          {user.status !== "BLOCKED" && (
                            <button onClick={() => handleUserAction(user.id, "BLOCKED")} disabled={actionLoading === user.id}
                              className="border border-red-500/30 text-red-500 font-black text-[10px] uppercase px-4 py-2 rounded-xl hover:bg-red-500/10 transition-all active:scale-95 disabled:opacity-50">
                              Block
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!usersLoading && filteredUsers.length > 0 && (
              <div className="py-4 text-center text-[11px] text-white/10 font-black uppercase tracking-[0.4em] bg-black/10">
                End of Records — Syncing {filteredUsers.length} Nodes
              </div>
            )}
          </div>
        </section>

        {/* ── FOOTER STATS BAR (PREVIOUS STYLE) ── */}
        <div className="rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between bg-white/3 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-8">
            {[
              { label: "House Edge", value: "2.5%", color: "text-amber-400" },
              { label: "RTP Rate", value: "97.5%", color: "text-emerald-400" },
              { label: "System Status", value: "STABLE", color: "text-blue-400" },
              { label: "Security", value: "SSL_ACTIVE", color: "text-emerald-400" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-[10px] text-white/20 uppercase tracking-widest">{s.label}:</span>
                <span className={`text-xs font-black ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-white/10 uppercase tracking-widest font-black italic">Royal Star Premium Admin Core v2.4.0</div>
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
