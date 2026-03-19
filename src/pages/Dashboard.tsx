import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logout } from "@/lib/auth";
import { LogOut, Wallet, UserCircle, Headphones, Lock, Users, AlertTriangle, TrendingUp, ArrowDownLeft, Plus, History as HistoryIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Room = {
  id: string;
  name: string;
  label: string;
  min_bet: number;
  max_bet: number;
  status: "ONLINE" | "OFFLINE" | "LIVE" | "MAINTENANCE";
  image_url: string | null;
  open_time: string | null;
  close_time: string | null;
};

const Dashboard = () => {
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [balance, setBalance] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Auth check ──
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      const { data: profile } = await (supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle() as any);

      if (!profile || profile.status !== "APPROVED") {
        await logout();
        navigate("/login");
        return;
      }
      setUserName(profile.name);
      setUserPhone(profile.phone?.replace(/[^0-9]/g, "") || user.id.slice(0, 10));
      setBalance(profile.token_balance || 0);
    };
    checkAuth();
  }, [navigate]);

  // ── Fetch visible rooms (ONLINE + MAINTENANCE only) ──
  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .in("status", ["ONLINE", "MAINTENANCE"])
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Could not load rooms", description: error.message, variant: "destructive" });
      return;
    }
    setRooms((data as Room[]) || []);
    setRoomsLoading(false);
  }, [toast]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // ── Real-time room subscription ──
  useEffect(() => {
    const channel = supabase
      .channel("user-rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Room;
            if (updated.status === "ONLINE" || updated.status === "MAINTENANCE") {
              // Add or update
              setRooms((prev) => {
                const exists = prev.find((r) => r.id === updated.id);
                return exists
                  ? prev.map((r) => (r.id === updated.id ? updated : r))
                  : [...prev, updated];
              });
            } else {
              // Remove from view if OFFLINE
              setRooms((prev) => prev.filter((r) => r.id !== updated.id));
            }
          } else if (payload.eventType === "INSERT") {
            const inserted = payload.new as Room;
            if (inserted.status === "ONLINE" || inserted.status === "MAINTENANCE") {
              setRooms((prev) => [...prev, inserted]);
            }
          } else if (payload.eventType === "DELETE") {
            setRooms((prev) => prev.filter((r) => r.id !== (payload.old as Room).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Real-time balance subscription ──
  useEffect(() => {
    let sub: any;
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      sub = supabase.channel(`profile-${user.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (p) => setBalance((p.new as any).token_balance || 0))
        .subscribe();
    };
    setup();
    return () => { if (sub) supabase.removeChannel(sub); };
  }, []);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  // ── Navigate to room — re-validate status first ──
  const handleEnterRoom = async (room: Room) => {
    const { data } = await supabase
      .from("rooms")
      .select("status")
      .eq("id", room.id)
      .maybeSingle();

    if (!data || data.status !== "ONLINE") {
      toast({
        title: "Room Unavailable",
        description: data?.status === "MAINTENANCE" ? "This room is currently under maintenance. Please check back later." : "This room is currently offline. Please try another table.",
        variant: "destructive",
      });
      if (!data || data.status !== "MAINTENANCE") {
        // Remove from local state immediately
        setRooms((prev) => prev.filter((r) => r.id !== room.id));
      } else {
        // Keep it in state but mark as maintenance
        setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, status: "MAINTENANCE" } : r));
      }
      return;
    }
    navigate(`/room/${room.id}`);
  };

  const onlineCount = rooms.filter((r) => r.status === "ONLINE").length;
  const maintenanceCount = rooms.filter((r) => r.status === "MAINTENANCE").length;

  return (
    <div className="min-h-screen lobby-bg text-white">
      {/* Header */}
      <header className="lobby-header border-b border-white/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="lobby-logo-box">
              <img src="/card_fan_logo.png" alt="Royal Star" className="w-8 h-auto" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-widest text-amber-400 uppercase">Royal Star</div>
              <div className="text-[10px] tracking-[0.25em] text-white/40 uppercase">Premium Gaming</div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-white/50">Welcome back,</div>
              <div className="text-sm font-semibold text-white">User #{userPhone || "..."}</div>
            </div>
            <button
              onClick={handleLogout}
              className="lobby-logout-btn flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <LogOut className="w-4 h-4" />
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Disclaimer Banner */}
        <div className="lobby-disclaimer flex items-start gap-3 rounded-xl px-5 py-4 mb-6">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-0.5">Amusement Purpose Only</div>
            <div className="text-xs text-white/60">This platform is strictly for practice and entertainment. Virtual credits have no real-world monetary value.</div>
          </div>
        </div>

        {/* Balance Section */}
        <div className="lobby-balance-section rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="lobby-balance-icon">
              <Wallet className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-0.5">Available Balance</div>
              <div className="text-3xl font-black text-amber-400 tracking-tight">₹{balance.toLocaleString()}</div>
              <div className="text-[10px] text-white/30 mt-0.5">Practice Credits · No real value</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate("/dashboard/transactions")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all">
              <HistoryIcon className="w-3.5 h-3.5" /> History
            </button>
            <button 
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/40 hover:text-white/60 hover:bg-white/10 transition-all">
              <Plus className="w-3.5 h-3.5" />Top Up
            </button>
            <button 
              onClick={() => setShowWithdraw(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/40 hover:text-white/60 hover:bg-white/10 transition-all">
              <ArrowDownLeft className="w-3.5 h-3.5" />Withdraw
            </button>
          </div>
        </div>

        {/* Lobby Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">
            Lobby <span className="text-white/30">/</span> <span className="text-white/80">Games</span>
          </h1>
          <div className="flex items-center gap-3">
            {maintenanceCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Maint: {maintenanceCount}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Online: {onlineCount}
            </span>
          </div>
        </div>

        {/* Game Rooms Grid */}
        {roomsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="lobby-room-card rounded-2xl overflow-hidden h-64 animate-pulse bg-white/5" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 mb-8 glass rounded-2xl">
            <Lock className="w-12 h-12 text-white/20 mb-3" />
            <div className="text-white/40 font-bold text-lg">No Rooms Available</div>
            <div className="text-white/20 text-sm mt-1">All tables are currently offline. Check back soon.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="lobby-room-card rounded-2xl overflow-hidden relative"
                style={{ animation: "fadeSlideIn 0.3s ease" }}
              >
                {/* Room Image */}
                <div className="relative h-44 overflow-hidden">
                  {room.image_url ? (
                    <img src={room.image_url} alt={room.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full lobby-room-closed-bg flex flex-col items-center justify-center gap-2">
                      <Lock className="w-8 h-8 text-white/30" />
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Status badge */}
                  <div className="absolute top-3 right-3">
                    {room.status === "MAINTENANCE" ? (
                      <span className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />Maint
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Online
                      </span>
                    )}
                  </div>

                  {/* Room name */}
                  <div className="absolute bottom-3 left-3">
                    <div className="text-white font-bold text-lg leading-tight">{room.name}</div>
                    <div className="text-white/50 text-xs">{room.label}</div>
                  </div>
                </div>

                {/* Room Info */}
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between text-[10px] text-white/30 uppercase tracking-wider">
                    <div>
                      <div className="text-white/20 mb-0.5">Min Bet</div>
                      <div className="text-white/50 font-semibold">₹{room.min_bet.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white/20 mb-0.5">Max Bet</div>
                      <div className="text-white/50 font-semibold">₹{room.max_bet.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-white/30 uppercase tracking-wider">
                    <div><div className="text-white/20 mb-0.5">Open</div><div className="text-white/50">{room.open_time}</div></div>
                    <div className="text-right"><div className="text-white/20 mb-0.5">Close</div><div className="text-white/50">{room.close_time}</div></div>
                  </div>

                  <button
                    className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest ${room.status === "MAINTENANCE" ? "bg-amber-500/10 border border-amber-500/30 text-amber-500/50 cursor-not-allowed" : "lobby-enter-btn"}`}
                    onClick={() => handleEnterRoom(room)}
                  >
                    {room.status === "MAINTENANCE" ? "Maintenance" : "Enter Table"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Credits & Top-up */}
          <div className="lobby-bottom-card rounded-2xl p-8 flex flex-col items-center text-center gap-4">
            <div className="lobby-icon-circle">
              <Wallet className="w-6 h-6 text-white/60" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Credits &amp; Top-up</h3>
              <p className="text-sm text-white/40">Manage your practice balance safely</p>
            </div>
            <div className="lobby-balance-badge px-4 py-2 rounded-full flex items-center gap-2">
              <span className="text-white font-bold">₹{balance.toLocaleString()}</span>
              <span className="text-white/30 text-xs font-semibold">BAL</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />Balance updated live
            </div>
          </div>

          {/* Player Profile */}
          <div className="lobby-bottom-card rounded-2xl p-8 flex flex-col items-center text-center gap-4">
            <div className="lobby-icon-circle">
              <UserCircle className="w-6 h-6 text-white/60" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Player Profile</h3>
              <p className="text-sm text-white/40">Account Details &amp; History</p>
            </div>
            
            <div className="w-full max-w-sm mt-2 space-y-4">
              <div className="flex justify-between items-center bg-white/5 rounded-lg p-3 border border-white/10">
                <span className="text-white/40 text-sm">Name</span>
                <span className="text-white font-semibold">{userName || "—"}</span>
              </div>
              
              <div className="flex justify-between items-center bg-white/5 rounded-lg p-3 border border-white/10">
                <span className="text-white/40 text-sm">Phone Number</span>
                <span className="text-white font-semibold">{userPhone || "—"}</span>
              </div>
              
              <button
                onClick={() => navigate("/dashboard/transactions")}
                className="w-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg p-3 transition-colors font-semibold tracking-wider uppercase text-sm"
              >
                <HistoryIcon className="w-4 h-4" /> View History
              </button>
            </div>
          </div>
        </div>

        {/* Contact Support */}
        <div className="flex justify-center mb-10">
          <button 
            onClick={() => setShowContact(true)}
            className="lobby-support-btn flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold uppercase tracking-widest">
            <Headphones className="w-4 h-4" />Contact Support
          </button>
        </div>

        {/* Footer */}
        <div className="text-center space-y-4">
          <div className="flex justify-center gap-6 text-white/20">
            <span className="text-xl">🛡️</span>
            <span className="text-xl">🎲</span>
            <span className="text-xl">🔞</span>
          </div>
          <p className="text-xs text-white/20 tracking-widest uppercase">
            © 2023 Royal Star. All Rights Reserved.
          </p>
        </div>
      </main>

      {/* Top Up Modal */}
      {showTopUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1a1c23] border border-white/10 rounded-2xl p-6 w-full max-w-sm relative">
            <button onClick={() => setShowTopUp(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-amber-400 mb-4 tracking-wider uppercase text-center">Top Up Account</h2>
            <div className="flex flex-col items-center gap-4">
              <div className="w-48 h-48 bg-white p-2 rounded-xl flex items-center justify-center">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=mock@upi&pn=RoyalStar" alt="Top Up QR" className="w-full h-full object-cover" />
              </div>
              <div className="text-white/60 text-sm text-center">Scan the QR code to add credits or send payment to:</div>
              <div className="text-amber-400 font-black text-xl tracking-wider bg-amber-400/10 px-4 py-2 rounded-lg border border-amber-400/20">
                +91 98765 43210
              </div>
              <button 
                onClick={() => setShowTopUp(false)}
                className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 rounded-xl uppercase tracking-widest transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1a1c23] border border-white/10 rounded-2xl p-6 w-full max-w-sm relative">
            <button onClick={() => setShowWithdraw(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-amber-400 mb-4 tracking-wider uppercase text-center">Withdraw Funds</h2>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                <ArrowDownLeft className="w-8 h-8 text-red-400" />
              </div>
              <div className="text-white/80">To withdraw your secure funds, please contact our withdrawal agent directly on WhatsApp or Call:</div>
              <div className="text-white font-black text-2xl tracking-widest bg-white/5 border border-white/10 px-6 py-3 rounded-xl mt-2">
                +91 87654 32109
              </div>
              <div className="text-xs text-red-400/80 uppercase tracking-widest mt-2">Available 24/7 for instant withdrawal</div>
            </div>
          </div>
        </div>
      )}

      {/* Contact Support Modal */}
      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1a1c23] border border-white/10 rounded-2xl p-6 w-full max-w-sm relative flex flex-col items-center gap-6">
            <button onClick={() => setShowContact(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Headphones className="w-8 h-8 text-blue-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white tracking-widest uppercase">Support Team</h2>
              <p className="text-white/40 text-sm">We are here to help! Reach out for account assistance, bugs, or general queries.</p>
            </div>
            
            <div className="w-full space-y-3">
              <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center text-sm">
                <span className="text-white/40">Email:</span>
                <span className="text-white font-semibold flex items-center gap-2">support@royalstar.net</span>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center text-sm">
                <span className="text-white/40">Phone:</span>
                <span className="text-emerald-400 font-bold tracking-widest">+91 99999 00000</span>
              </div>
            </div>
            
            <button 
              onClick={() => setShowContact(false)}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl tracking-widest uppercase transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
