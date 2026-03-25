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
    timer_seconds: number;
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
    const [displayTimer, setDisplayTimer] = useState<number>(0);
    const balanceRef = useRef(0);
    const [selectedChip, setSelectedChip] = useState<number>(500);
    const [betHistory, setBetHistory] = useState<BetEntry[]>([]);
    const betHistoryRef = useRef<BetEntry[]>([]);
    betHistoryRef.current = betHistory;
    const [placedBetsCount, setPlacedBetsCount] = useState(0);

    const [showResultPopup, setShowResultPopup] = useState(false);
    const [localResult, setLocalResult] = useState<"ANDAR" | "BAHAR" | null>(null);
    const [isPortrait, setIsPortrait] = useState(false);

    // Track first and second bet totals per phase
    const [firstBetTotal, setFirstBetTotal] = useState(0);
    const [secondBetTotal, setSecondBetTotal] = useState(0);

    // Round history for the A/B dots indicator
    const [roundHistory, setRoundHistory] = useState<Array<{ result: "ANDAR" | "BAHAR" }>>([]);

    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [userBets, setUserBets] = useState<any[]>([]);
    const [showBettingClosedBanner, setShowBettingClosedBanner] = useState(false);
    const [showBettingOpenBanner, setShowBettingOpenBanner] = useState(false);
    const [showPhaseBanner, setShowPhaseBanner] = useState<"1ST" | "2ND" | null>(null);
    const [roundResultStatus, setRoundResultStatus] = useState<'WON' | 'LOST' | 'NONE' | null>(null);

    const fetchUserBets = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from("bets" as any)
            .select("*")
            .eq("user_id", user.id)
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .limit(30);
        if (data) setUserBets(data);
    };

    useEffect(() => {
        if (isHistoryOpen) fetchUserBets();
    }, [isHistoryOpen, roomId]);

    const andarBets = betHistory.filter(b => b.side === "andar");
    const baharBets = betHistory.filter(b => b.side === "bahar");
    const andarTotal = andarBets.reduce((s, v) => s + v.amount, 0);
    const baharTotal = baharBets.reduce((s, v) => s + v.amount, 0);
    const totalBet = andarTotal + baharTotal;
    const isBettingWindowOpen = gameState?.betting_status === "OPEN";
    const bettingOpen = isBettingWindowOpen && displayTimer > 0;

    // ── Local Smooth Timer Interpolation ──
    useEffect(() => {
        if (gameState?.timer_seconds !== undefined) {
            setDisplayTimer(gameState.timer_seconds);
        }
    }, [gameState?.timer_seconds]);

    useEffect(() => {
        if (gameState?.betting_status === "OPEN") {
            // Force reset displayTimer to server value when status becomes OPEN
            if (gameState.timer_seconds !== undefined) {
                setDisplayTimer(gameState.timer_seconds);
            }
            const interval = setInterval(() => {
                setDisplayTimer(prev => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setDisplayTimer(0);
        }
    }, [gameState?.betting_status, gameState?.timer_seconds === 15]); // Extra trigger on 15 to ensure reset

    // ── Handle Betting Status & Phase Banners ──
    useEffect(() => {
        // Status transitions
        if (gameState?.betting_status === "CLOSED" && !localResult) {
            setShowBettingClosedBanner(true);
            setShowBettingOpenBanner(false);
            const timer = setTimeout(() => setShowBettingClosedBanner(false), 3500);
            return () => clearTimeout(timer);
        } else if (gameState?.betting_status === "OPEN") {
            setShowBettingOpenBanner(true);
            setShowBettingClosedBanner(false);
            const timer = setTimeout(() => setShowBettingOpenBanner(false), 3500);
            return () => clearTimeout(timer);
        }
    }, [gameState?.betting_status, localResult]);

    useEffect(() => {
        // Phase transitions
        if (gameState?.betting_phase === "1ST_BET") {
            setShowPhaseBanner("1ST");
            const timer = setTimeout(() => setShowPhaseBanner(null), 3500);
            return () => clearTimeout(timer);
        } else if (gameState?.betting_phase === "2ND_BET") {
            setShowPhaseBanner("2ND");
            const timer = setTimeout(() => setShowPhaseBanner(null), 3500);
            return () => clearTimeout(timer);
        }
    }, [gameState?.betting_phase]);

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

                    // ── Capture win/loss status BEFORE clearing history ──
                    let status: "WON" | "LOST" | "NONE" = "NONE";
                    const sideWon = newState.result?.toLowerCase();
                    const currentBets = betHistoryRef.current;
                    if (sideWon && currentBets.length > 0) {
                        const hasWon = currentBets.some(b => b.side === sideWon);
                        status = hasWon ? "WON" : "LOST";
                    }

                    if (newState.result && newState.result !== prev?.result) {
                        setLocalResult(newState.result);
                        setRoundResultStatus(status);
                        setShowResultPopup(true);
                        setTimeout(() => {
                            setShowResultPopup(false);
                            setRoundResultStatus(null);
                        }, 5000);
                    }
                    if (newState.current_round !== prev?.current_round) {
                        setBetHistory([]); betHistoryRef.current = [];
                        setPlacedBetsCount(0);
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
                incoming.current_round !== prev?.current_round ||
                incoming.timer_seconds !== prev?.timer_seconds
            ) {
            // ── Determine win status BEFORE clearing history ──
            let status: "WON" | "LOST" | "NONE" = "NONE";
            const sideWon = incoming.result?.toLowerCase();
            const currentBets = betHistoryRef.current;
            if (sideWon && currentBets.length > 0) {
                const hasWon = currentBets.some(b => b.side === sideWon);
                status = hasWon ? "WON" : "LOST";
            }

            if (incoming.result && incoming.result !== prev?.result) {
                setLocalResult(incoming.result);
                setRoundResultStatus(status);
                setShowResultPopup(true);
                setTimeout(() => {
                    setShowResultPopup(false);
                    setRoundResultStatus(null);
                }, 5000);
            }
            if (incoming.current_round !== prev?.current_round) {
                setBetHistory([]); betHistoryRef.current = [];
                setPlacedBetsCount(0);
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

    // ── Real-time balance sync & Polling Fallback ──
    useEffect(() => {
        let sub: any;
        let pollInterval: any;
        
        const setup = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            sub = supabase.channel(`player-profile-${roomId}-${user.id}`)
                .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (p) => {
                    setBalance((p.new as any).token_balance || 0);
                    balanceRef.current = (p.new as any).token_balance || 0;
                })
                .subscribe();
                
            pollInterval = setInterval(async () => {
                const { data } = await supabase.from("profiles").select("token_balance").eq("id", user.id).maybeSingle() as any;
                if (data) {
                    setBalance(data.token_balance || 0);
                    balanceRef.current = data.token_balance || 0;
                }
            }, 3000);
        };
        
        setup();
        return () => { 
            if (sub) supabase.removeChannel(sub); 
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [roomId]);

    // ── Global Presence for Admin Tracking ──
    useEffect(() => {
        let presenceChannel: any;
        const setupPresence = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            presenceChannel = supabase.channel('global-presence', {
                config: { presence: { key: user.id } }
            });
            
            presenceChannel.subscribe(async (status: string) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({ room_id: roomId, user_id: user.id });
                }
            });
        };
        setupPresence();
        
        return () => { 
            if (presenceChannel) supabase.removeChannel(presenceChannel); 
        };
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
        const elem = document.getElementById("root") || document.body || document.documentElement;
        const anyElem = elem as any;
        const doc = document as any;
        const isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

        try {
            if (!isFullscreen) {
                if (anyElem.requestFullscreen) {
                    anyElem.requestFullscreen().catch((err: any) => {
                        console.error(err);
                        toast({ title: "Fullscreen blocked", description: err.message || "Browser blocked fullscreen.", variant: "destructive" });
                    });
                } else if (anyElem.webkitRequestFullscreen) {
                    anyElem.webkitRequestFullscreen().catch((err: any) => {
                        console.error(err);
                        toast({ title: "Fullscreen Safari blocked", description: err.message || "Safari blocked fullscreen.", variant: "destructive" });
                    });
                } else if (anyElem.msRequestFullscreen) {
                    anyElem.msRequestFullscreen();
                } else {
                    toast({ title: "Not Supported", description: "Device does not support standard fullscreen.", variant: "destructive" });
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
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    // ── Betting actions ──
    const handleBet = (side: "andar" | "bahar") => {
        if (!bettingOpen || balance < selectedChip) return;
        setBetHistory(h => { const next = [...h, { side, amount: selectedChip }]; betHistoryRef.current = next; return next; });
        setBalance(b => { balanceRef.current = b - selectedChip; return b - selectedChip; });
    };

    const handleUndo = () => {
        if (betHistory.length === 0 || betHistory.length <= placedBetsCount || !bettingOpen) return;
        const last = betHistory[betHistory.length - 1];
        setBetHistory(h => { const next = h.slice(0, -1); betHistoryRef.current = next; return next; });
        setBalance(b => { balanceRef.current = b + last.amount; return b + last.amount; });
    };

    const handlePlaceBet = async () => {
        if (!bettingOpen || totalBet === 0) return;
        const unplacedBets = betHistory.slice(placedBetsCount);
        const newAndarTotal = unplacedBets.filter(b => b.side === "andar").reduce((s, b) => s + b.amount, 0);
        const newBaharTotal = unplacedBets.filter(b => b.side === "bahar").reduce((s, b) => s + b.amount, 0);

        if (newAndarTotal === 0 && newBaharTotal === 0) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let placedSomething = false;

        if (newAndarTotal > 0) {
            const { data, error } = await (supabase.rpc("place_bet" as any, {
                p_user_id: user.id, p_room_id: roomId,
                p_round_number: gameState?.current_round || 1, p_side: "ANDAR", p_amount: newAndarTotal,
                p_target_card: gameState?.target_card // Added target card
            }) as any);
            if (error || !(data as any).success) {
                toast({ title: "Bet Failed", description: error?.message || (data as any)?.message, variant: "destructive" });
                return;
            }
            placedSomething = true;
            toast({ title: "Bet Placed!", description: `₹${newAndarTotal.toLocaleString()} on ANDAR` });
        }
        if (newBaharTotal > 0) {
            const { data, error } = await (supabase.rpc("place_bet" as any, {
                p_user_id: user.id, p_room_id: roomId,
                p_round_number: gameState?.current_round || 1, p_side: "BAHAR", p_amount: newBaharTotal,
                p_target_card: gameState?.target_card // Added target card
            }) as any);
            if (error || !(data as any).success) {
                toast({ title: "Bet Failed", description: error?.message || (data as any)?.message, variant: "destructive" });
                return;
            }
            placedSomething = true;
            toast({ title: "Bet Placed!", description: `₹${newBaharTotal.toLocaleString()} on BAHAR` });
        }

        if (placedSomething) {
            setPlacedBetsCount(betHistory.length);
            
            if (gameState?.betting_phase === "1ST_BET") {
                setFirstBetTotal(totalBet);
            } else if (gameState?.betting_phase === "2ND_BET") {
                // Second bet total is the additional amount added since phase 1
                setSecondBetTotal(totalBet - firstBetTotal);
            }
    
            if (isHistoryOpen) fetchUserBets();
        }
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
                {/* ── BETTING STATUS TOP BANNERS ── */}
                {(showBettingClosedBanner || (isBettingWindowOpen && displayTimer === 0)) && (
                    <div style={{
                        position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
                        zIndex: 100, pointerEvents: "none",
                        animation: "slideDown 0.5s cubic-bezier(0.19, 1, 0.22, 1) forwards"
                    }}>
                        <div style={{
                            background: "rgba(192, 57, 43, 0.95)", backdropFilter: "blur(12px)",
                            border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 12,
                            padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
                            boxShadow: "0 10px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.2)"
                        }}>
                            <div style={{ fontSize: 20 }}>🔒</div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ color: "#fff", fontWeight: 900, fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase" }}>Betting Closed</div>
                                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Wait for result</div>
                            </div>
                        </div>
                    </div>
                )}

                {showBettingOpenBanner && displayTimer > 0 && (
                    <div style={{
                        position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
                        zIndex: 100, pointerEvents: "none",
                        animation: "slideDown 0.5s cubic-bezier(0.19, 1, 0.22, 1) forwards"
                    }}>
                        <div style={{
                            background: "rgba(39, 174, 96, 0.95)", backdropFilter: "blur(12px)",
                            border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 12,
                            padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
                            boxShadow: "0 10px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.2)"
                        }}>
                            <div style={{ fontSize: 20 }}>🔓</div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ color: "#fff", fontWeight: 900, fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase" }}>Betting Opened</div>
                                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Place your bets</div>
                            </div>
                        </div>
                    </div>
                )}

                {showPhaseBanner && (
                    <div style={{
                        position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
                        zIndex: 100, pointerEvents: "none",
                        animation: "slideDown 0.5s cubic-bezier(0.19, 1, 0.22, 1) forwards"
                    }}>
                        <div style={{
                            background: "rgba(41, 128, 185, 0.95)", backdropFilter: "blur(12px)",
                            border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 12,
                            padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
                            boxShadow: "0 10px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.2)"
                        }}>
                            <div style={{ fontSize: 20 }}>🎰</div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ color: "#fff", fontWeight: 900, fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                                    {showPhaseBanner === "1ST" ? "1st Bet Phase" : "2nd Bet Phase"}
                                </div>
                                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    {showPhaseBanner === "1ST" ? "Round Initial Bets" : "Final Betting Phase"}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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
                        {roomInfo.name.toUpperCase()} : MIN BET 500
                    </span>
                </div>

                {/* Right: Timer + Icons */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {/* Countdown Timer */}
                    {bettingOpen && displayTimer > 0 && (
                        <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: displayTimer <= 5 ? "rgba(192, 57, 43, 0.9)" : "rgba(255, 255, 255, 0.1)",
                            padding: "4px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
                            boxShadow: displayTimer <= 5 ? "0 0 15px rgba(192, 57, 43, 0.4)" : "none",
                            animation: displayTimer <= 5 ? "pulse 1s infinite" : "none",
                            transition: "all 0.3s ease",
                        }}>
                            <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em" }}>TIME</span>
                            <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", minWidth: 24, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                                {displayTimer}
                            </span>
                        </div>
                    )}

                    <button onClick={() => setIsHistoryOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 18, display: "flex", alignItems: "center" }} title="History">
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
            <div className="br-left-panel" style={{ pointerEvents: bettingOpen ? "auto" : "none" }}>
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
                                onClick={() => bettingOpen && setSelectedChip(chip.value)}
                                disabled={!bettingOpen}
                                style={{
                                    width: isSel ? 42 : 36, height: isSel ? 42 : 36,
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle at 35% 30%, ${chip.color}dd, ${chip.shadow})`,
                                    border: isSel ? "2.5px solid #f1c40f" : "1.5px dashed rgba(255,255,255,0.3)",
                                    boxShadow: isSel ? "0 0 10px #f1c40f99" : `0 3px 8px ${chip.shadow}88`,
                                    color: "#fff", fontWeight: 900,
                                    fontSize: chip.value >= 10000 ? 8 : 9,
                                    cursor: bettingOpen ? "pointer" : "not-allowed",
                                    opacity: !bettingOpen ? 0.45 : 1,
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
                        disabled={betHistory.length <= placedBetsCount || !bettingOpen}
                        style={{
                            flex: 1, padding: "7px 0",
                            borderRadius: 6, border: "none", cursor: betHistory.length > placedBetsCount && bettingOpen ? "pointer" : "not-allowed",
                            background: betHistory.length > placedBetsCount && bettingOpen ? "#8b1a1a" : "rgba(255,255,255,0.08)",
                            color: betHistory.length > placedBetsCount && bettingOpen ? "#fff" : "rgba(255,255,255,0.25)",
                            fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                            opacity: betHistory.length > placedBetsCount && bettingOpen ? 1 : 0.6,
                        }}>
                        UNDO
                    </button>
                    <button onClick={handlePlaceBet}
                        disabled={!bettingOpen || betHistory.length <= placedBetsCount}
                        style={{
                            flex: 1.4, padding: "7px 0",
                            borderRadius: 6, border: "none",
                            cursor: bettingOpen && betHistory.length > placedBetsCount ? "pointer" : "not-allowed",
                            background: bettingOpen && betHistory.length > placedBetsCount
                                ? "linear-gradient(135deg, #27ae60, #1e8449)"
                                : "rgba(255,255,255,0.08)",
                            color: bettingOpen && betHistory.length > placedBetsCount ? "#fff" : "rgba(255,255,255,0.25)",
                            fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                        }}>
                        {bettingOpen && totalBet > 0 && betHistory.length === placedBetsCount ? "✓ PLACED" : "PLACE BET"}
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
            <div className="br-center-panel" style={{ pointerEvents: bettingOpen ? "auto" : "none", filter: bettingOpen ? "none" : "grayscale(35%)" }}>
                <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>

                    {/* ANDAR */}
                    <button onClick={() => handleBet("andar")}
                        disabled={!bettingOpen}
                        style={{
                            flex: 1,
                            borderRadius: "10px 10px 0 0",
                            border: "2px solid #629ca7",
                            borderBottom: "1px solid #629ca7",
                            background: "linear-gradient(135deg, #3c7280 0%, #2b5460 100%)",
                            padding: "8px 14px",
                            cursor: bettingOpen ? "pointer" : "not-allowed",
                            opacity: !bettingOpen ? 0.55 : 1,
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
                        disabled={!bettingOpen}
                        style={{
                            flex: 1,
                            borderRadius: "0 0 10px 10px",
                            border: "2px solid #bc6941",
                            borderTop: "1px solid #bc6941",
                            background: "linear-gradient(135deg, #8f4f38 0%, #703726 100%)",
                            padding: "8px 14px",
                            cursor: bettingOpen ? "pointer" : "not-allowed",
                            opacity: !bettingOpen ? 0.55 : 1,
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

            {/* BETTING CLOSED OVERLAY REMOVED AS REQUESTED */}

            {/* ── HISTORY PANEL (SLIDE-OUT) ── */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-[#0a0a0f] border-l border-white/10 z-[100] transform transition-transform duration-300 ease-in-out ${isHistoryOpen ? "translate-x-0" : "translate-x-full"}`} style={{ boxShadow: "-10px 0 30px rgba(0,0,0,0.8)" }}>
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">📜</span>
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">My Bet Ledger</h2>
                    </div>
                    <button onClick={() => setIsHistoryOpen(false)} className="text-white/50 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <div className="p-4 overflow-y-auto h-[calc(100vh-65px)]">
                    {userBets.length === 0 ? (
                        <div className="text-center text-white/30 text-xs mt-10">No bets found.</div>
                    ) : (
                        <div className="space-y-3">
                            {userBets.map((b, i) => (
                                <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">Round #{b.round_number}</span>
                                        <span className="text-[10px] text-white/30">{new Date(b.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[11px] font-black px-2 py-0.5 rounded uppercase ${b.side?.toUpperCase() === "ANDAR" ? "bg-red-500/20 text-red-500 border border-red-500/30" : "bg-blue-500/20 text-blue-400 border border-blue-500/20"}`}>
                                                {b.side}
                                            </span>
                                            {b.target_card && (
                                                <span className="text-[10px] font-bold text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                    🃏 {b.target_card}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-sm font-bold text-white">₹{b.amount?.toLocaleString()}</span>
                                    </div>
                                    {(b.status || b.payout) && (
                                        <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center text-[10px]">
                                            <span className="text-white/40 uppercase tracking-wider font-black">Status:</span>
                                            <span className={`font-black uppercase tracking-widest ${b.status?.toUpperCase() === 'WON' ? 'text-emerald-400' : b.status?.toUpperCase() === 'LOST' ? 'text-red-400' : 'text-amber-400'}`}>
                                                {b.status || 'PENDING'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── RESULT POPUP ── */}
            {showResultPopup && localResult && (
                <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", cursor: "pointer" }}
                    onClick={() => setShowResultPopup(false)}>
                    <div className="br-result-overlay" style={{
                        background: roundResultStatus === "WON"
                            ? "linear-gradient(135deg, #1a5c2a, #27ae60)" // Winner Green
                            : roundResultStatus === "LOST"
                                ? "linear-gradient(135deg, #5c1a1a, #c0392b)" // Loser Red
                                : "linear-gradient(135deg, #1a3a4a, #2980b9)" // Default Blue (No bet)
                    }}>
                        <div style={{ fontSize: 44, marginBottom: 8 }}>
                            {roundResultStatus === "WON" ? "🏆" : roundResultStatus === "LOST" ? "😔" : "🏁"}
                        </div>
                        <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                            {roundResultStatus === "WON" ? "You Win!" : roundResultStatus === "LOST" ? "Better Luck!" : `${localResult} Wins!`}
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600 }}>
                            {localResult.toLowerCase()} wins this round
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 14, letterSpacing: "0.05em" }}>Tap to dismiss</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BettingRoom;
