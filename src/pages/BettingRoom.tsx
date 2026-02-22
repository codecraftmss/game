import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logout } from "@/lib/auth";
import { ArrowLeft, Undo2 } from "lucide-react";
import VideoPlayer from "@/components/room/VideoPlayer";
import PortraitOverlay from "@/components/room/PortraitOverlay";

const CHIPS = [
    { value: 500, label: "500", color: "#e74c3c", shadow: "#c0392b" },
    { value: 1000, label: "1K", color: "#27ae60", shadow: "#1e8449" },
    { value: 2000, label: "2K", color: "#8e44ad", shadow: "#6c3483" },
    { value: 5000, label: "5K", color: "#d35400", shadow: "#a04000" },
    { value: 10000, label: "10K", color: "#2c3e50", shadow: "#1a252f" },
];

type BetEntry = { side: "andar" | "bahar"; amount: number };

type GameState = {
    betting_status: "OPEN" | "CLOSED";
    betting_phase: "1ST_BET" | "2ND_BET";
    result: "ANDAR" | "BAHAR" | null;
    target_card: string | null;
    current_round: number;
    is_live: boolean;
};

const BettingRoom = () => {
    const { roomId = "" } = useParams();
    const navigate = useNavigate();

    // Room info
    const [roomInfo, setRoomInfo] = useState({ name: "Table", minBet: 500, streamUrl: undefined as string | undefined });

    // Admin-controlled game state — use ref for subscription closure safety
    const [gameState, setGameState] = useState<GameState | null>(null);
    const gameStateRef = useRef<GameState | null>(null);
    gameStateRef.current = gameState;

    // Local betting state — use refs so subscription can read latest without re-subscribing
    const [balance, setBalance] = useState(36000);
    const balanceRef = useRef(36000);
    const [selectedChip, setSelectedChip] = useState<number>(500);
    const [betHistory, setBetHistory] = useState<BetEntry[]>([]);
    const betHistoryRef = useRef<BetEntry[]>([]);
    betHistoryRef.current = betHistory;
    const [betPlaced, setBetPlaced] = useState(false);
    const betPlacedRef = useRef(false);
    betPlacedRef.current = betPlaced;

    const [showResultPopup, setShowResultPopup] = useState(false);
    const [localResult, setLocalResult] = useState<"ANDAR" | "BAHAR" | null>(null);
    const [isPortrait, setIsPortrait] = useState(false);
    const [showJoker, setShowJoker] = useState(false);

    // Derived from state (not ref — for rendering)
    const andarBets = betHistory.filter(b => b.side === "andar");
    const baharBets = betHistory.filter(b => b.side === "bahar");
    const andarTotal = andarBets.reduce((s, v) => s + v.amount, 0);
    const baharTotal = baharBets.reduce((s, v) => s + v.amount, 0);
    const totalBet = andarTotal + baharTotal;
    const bettingOpen = gameState?.betting_status === "OPEN";
    const roundId = `R${gameState?.current_round ?? 1}`;

    // ── Fetch room ──
    useEffect(() => {
        if (!roomId) return;
        const fetchRoom = async () => {
            const { data } = await supabase
                .from("rooms").select("name, min_bet, status, stream_url").eq("id", roomId).maybeSingle();
            if (!data || (data.status !== "ONLINE" && data.status !== "LIVE")) {
                navigate("/dashboard");
            } else {
                setRoomInfo({ name: data.name, minBet: Number(data.min_bet), streamUrl: data.stream_url ?? undefined });
            }
        };
        fetchRoom();
    }, [roomId, navigate]);

    // ── Fetch initial game state ──
    useEffect(() => {
        if (!roomId) return;
        supabase.from("game_state").select("*").eq("room_id", roomId).maybeSingle()
            .then(({ data }) => { if (data) setGameState(data as GameState); });
    }, [roomId]);

    // ── Real-time game state — stable subscription (no gameState in deps) ──
    useEffect(() => {
        if (!roomId) return;

        const channel = supabase
            .channel(`room-gs-${roomId}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "game_state" },
                (payload) => {
                    const incoming = payload.new as any;
                    // Only handle updates for THIS room
                    if (incoming.room_id !== roomId) return;

                    const newState = incoming as GameState;
                    const prev = gameStateRef.current;

                    // ── Result triggered by admin ──
                    if (newState.result && newState.result !== prev?.result) {
                        const winSide = newState.result.toLowerCase() as "andar" | "bahar";
                        const currentBets = betHistoryRef.current;
                        const placed = betPlacedRef.current;
                        const myAndar = currentBets.filter(b => b.side === "andar").reduce((s, v) => s + v.amount, 0);
                        const myBahar = currentBets.filter(b => b.side === "bahar").reduce((s, v) => s + v.amount, 0);

                        if (placed) {
                            const win = winSide === "andar" ? myAndar : myBahar;
                            const lose = winSide === "andar" ? myBahar : myAndar;
                            if (win > 0) { setBalance(b => { balanceRef.current = b + win * 2; return b + win * 2; }); }
                            if (lose > 0) { setBalance(b => { balanceRef.current = b - lose; return b - lose; }); }
                        }

                        setLocalResult(newState.result);
                        setShowResultPopup(true);
                        setTimeout(() => setShowResultPopup(false), 5000);
                    }

                    // ── Betting re-opened (new round) ──
                    if (newState.betting_status === "OPEN" && prev?.betting_status === "CLOSED") {
                        setBetHistory([]);
                        betHistoryRef.current = [];
                        setBetPlaced(false);
                        betPlacedRef.current = false;
                        setLocalResult(null);
                        setShowResultPopup(false);
                        setShowJoker(false);
                    }

                    setGameState(newState);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
        // ⚠️ roomId only — gameState intentionally excluded to prevent re-subscription
    }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Auth check ──
    useEffect(() => {
        const check = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { navigate("/login"); return; }
            const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
            if (!profile || profile.status !== "APPROVED") { await logout(); navigate("/login"); }
        };
        check();
    }, [navigate]);

    // ── Portrait detection ──
    useEffect(() => {
        const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
        check();
        window.addEventListener("resize", check);
        window.addEventListener("orientationchange", check);
        return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };
    }, []);

    // ── Betting actions ──
    const handleBet = (side: "andar" | "bahar") => {
        if (!bettingOpen || betPlaced || balance < selectedChip) return;
        setBetHistory(h => { const next = [...h, { side, amount: selectedChip }]; betHistoryRef.current = next; return next; });
        setBalance(b => { balanceRef.current = b - selectedChip; return b - selectedChip; });
    };

    const handleUndo = () => {
        if (betHistory.length === 0 || !bettingOpen) return;
        const last = betHistory[betHistory.length - 1];
        setBetHistory(h => { const next = h.slice(0, -1); betHistoryRef.current = next; return next; });
        setBalance(b => { balanceRef.current = b + last.amount; return b + last.amount; });
    };

    const handlePlaceBet = () => {
        if (!bettingOpen || totalBet === 0 || betPlaced) return;
        setBetPlaced(true);
        betPlacedRef.current = true;
    };

    // Parse joker card
    const jokerCard = gameState?.target_card ? (() => {
        const sym = gameState.target_card as string;
        const isRed = sym.includes("♥") || sym.includes("♦");
        return { display: sym, color: isRed ? "#e74c3c" : "#1a1a2e" };
    })() : null;

    return (
        <div className="room-root">
            {isPortrait && <PortraitOverlay />}
            <div className="absolute inset-0 z-0">
                <VideoPlayer streamUrl={roomInfo.streamUrl} />
            </div>

            {/* TOP BAR */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/70 to-transparent">
                <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1 text-white/70 hover:text-white text-xs">
                    <ArrowLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">Lobby</span>
                </button>
                <div className="flex items-center gap-1.5">
                    <img src="/card_fan_logo.png" alt="" className="w-5 h-auto" />
                    <span className="text-amber-400 font-bold text-xs tracking-wider">{roomInfo.name}</span>
                    {gameState?.betting_phase && (
                        <span className="text-white/30 text-[9px] border border-white/10 rounded px-1.5 py-0.5">{gameState.betting_phase}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-white/40 text-[10px] font-mono">{roundId}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${bettingOpen
                        ? "bg-emerald-500/30 text-emerald-400 border border-emerald-500/40"
                        : "bg-red-500/30 text-red-400 border border-red-500/40"
                        }`}>
                        {bettingOpen ? "OPEN" : "CLOSED"}
                    </span>
                </div>
            </div>

            {/* LEFT PANEL */}
            <div className="absolute left-0 top-0 bottom-0 z-20 flex flex-col justify-between py-10 px-1.5 w-[90px] sm:w-[110px] bg-gradient-to-r from-black/80 to-transparent">
                <div className="space-y-1">
                    <div className="text-[8px] text-white/40 uppercase tracking-wider">Balance</div>
                    <div className="text-amber-400 font-black text-sm leading-tight">₹{balance.toLocaleString()}</div>
                    <div className="text-[8px] text-white/30 mt-1">Min: ₹{roomInfo.minBet.toLocaleString()}</div>
                </div>

                {/* Chips */}
                <div className="flex flex-col items-center gap-1.5">
                    {CHIPS.map(chip => {
                        const isSelected = selectedChip === chip.value;
                        return (
                            <button key={chip.value}
                                onClick={() => bettingOpen && !betPlaced && setSelectedChip(chip.value)}
                                disabled={!bettingOpen || betPlaced}
                                className="relative flex items-center justify-center rounded-full font-black text-white transition-all duration-100 select-none"
                                style={{
                                    width: isSelected ? 44 : 38, height: isSelected ? 44 : 38,
                                    background: `radial-gradient(circle at 35% 35%, ${chip.color}ee, ${chip.shadow})`,
                                    boxShadow: isSelected
                                        ? `0 0 0 2.5px #f1c40f, 0 0 12px #f1c40f88`
                                        : `0 3px 6px ${chip.shadow}99, inset 0 1px 0 rgba(255,255,255,0.2)`,
                                    border: `1.5px dashed rgba(255,255,255,0.25)`,
                                    fontSize: chip.value >= 10000 ? 9 : 10,
                                    opacity: (!bettingOpen || betPlaced) ? 0.4 : 1,
                                }}>
                                <div className="absolute inset-[5px] rounded-full border border-white/20 flex items-center justify-center">
                                    <span className="font-black leading-none">{chip.label}</span>
                                </div>
                                {isSelected && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border border-black" />}
                            </button>
                        );
                    })}
                </div>

                {/* Controls */}
                <div className="space-y-1.5">
                    <button onClick={handleUndo} disabled={betHistory.length === 0 || !bettingOpen}
                        className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all
              ${betHistory.length > 0 && bettingOpen
                                ? "bg-red-600/80 text-white hover:bg-red-600"
                                : "bg-white/5 text-white/20 cursor-not-allowed"}`}>
                        <Undo2 className="w-2.5 h-2.5" />Undo
                    </button>
                    <button onClick={handlePlaceBet} disabled={!bettingOpen || totalBet === 0 || betPlaced}
                        className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all
              ${bettingOpen && totalBet > 0 && !betPlaced
                                ? "bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-900/50"
                                : "bg-white/5 text-white/20 cursor-not-allowed"}`}>
                        {betPlaced ? "✓ Placed" : "Place Bet"}
                    </button>
                    <div className="text-[8px] text-white/50 space-y-0.5 pt-0.5">
                        <div className="flex justify-between"><span>Andar</span><span className="text-white font-bold">₹{andarTotal.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span>Bahar</span><span className="text-white font-bold">₹{baharTotal.toLocaleString()}</span></div>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="absolute right-0 top-0 bottom-0 z-20 flex flex-col items-center justify-between py-10 px-1.5 w-[60px] bg-gradient-to-l from-black/70 to-transparent">
                <div className="text-white/50 font-bold tracking-widest uppercase"
                    style={{ fontSize: 9, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                    {roomInfo.name}
                </div>
                {/* Joker Toggle */}
                <button onClick={() => setShowJoker(v => !v)} className="flex flex-col items-center gap-1" title="Show Joker">
                    <div className={`w-10 h-14 rounded-lg flex flex-col items-center justify-center border-2 transition-all duration-200 shadow-lg
            ${showJoker ? "bg-amber-400 border-amber-300 scale-105" : "bg-amber-400/20 border-amber-400/50 hover:bg-amber-400/40 hover:scale-105"}`}>
                        {showJoker && jokerCard
                            ? <span className="font-black text-xs text-center leading-tight" style={{ color: jokerCard.color }}>{jokerCard.display}</span>
                            : <span className="text-amber-400 font-black text-[10px] tracking-tight text-center leading-tight">JOKER</span>
                        }
                    </div>
                    <span className="text-[8px] text-amber-400/70 font-bold uppercase tracking-wider">{showJoker ? "Hide" : "Show"}</span>
                </button>
                <div />
            </div>

            {/* JOKER BADGE FLOAT */}
            {showJoker && jokerCard && (
                <div className="absolute right-[70px] bottom-[80px] z-30 joker-float-badge">
                    <div className="relative bg-white rounded-xl shadow-2xl flex flex-col items-center justify-center px-3 py-2 border-2 border-amber-400"
                        style={{ minWidth: 56, minHeight: 72 }}>
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full tracking-wider whitespace-nowrap">JOKER</div>
                        <span className="font-black text-lg" style={{ color: jokerCard.color }}>{jokerCard.display}</span>
                    </div>
                </div>
            )}

            {/* ANDAR / BAHAR BUTTONS */}
            <div className="absolute bottom-0 left-[90px] right-[60px] z-20 flex items-end pb-3 sm:pb-4 gap-2 sm:gap-3 px-2">
                {(["andar", "bahar"] as const).map(side => {
                    const total = side === "andar" ? andarTotal : baharTotal;
                    const bets = side === "andar" ? andarBets : baharBets;
                    const isWin = localResult?.toLowerCase() === side;
                    return (
                        <button key={side} onClick={() => handleBet(side)}
                            disabled={!bettingOpen || betPlaced}
                            className={`relative flex-1 rounded-xl overflow-hidden transition-all duration-150 select-none
                ${!bettingOpen || betPlaced ? "opacity-50 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.97]"}
                ${isWin ? "zone-win-glow" : ""}`}
                            style={{
                                background: side === "andar"
                                    ? "linear-gradient(160deg,#c0392b,#7b241c)"
                                    : "linear-gradient(160deg,#1a3a4a,#0d2233)",
                                border: isWin
                                    ? `2px solid ${side === "andar" ? "#f1948a" : "#7fb3d3"}`
                                    : "2px solid rgba(255,255,255,0.1)",
                                padding: "8px 10px",
                            }}>
                            <div className="text-white font-black text-sm tracking-[0.12em] text-center uppercase">{side}</div>
                            {total > 0 && <div className="text-white/80 text-[9px] text-center font-bold mt-0.5">₹{total.toLocaleString()}</div>}
                            {bets.length > 0 && (
                                <div className="flex justify-center mt-1">
                                    <div className="relative" style={{ height: 18 }}>
                                        {bets.slice(-4).map((b, i) => (
                                            <div key={i} className="absolute rounded-full border border-white/20"
                                                style={{ width: 16, height: 16, background: CHIPS.find(c => c.value === b.amount)?.color || "#555", left: i * 6, top: 0, zIndex: i }} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {isWin && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
                                    <span className="text-white font-black text-base">🏆</span>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* BETTING CLOSED OVERLAY */}
            {!bettingOpen && !localResult && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="betting-closed-box text-center">
                        <div className="text-3xl mb-2">🚫</div>
                        <div className="text-white font-black text-base tracking-widest uppercase">Betting Closed</div>
                        <div className="text-white/40 text-xs mt-1">Waiting for result...</div>
                        <div className="flex gap-1 mt-3 justify-center">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* RESULT POPUP */}
            {showResultPopup && localResult && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 cursor-pointer" onClick={() => setShowResultPopup(false)}>
                    <div className={`result-popup ${(localResult === "ANDAR" && andarTotal > 0) || (localResult === "BAHAR" && baharTotal > 0)
                        ? "result-win" : "result-loss"}`}>
                        <div className="text-4xl mb-2">
                            {(localResult === "ANDAR" && andarTotal > 0) || (localResult === "BAHAR" && baharTotal > 0) ? "🏆" : "😔"}
                        </div>
                        <div className="text-white font-black text-xl uppercase tracking-wider mb-1">
                            {betPlaced
                                ? ((localResult === "ANDAR" && andarTotal > 0) || (localResult === "BAHAR" && baharTotal > 0)
                                    ? "You Win!" : "Better Luck!")
                                : `${localResult} Wins!`}
                        </div>
                        <div className="text-white/50 text-sm">{localResult.toLowerCase()} wins this round</div>
                        <div className="text-white/30 text-xs mt-3">Tap to dismiss</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BettingRoom;
