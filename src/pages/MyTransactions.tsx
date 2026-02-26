import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, Wallet, History,
  ArrowDownLeft, Plus,
  Coins, Gamepad2, CreditCard, ChevronLeft, ArrowUpRight,
  RefreshCw
} from "lucide-react";

type Transaction = {
  id: string;
  transaction_type: string;
  amount: number;
  before_balance: number;
  after_balance: number;
  status: string;
  created_at: string;
  reference_id: string | null;
};

const MyTransactions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  const fetchProfileAndTransactions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    
    setUserProfile(profile);

    const { data, error } = await (supabase
      .from("token_transactions" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as any);

    if (error) {
      toast({ title: "Failed to load transactions", description: error.message, variant: "destructive" });
    } else {
      setTransactions((data as any) as Transaction[]);
    }
    setLoading(false);
  }, [navigate, toast]);

  useEffect(() => { fetchProfileAndTransactions(); }, [fetchProfileAndTransactions]);

  // Real-time updates for balance and new transactions
  useEffect(() => {
    let authUser: any = null;
    supabase.auth.getUser().then(({ data }) => { authUser = data.user; });

    const channel = supabase
      .channel("user-data-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, 
        (p) => { if (authUser && p.new.id === authUser.id) setUserProfile(p.new); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "token_transactions" },
        (p) => { if (authUser && p.new.user_id === authUser.id) { fetchProfileAndTransactions(); } })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [fetchProfileAndTransactions]);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "admin_add": return <Plus className="text-emerald-400 w-4 h-4" />;
      case "admin_withdraw": return <LogOut className="text-red-400 w-4 h-4 rotate-90" />;
      case "deposit": return <Plus className="text-emerald-400 w-4 h-4" />;
      case "withdraw": return <ArrowDownLeft className="text-red-400 w-4 h-4" />;
      case "game_win": return <Coins className="text-amber-400 w-4 h-4" />;
      case "game_loss": return <Gamepad2 className="text-white/40 w-4 h-4" />;
      default: return <CreditCard className="text-white/20 w-4 h-4" />;
    }
  };

  const getTransactionLabel = (type: string) => {
    return type.replace("_", " ").toUpperCase();
  };

  return (
    <div className="min-h-screen lobby-bg text-white">
      {/* Header */}
      <header className="lobby-header border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate("/dashboard")}>
            <div className="lobby-logo-box group-hover:scale-110 transition-transform">
              <img src="/card_fan_logo.png" alt="Royal Star" className="w-8 h-auto" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-widest text-amber-400 uppercase">Royal Star</div>
              <div className="text-[10px] tracking-[0.25em] text-white/40 uppercase">Ledger History</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <Button 
               variant="ghost" 
               onClick={() => navigate("/dashboard")} 
               className="text-white/40 hover:text-white uppercase text-[10px] font-black tracking-widest"
             >
               <ChevronLeft className="w-4 h-4 mr-1" /> Lobby
             </Button>
             <button 
               onClick={handleLogout} 
               className="lobby-logout-btn h-9 px-3 rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all"
             >
               <LogOut className="w-4 h-4 text-white/40" />
             </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 flex flex-col gap-8 max-w-5xl">
        {/* Balance Section */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
           {/* Abstract background shapes */}
           <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-400/10 blur-[80px] rounded-full" />
           <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-400/5 blur-[80px] rounded-full" />
           
           <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="flex items-center gap-6">
                <div className="lobby-balance-icon p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-xl">
                  <Wallet className="w-10 h-10 text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-[0.4em] mb-1.5 font-black">Net Liquidity</div>
                  <div className="text-5xl font-black text-amber-400 tracking-tighter">₹{(Number(userProfile?.token_balance) || 0).toLocaleString()}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] text-emerald-400/60 uppercase font-black tracking-widest leading-none">Real-time Node Connected</span>
                  </div>
                </div>
             </div>

             <div className="flex flex-wrap justify-center md:justify-end gap-12 border-t md:border-t-0 md:border-l border-white/10 pt-8 md:pt-0 md:pl-12 w-full md:w-auto">
                <div className="text-center md:text-right">
                  <div className="text-[10px] text-white/20 uppercase tracking-[0.3em] mb-2 font-black">Performance Wins</div>
                  <div className="text-2xl font-black text-emerald-400">₹{(Number(userProfile?.total_win_amount) || 0).toLocaleString()}</div>
                </div>
                <div className="text-center md:text-right">
                  <div className="text-[10px] text-white/20 uppercase tracking-[0.3em] mb-2 font-black">Total Payouts</div>
                  <div className="text-2xl font-black text-red-400">₹{(Number(userProfile?.total_withdraw_amount) || 0).toLocaleString()}</div>
                </div>
             </div>
           </div>
        </div>

        {/* Transactions Table Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-4 rounded-full bg-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/60">Transaction Ledger</h2>
            </div>
            <div className="text-[10px] text-white/20 font-black uppercase tracking-widest">{transactions.length} Records Detected</div>
          </div>

          <div className="bg-white/2 rounded-3xl border border-white/5 overflow-hidden shadow-2xl backdrop-blur-md">
            {loading ? (
              <div className="py-32 flex flex-col items-center justify-center gap-4">
                 <RefreshCw className="w-8 h-8 text-amber-400/20 animate-spin" />
                 <div className="text-[11px] text-white/20 font-black tracking-[0.5em] uppercase">Syncing Blockchain...</div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-32 flex flex-col items-center justify-center text-center px-10">
                 <div className="w-20 h-20 rounded-full border border-dashed border-white/10 flex items-center justify-center mb-6">
                    <History className="w-8 h-8 text-white/5" />
                 </div>
                 <h3 className="text-xl font-black text-white/40 uppercase tracking-widest mb-2">Zero Activity Detected</h3>
                 <p className="text-xs text-white/20 max-w-xs uppercase tracking-tight leading-relaxed">No transactions have been logged for this terminal identity yet. Start playing to generate entries.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="py-5 px-8 text-left text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Event Type</th>
                      <th className="py-5 px-8 text-left text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Delta Value</th>
                      <th className="py-5 px-8 text-left text-[10px] font-black uppercase tracking-[0.3em] text-white/40">After Balance</th>
                      <th className="py-5 px-8 text-left text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Timestamp</th>
                      <th className="py-5 px-8 text-right text-[10px] font-black uppercase tracking-[0.3em] text-white/40">ID/Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-white/5 transition-all group">
                        <td className="py-5 px-8">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 group-hover:border-amber-400/30 transition-colors shadow-inner">
                              {getTransactionIcon(tx.transaction_type)}
                            </div>
                            <div>
                              <div className="font-black text-xs tracking-wider text-white/90 group-hover:text-amber-400 transition-colors uppercase">
                                {getTransactionLabel(tx.transaction_type)}
                              </div>
                              <div className="text-[8px] text-white/20 uppercase tracking-widest mt-0.5">{tx.reference_id || 'System Process'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-8">
                          <div className={`text-base font-black flex items-center gap-1.5 ${
                            ['admin_add', 'deposit', 'game_win'].includes(tx.transaction_type) 
                            ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {['admin_add', 'deposit', 'game_win'].includes(tx.transaction_type) ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            )}
                            ₹{(Number(tx.amount)).toLocaleString()}
                          </div>
                        </td>
                        <td className="py-5 px-8">
                           <div className="text-sm font-black text-white/60 group-hover:text-white/80 transition-colors tracking-tighter">₹{(Number(tx.after_balance)).toLocaleString()}</div>
                        </td>
                        <td className="py-5 px-8">
                           <div className="text-[10px] text-white/30 font-bold">{new Date(tx.created_at).toLocaleDateString()}</div>
                           <div className="text-[9px] text-white/10 uppercase tracking-tighter mt-0.5">{new Date(tx.created_at).toLocaleTimeString()}</div>
                        </td>
                        <td className="py-5 px-8 text-right">
                           <div className="text-[10px] font-mono text-white/20 mb-1">#{tx.id.slice(0, 8)}</div>
                           <Badge className="bg-emerald-500/5 text-emerald-500/60 border-emerald-500/20 text-[8px] uppercase tracking-tighter px-2 py-0">
                             {tx.status}
                           </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {transactions.length > 0 && (
              <div className="py-4 text-center border-t border-white/5 bg-black/20">
                 <div className="text-[9px] text-white/10 font-black uppercase tracking-[0.5em]">End of Ledger — Securely Encrypted</div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Disclaimer */}
      <footer className="container mx-auto px-6 py-12 text-center">
         <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Digital Amusement Credits Only</span>
         </div>
         <p className="text-[10px] text-white/10 uppercase tracking-[0.3em]">Royal Star Core Finance Module v1.0.2</p>
      </footer>
    </div>
  );
};

export default MyTransactions;
