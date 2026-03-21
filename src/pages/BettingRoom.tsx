import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logout } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import VideoPlayer from "@/components/room/VideoPlayer";
import PortraitOverlay from "@/components/room/PortraitOverlay";

const CHIPS = [
    { value: 500, label: "500", color: "#c0392b", shadow: "#922b21" },
    { value: 1000, label: "1K", color: "#27ae60", shadow: "#1e8449" },
    { value: 2000, label: "2K", color: "#8e44ad", shadow: "#6c3483" },
    { value: 5000, label: "5K", color: "#d35400", shadow: "#a04000" },
    { value: 10000, label: "10K", color: "#d4ac0d", shadow: "#9a7d0a" },
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
    const { toast } = useToast();

    const [roomInfo, setRoomInfo] = useState({ name: "Table", minBet: 500, streamUrl: undefined as string | undefined });
    const [roomLoading, setRoomLoading] = useState(true);

    const [gameState, setGameState] = useState<GameState | null>(null);
    const gameStateRef = useRef<GameState | null>(null);
    gameStateRef.current = gameState;

    const [balance, setBalance] = useState(0);
    const balanceRef = useRef(0);
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

    // Track first and second bet totals per phase
    const [firstBetTotal, setFirstBetTotal] = useState(0);
    const [secondBetTotal, setSecondBetTotal] = useState(0);

    // Round history for the A/B dots indicator
    const [roundHistory, setRoundHistory] = useState<Array<{ result: "ANDAR" | "BAHAR" }>>([]);

    const andarBets = betHistory.filter(b => b.side === "andar");
    const baharBets = betHistory.filter(b => b.side === "bahar");
    const andarTotal = andarBets.reduce((s, v) => s + v.amount, 0);
    const baharTotal = baharBets.reduce((s, v) => s + v.amount, 0);
    const totalBet = andarTotal + baharTotal;
    const bettingOpen = gameState?.betting_status === "OPEN";

    // ── Fetch room ──
    useEffect(() => {
        if (!roomId) return;
        const fetchRoom = async () => {
            const { data, error } = await supabase
                .from("rooms").select("name, min_bet, status, stream_url").eq("id", roomId).maybeSingle();
            if (error) { console.error("Room fetch error:", error.message); setRoomLoading(false); return; }
            if (!data || data.status !== "ONLINE") { navigate("/dashboard"); }
            else { setRoomInfo({ name: data.name, minBet: Number(data.min_bet), streamUrl: data.stream_url ?? undefined }); setRoomLoading(false); }
        };
        fetchRoom();
    }, [roomId, navigate]);

    // ── Fetch initial game state ──
    useEffect(() => {
        if (!roomId) return;
        supabase.from("game_state").select("*").eq("room_id", roomId).maybeSingle()
            .then(({ data }) => { if (data) setGameState(data as GameState); });
    }, [roomId]);

    // ── Fetch + subscribe to round history for A/B scoreboard ──
    useEffect(() => {
        if (!roomId) return;
        // Initial fetch (latest 13 rounds, oldest first)
        supabase.from("game_history")
            .select("result")
            .eq("room_id", roomId)
            .not("result", "is", null)
            .order("created_at", { ascending: false })
            .limit(13)
            .then(({ data }) => {
                if (data) setRoundHistory([...data].reverse() as Array<{ result: "ANDAR" | "BAHAR" }>);
            });

        // Subscribe to new inserts (each new round result)
        const ch = supabase
            .channel(`room-history-${roomId}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "game_history",
                filter: `room_id=eq.${roomId}`,
            }, (payload) => {
                const newEntry = payload.new as { result: "ANDAR" | "BAHAR" };
                if (newEntry.result) {
                    setRoundHistory(prev => {
                        const next = [...prev, { result: newEntry.result }];
                        return next.slice(-13); // keep last 13
                    });
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [roomId]);


    // ── Real-time game state ──
    useEffect(() => {
        if (!roomId) return;

        const channel = supabase
            .channel(`room-gs-${roomId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "game_state",
                    filter: `room_id=eq.${roomId}`,   // server-side filter — required when RLS is enabled
                },
                (payload) => {
                    const newState = payload.new as GameState;
                    const prev = gameStateRef.current;

                    if (newState.result && newState.result !== prev?.result) {
                        setLocalResult(newState.result);
                        setShowResultPopup(true);
                        setTimeout(() => setShowResultPopup(false), 5000);
                    }
                    if (newState.betting_status === "OPEN" && prev?.betting_status === "CLOSED") {
                        setBetHistory([]); betHistoryRef.current = [];
                        setBetPlaced(false); betPlacedRef.current = false;
                        setLocalResult(null); setShowResultPopup(false);
                        setFirstBetTotal(0); setSecondBetTotal(0);
                    }
                    setGameState(newState);
                }
            )
            .subscribe((status) => {
                // If subscription fails, re-fetch as fallback
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    console.warn("Realtime issue:", status, "— polling game state");
                    supabase.from("game_state").select("*").eq("room_id", roomId).maybeSingle()
                        .then(({ data }) => { if (data) setGameState(data as GameState); });
                }
            });

        return () => { supabase.removeChannel(channel); };
    }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Polling fallback (every 5s) — catches updates if WebSocket is stale ──
    useEffect(() => {
        if (!roomId) return;
        const poll = setInterval(async () => {
            const { data } = await supabase.from("game_state").select("*").eq("room_id", roomId).maybeSingle();
            if (!data) return;
            const incoming = data as GameState;
            const prev = gameStateRef.current;

            // Only update if something actually changed
            if (
                incoming.betting_status !== prev?.betting_status ||
                incoming.betting_phase !== prev?.betting_phase ||
                incoming.result !== prev?.result ||
                incoming.target_card !== prev?.target_card ||
                incoming.current_round !== prev?.current_round
            ) {
                if (incoming.result && incoming.result !== prev?.result) {
                    setLocalResult(incoming.result);
                    setShowResultPopup(true);
                    setTimeout(() => setShowResultPopup(false), 5000);
                }
                if (incoming.betting_status === "OPEN" && prev?.betting_status === "CLOSED") {
                    setBetHistory([]); betHistoryRef.current = [];
                    setBetPlaced(false); betPlacedRef.current = false;
                    setLocalResult(null); setShowResultPopup(false);
                    setFirstBetTotal(0); setSecondBetTotal(0);
                }
                setGameState(incoming);
            }
        }, 5000); // poll every 5 seconds
        return () => clearInterval(poll);
    }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Auth & Profile check ──
    useEffect(() => {
        const check = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { navigate("/login"); return; }
            const { data: profile } = await (supabase.from("profiles").select("*").eq("id", user.id).maybeSingle() as any);
            if (!profile || profile.status !== "APPROVED") { await logout(); navigate("/login"); }
            else { setBalance(profile.token_balance || 0); balanceRef.current = profile.token_balance || 0; }
        };
        check();
    }, [navigate]);

    // ── Real-time balance sync ──
    useEffect(() => {
        let authUser: any;
        supabase.auth.getUser().then(({ data }) => { authUser = data.user; });
        const channel = supabase
            .channel(`player-profile-${roomId}`)
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) => {
                if (authUser && p.new.id === authUser.id) {
                    setBalance((p.new as any).token_balance || 0);
                    balanceRef.current = (p.new as any).token_balance || 0;
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [roomId]);

    // ── Portrait detection ──
    useEffect(() => {
        const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
        check();
        window.addEventListener("resize", check);
        window.addEventListener("orientationchange", check);
        return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };
    }, []);

    // ── Fullscreen ──
    const toggleFullscreen = () => {
        const elem = document.documentElement as any;
        const doc = document as any;
        const isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

        if (!isFullscreen) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch((err: any) => console.error(err));
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            if (doc.exitFullscreen) {
                doc.exitFullscreen();
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
    };

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

    const handlePlaceBet = async () => {
        if (!bettingOpen || totalBet === 0 || betPlaced) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (andarTotal > 0) {
            const { data, error } = await (supabase.rpc("place_bet" as any, {
                p_user_id: user.id, p_room_id: roomId,
                p_round_number: gameState?.current_round || 1, p_side: "ANDAR", p_amount: andarTotal
            }) as any);
            if (error || !(data as any).success) {
                toast({ title: "Bet Failed", description: error?.message || (data as any)?.message, variant: "destructive" });
                return;
            }
        }
        if (baharTotal > 0) {
            const { data, error } = await (supabase.rpc("place_bet" as any, {
                p_user_id: user.id, p_room_id: roomId,
                p_round_number: gameState?.current_round || 1, p_side: "BAHAR", p_amount: baharTotal
            }) as any);
            if (error || !(data as any).success) {
                toast({ title: "Bet Failed", description: error?.message || (data as any)?.message, variant: "destructive" });
                return;
            }
        }

        if (gameState?.betting_phase === "1ST_BET") setFirstBetTotal(totalBet);
        else if (gameState?.betting_phase === "2ND_BET") setSecondBetTotal(totalBet);

        setBetPlaced(true); betPlacedRef.current = true;
        toast({ title: "Bets Placed!", description: `Total: ₹${totalBet.toLocaleString()}` });
    };

    // Parse joker card
    const SUIT_KEY_MAP: Record<string, string> = { "♥": "hearts", "♦": "diamonds", "♣": "clubs", "♠": "spades" };
    const FACE_IMG_MAP: Record<string, string> = { A: "ace", J: "jack", Q: "queen", K: "king" };
    const jokerCard = gameState?.target_card ? (() => {
        const sym = gameState.target_card as string;
        const suitSym = sym.match(/[♥♦♣♠]/)?.[0] || "";
        const val = sym.replace(suitSym, "");
        const isRed = suitSym === "♥" || suitSym === "♦";
        const suitKey = SUIT_KEY_MAP[suitSym] || "";
        const facePrefix = FACE_IMG_MAP[val];
        const faceImg = facePrefix && suitKey ? `/${facePrefix}_${suitKey}.png` : null;
        return { display: sym, val, suitSym, color: isRed ? "#e74c3c" : "#1a1a2e", faceImg };
    })() : null;

    if (roomLoading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d", width: "100vw", height: "100vh" }}>
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🃏</div>
                    <div style={{ fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase" }}>Loading Table…</div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#000", overflow: "hidden", fontFamily: "'Inter', sans-serif" }}>
            {isPortrait && <PortraitOverlay />}

            {/* ── VIDEO BACKGROUND ── */}
            <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <VideoPlayer streamUrl={roomInfo.streamUrl} />
            </div>

            {/* ── TOP BAR ── */}
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 12px",
                background: "linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)",
            }}>
                {/* Left: LIVE + Room Name */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: "#c0392b", borderRadius: 4,
                        padding: "2px 7px", fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.1em"
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                        LIVE
                    </div>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
                        {roomInfo.name.toUpperCase()} : MIN BET {roomInfo.minBet.toLocaleString()}
                    </span>
                </div>

                {/* Right: Icons */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 18, display: "flex", alignItems: "center" }} title="History">
                        🕐
                    </button>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 18, display: "flex", alignItems: "center" }} title="Volume">
                        🔊
                    </button>
                    <button onClick={toggleFullscreen} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 18, display: "flex", alignItems: "center" }} title="Fullscreen">
                        ⛶
                    </button>
                </div>
            </div>

            {/* ── BOTTOM CONTROL PANEL (LEFT SIDE) ── */}
            <div className="br-left-panel">
                {/* Logo */}
                <div style={{ display: "flex", alignItems: "center", marginBottom: -70 }}>
                    <img
                        src="/royalstar_logo.png"
                        alt="Royal Star Casino"
                        style={{ height: 200, width: "auto", objectFit: "contain" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                </div>

                {/* Chip Row */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {CHIPS.map(chip => {
                        const isSel = selectedChip === chip.value;
                        return (
                            <button key={chip.value}
                                onClick={() => bettingOpen && !betPlaced && setSelectedChip(chip.value)}
                                disabled={!bettingOpen || betPlaced}
                                style={{
                                    width: isSel ? 42 : 36, height: isSel ? 42 : 36,
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle at 35% 30%, ${chip.color}dd, ${chip.shadow})`,
                                    border: isSel ? "2.5px solid #f1c40f" : "1.5px dashed rgba(255,255,255,0.3)",
                                    boxShadow: isSel ? "0 0 10px #f1c40f99" : `0 3px 8px ${chip.shadow}88`,
                                    color: "#fff", fontWeight: 900,
                                    fontSize: chip.value >= 10000 ? 8 : 9,
                                    cursor: bettingOpen && !betPlaced ? "pointer" : "not-allowed",
                                    opacity: !bettingOpen || betPlaced ? 0.45 : 1,
                                    position: "relative",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0,
                                    transition: "all 0.12s ease",
                                }}>
                                <div style={{
                                    position: "absolute", inset: 4, borderRadius: "50%",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <span style={{ fontWeight: 900, fontSize: chip.value >= 10000 ? 8 : 9 }}>{chip.label}</span>
                                </div>
                                {isSel && <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, background: "#f1c40f", borderRadius: "50%", border: "1px solid #000" }} />}
                            </button>
                        );
                    })}
                </div>

                {/* UNDO + PLACE BET buttons */}
                <div style={{ display: "flex", gap: 6, width: "100%" }}>
                    <button onClick={handleUndo}
                        disabled={betHistory.length === 0 || !bettingOpen}
                        style={{
                            flex: 1, padding: "7px 0",
                            borderRadius: 6, border: "none", cursor: betHistory.length > 0 && bettingOpen ? "pointer" : "not-allowed",
                            background: betHistory.length > 0 && bettingOpen ? "#8b1a1a" : "rgba(255,255,255,0.08)",
                            color: betHistory.length > 0 && bettingOpen ? "#fff" : "rgba(255,255,255,0.25)",
                            fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                            opacity: betHistory.length > 0 && bettingOpen ? 1 : 0.6,
                        }}>
                        UNDO
                    </button>
                    <button onClick={handlePlaceBet}
                        disabled={!bettingOpen || totalBet === 0 || betPlaced}
                        style={{
                            flex: 1.4, padding: "7px 0",
                            borderRadius: 6, border: "none",
                            cursor: bettingOpen && totalBet > 0 && !betPlaced ? "pointer" : "not-allowed",
                            background: bettingOpen && totalBet > 0 && !betPlaced
                                ? "linear-gradient(135deg, #27ae60, #1e8449)"
                                : "rgba(255,255,255,0.08)",
                            color: bettingOpen && totalBet > 0 && !betPlaced ? "#fff" : "rgba(255,255,255,0.25)",
                            fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                        }}>
                        {betPlaced ? "✓ PLACED" : "PLACE BET"}
                    </button>
                </div>

                {/* Balance + Bet Info Row */}
                <div style={{ display: "flex", gap: 6, width: "100%" }}>
                    <div style={{
                        flex: 1, background: "rgba(30,30,30,0.85)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 6, padding: "5px 8px",
                    }}>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>BALANCE:</div>
                        <div style={{ color: "#fff", fontWeight: 800, fontSize: 12, marginTop: 1 }}>₹{balance.toLocaleString()}</div>
                    </div>
                    <div style={{
                        flex: 1.3, background: "rgba(30,30,30,0.85)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 6, padding: "5px 8px",
                    }}>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>FIRST BET: ₹{firstBetTotal > 0 ? firstBetTotal.toLocaleString() : "0"}</div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>SECOND BET: ₹{secondBetTotal > 0 ? secondBetTotal.toLocaleString() : "0"}</div>
                    </div>
                </div>
            </div>

            {/* ── ANDAR / BAHAR BETTING AREA (CENTER-BOTTOM) ── */}
            <div className="br-center-panel">
                <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>

                    {/* ANDAR */}
                    <button onClick={() => handleBet("andar")}
                        disabled={!bettingOpen || betPlaced}
                        style={{
                            flex: 1,
                            borderRadius: "10px 10px 0 0",
                            border: "2px solid #629ca7",
                            borderBottom: "1px solid #629ca7",
                            background: "linear-gradient(135deg, #3c7280 0%, #2b5460 100%)",
                            padding: "8px 14px",
                            cursor: bettingOpen && !betPlaced ? "pointer" : "not-allowed",
                            opacity: !bettingOpen || betPlaced ? 0.55 : 1,
                            position: "relative", overflow: "hidden",
                            boxShadow: localResult?.toLowerCase() === "andar" ? "0 0 20px rgba(98,156,167,0.8)" : "inset 0 0 30px rgba(0,0,0,0.3)",
                            transition: "all 0.15s ease",
                        }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", height: "100%", position: "relative", zIndex: 1 }}>
                            <span style={{ color: "#fff", fontWeight: 900, fontSize: 22, letterSpacing: "0.05em", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>ANDAR</span>
                            <span style={{ color: "#a4d4dc", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", marginTop: 1 }}>0.9:1</span>
                        </div>
                        {/* Chip stack */}
                        {andarBets.length > 0 && (
                            <div style={{ position: "absolute", left: 120, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
                                <div style={{ position: "relative", height: 28, width: 28 }}>
                                    {andarBets.slice(-5).map((b, i) => (
                                        <div key={i} style={{
                                            position: "absolute", width: 28, height: 28, borderRadius: "50%",
                                            background: CHIPS.find(c => c.value === b.amount)?.color || "#555",
                                            border: "1px solid rgba(255,255,255,0.6)",
                                            left: i * 9, top: -i * 2, zIndex: i,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                            <span style={{ fontSize: 7, fontWeight: 900, color: "#fff" }}>{b.amount >= 1000 ? (b.amount / 1000) + "K" : b.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {andarTotal > 0 && (
                            <div style={{
                                position: "absolute", right: 100, top: "50%", transform: "translateY(-50%)",
                                background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "3px 7px"
                            }}>₹{andarTotal.toLocaleString()}</div>
                        )}
                        {localResult?.toLowerCase() === "andar" && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 90 }}>
                                <span style={{ fontSize: 28 }}>🏆</span>
                            </div>
                        )}
                    </button>

                    {/* BAHAR */}
                    <button onClick={() => handleBet("bahar")}
                        disabled={!bettingOpen || betPlaced}
                        style={{
                            flex: 1,
                            borderRadius: "0 0 10px 10px",
                            border: "2px solid #bc6941",
                            borderTop: "1px solid #bc6941",
                            background: "linear-gradient(135deg, #8f4f38 0%, #703726 100%)",
                            padding: "8px 14px",
                            cursor: bettingOpen && !betPlaced ? "pointer" : "not-allowed",
                            opacity: !bettingOpen || betPlaced ? 0.55 : 1,
                            position: "relative", overflow: "hidden",
                            boxShadow: localResult?.toLowerCase() === "bahar" ? "0 0 20px rgba(188,105,65,0.8)" : "inset 0 0 30px rgba(0,0,0,0.3)",
                            transition: "all 0.15s ease",
                        }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", height: "100%", position: "relative", zIndex: 1 }}>
                            <span style={{ color: "#fff", fontWeight: 900, fontSize: 22, letterSpacing: "0.05em", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>BAHAR</span>
                            <span style={{ color: "#dfa589", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", marginTop: 1 }}>1:1</span>
                        </div>
                        {baharBets.length > 0 && (
                            <div style={{ position: "absolute", left: 120, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
                                <div style={{ position: "relative", height: 28, width: 28 }}>
                                    {baharBets.slice(-5).map((b, i) => (
                                        <div key={i} style={{
                                            position: "absolute", width: 28, height: 28, borderRadius: "50%",
                                            background: CHIPS.find(c => c.value === b.amount)?.color || "#555",
                                            border: "1px solid rgba(255,255,255,0.6)",
                                            left: i * 9, top: -i * 2, zIndex: i,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                            <span style={{ fontSize: 7, fontWeight: 900, color: "#fff" }}>{b.amount >= 1000 ? (b.amount / 1000) + "K" : b.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {baharTotal > 0 && (
                            <div style={{
                                position: "absolute", right: 100, top: "50%", transform: "translateY(-50%)",
                                background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "3px 7px"
                            }}>₹{baharTotal.toLocaleString()}</div>
                        )}
                        {localResult?.toLowerCase() === "bahar" && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 90 }}>
                                <span style={{ fontSize: 28 }}>🏆</span>
                            </div>
                        )}
                    </button>

                    {/* Card Cutout (right side of ANDAR/BAHAR) */}
                    <div style={{
                        position: "absolute", right: -2, top: "50%", transform: "translateY(-50%)",
                        width: 88, height: 104,
                        background: "#111823",
                        borderRadius: "50% 0 0 50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        zIndex: 10,
                        boxShadow: "-8px 0 18px rgba(0,0,0,0.4)",
                    }}>
                        {/* Border arcs */}
                        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "50%", borderLeft: "2px solid #629ca7", borderTop: "2px solid #629ca7", borderRadius: "50% 0 0 0" }} />
                        <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "50%", borderLeft: "2px solid #bc6941", borderBottom: "2px solid #bc6941", borderRadius: "0 0 0 50%" }} />

                        {/* Card */}
                        <div style={{ marginLeft: 8, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2 }}>
                            {jokerCard ? (
                                <div style={{
                                    background: "#fff", borderRadius: 4,
                                    border: "1.5px solid #d4a017",
                                    boxShadow: "0 0 12px rgba(212,160,23,0.45)",
                                    width: 44, height: 62, overflow: "hidden",
                                }}>
                                    {jokerCard.faceImg ? (
                                        <img src={jokerCard.faceImg} alt={jokerCard.display} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : (
                                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                            <span style={{ fontSize: 14, fontWeight: 900, color: jokerCard.color, lineHeight: 1 }}>{jokerCard.val}</span>
                                            <span style={{ fontSize: 20, color: jokerCard.color, lineHeight: 1 }}>{jokerCard.suitSym}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ width: 44, height: 62, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 900, textAlign: "center", lineHeight: 1.3 }}>No<br />Card</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── RIGHT PANEL: Progress bar + Bet limit ── */}
            <div className="br-right-panel">
                {/* Progress bar (red horizontal bar) */}
                <div style={{
                    width: 400, height: 13, borderRadius: 4,
                    background: "rgba(255,255,255,0.1)",
                    overflow: "hidden",
                }}>
                    <div style={{
                        height: "100%",
                        width: `${Math.min((totalBet / 1000000) * 100, 100)}%`,
                        background: "linear-gradient(to right, #c0392b, #e74c3c)",
                        borderRadius: 4,
                        minWidth: totalBet > 0 ? 6 : 0,
                        transition: "width 0.3s ease",
                    }} />
                </div>

                {/* Bet limit text */}
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 20, fontWeight: 600, whiteSpace: "nowrap" }}>
                    Bet: {totalBet.toLocaleString()}/1,000,000
                </div>
            </div>

            {/* ── ROUND HISTORY: right-side horizontal A/B scoreboard ── */}
            <div className="br-history-panel">
                {roundHistory.slice(-13).map((r, i, arr) => {
                    const isAndar = r.result === "ANDAR";
                    const isLatest = i === arr.length - 1;
                    return (
                        <div key={i} style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            background: isAndar
                                ? "radial-gradient(circle at 35% 35%, #555, #1a1a1a)"
                                : "radial-gradient(circle at 35% 35%, #c0392b, #7b1c1c)",
                            border: isLatest
                                ? "2.5px solid #27ae60"
                                : isAndar ? "1.5px solid #555" : "1.5px solid #a93226",
                            boxShadow: isLatest
                                ? "0 0 10px rgba(39,174,96,0.8)"
                                : isAndar ? "0 1px 4px rgba(0,0,0,0.6)" : "0 1px 4px rgba(192,57,43,0.5)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <span style={{
                                color: "#fff", fontWeight: 900, fontSize: 10,
                                textShadow: "0 1px 3px rgba(0,0,0,0.9)", lineHeight: 1,
                            }}>{isAndar ? "A" : "B"}</span>
                        </div>
                    );
                })}
                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 13 - roundHistory.slice(-13).length) }).map((_, i) => (
                    <div key={`e-${i}`} style={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(255,255,255,0.04)",
                        border: "1.5px solid rgba(255,255,255,0.14)",
                    }} />
                ))}
            </div>

            {/* ── BETTING CLOSED OVERLAY ── */}
            {!bettingOpen && !localResult && (
                <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div className="br-closed-overlay">
                        <div style={{ fontSize: 30, marginBottom: 8 }}>🚫</div>
                        <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: "0.15em", textTransform: "uppercase" }}>Betting Closed</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 }}>Waiting for result...</div>
                        <div style={{ display: "flex", gap: 5, marginTop: 12, justifyContent: "center" }}>
                            {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c0392b", animation: "bounce 0.8s infinite", animationDelay: `${i * 0.15}s` }} />)}
                        </div>
                    </div>
                </div>
            )}

            {/* ── RESULT POPUP ── */}
            {showResultPopup && localResult && (
                <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", cursor: "pointer" }}
                    onClick={() => setShowResultPopup(false)}>
                    <div className="br-result-overlay" style={{
                        background: (localResult === "ANDAR" && andarTotal > 0) || (localResult === "BAHAR" && baharTotal > 0)
                            ? "linear-gradient(135deg, #1a5c2a, #27ae60)"
                            : "linear-gradient(135deg, #5c1a1a, #c0392b)"
                    }}>
                        <div style={{ fontSize: 44, marginBottom: 8 }}>
                            {(localResult === "ANDAR" && andarTotal > 0) || (localResult === "BAHAR" && baharTotal > 0) ? "🏆" : "😔"}
                        </div>
                        <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                            {betPlaced
                                ? ((localResult === "ANDAR" && andarTotal > 0) || (localResult === "BAHAR" && baharTotal > 0) ? "You Win!" : "Better Luck!")
                                : `${localResult} Wins!`}
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{localResult.toLowerCase()} wins this round</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 14 }}>Tap to dismiss</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BettingRoom;
