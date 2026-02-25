import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logout, isCurrentUserAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, Users, Search,
  Wallet, ArrowUpCircle, ArrowDownCircle,
  RefreshCw, ChevronLeft, ChevronRight, Settings2,
  TrendingUp, TrendingDown, LayoutDashboard, DollarSign
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TokenUserInfo = {
  id: string;
  name: string;
  phone: string | null;
  token_balance: number;
  total_deposit_amount: number;
  total_withdraw_amount: number;
  total_win_amount: number;
  total_loss_amount: number;
  status: string;
};

const AdminTokenManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<TokenUserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal State
  const [selectedUser, setSelectedUser] = useState<TokenUserInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"ADD" | "WITHDRAW" | "ADJUST">("ADD");
  const [amount, setAmount] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Auth check
  useEffect(() => {
    const check = async () => {
      const admin = await isCurrentUserAdmin();
      if (!admin) { navigate("/admin/login"); }
    };
    check();
  }, [navigate]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from("profiles" as any)
      .select("*")
      .order("created_at", { ascending: false }) as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setUsers(data as TokenUserInfo[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("profiles-tokens")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, 
        () => { fetchUsers(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "token_transactions" },
        () => { fetchUsers(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchUsers]);

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (u.phone && u.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
    u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  const handleOpenModal = (user: TokenUserInfo, action: "ADD" | "WITHDRAW" | "ADJUST") => {
    setSelectedUser(user);
    setModalAction(action);
    setAmount("");
    setIsModalOpen(true);
  };

  const handleTransaction = async () => {
    if (!selectedUser || !amount || parseFloat(amount) < 0) {
      toast({ title: "Validation Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }

    setIsActionLoading(true);
    try {
      const { data: { user: admin } } = await supabase.auth.getUser();
      if (!admin) throw new Error("Admin not authenticated");

      let type: "admin_add" | "admin_withdraw";
      let finalAmount = parseFloat(amount);

      if (modalAction === "ADD") {
        type = "admin_add";
      } else if (modalAction === "WITHDRAW") {
        type = "admin_withdraw";
      } else {
        // ADJUST logic: Set balance directly
        const diff = finalAmount - (selectedUser.token_balance || 0);
        if (diff > 0) {
          type = "admin_add";
          finalAmount = diff;
        } else if (diff < 0) {
          type = "admin_withdraw";
          finalAmount = Math.abs(diff);
        } else {
          toast({ title: "No change", description: "The balance is already set to this value." });
          setIsModalOpen(false);
          setIsActionLoading(false);
          return;
        }
      }

      const { data, error } = await (supabase.rpc("process_token_transaction" as any, {
        p_user_id: selectedUser.id,
        p_admin_id: admin.id,
        p_transaction_type: type,
        p_amount: finalAmount,
        p_reference_id: `Admin action: ${modalAction}`
      }) as any);

      if (error) throw error;
      
      const res = data as any;
      if (res.success) {
        toast({ title: "Success", description: `Transaction processed. New balance: ₹${res.after_balance.toLocaleString()}` });
        setIsModalOpen(false);
        fetchUsers();
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      toast({ title: "Transaction Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate("/admin/login"); };

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", color: "#e2e8f0" }}>
      {/* HEADER */}
      <header style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }} className="sticky top-0 z-50">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/card_fan_logo.png" alt="Royal Star" className="w-9 h-auto" />
            <div>
              <div className="font-bold text-amber-400 text-base tracking-wider">Royal Star</div>
              <div className="text-[10px] text-white/30 uppercase tracking-widest">Token Management</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/admin/dashboard")} variant="ghost" className="text-white/40 hover:text-white h-9 px-3 text-xs uppercase font-bold tracking-widest">
              <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
            </Button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-all">
              <LogOut className="w-3.5 h-3.5" />Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* STATS OVERVIEW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Pool Balance", value: `₹${users.reduce((acc, u) => acc + (u.token_balance || 0), 0).toLocaleString()}`, icon: <Wallet className="text-blue-400 w-5 h-5" /> },
            { label: "Total Deposits", value: `₹${users.reduce((acc, u) => acc + (Number(u.total_deposit_amount) || 0), 0).toLocaleString()}`, icon: <TrendingUp className="text-emerald-400 w-5 h-5" /> },
            { label: "Total Withdrawals", value: `₹${users.reduce((acc, u) => acc + (Number(u.total_withdraw_amount) || 0), 0).toLocaleString()}`, icon: <TrendingDown className="text-red-400 w-5 h-5" /> },
            { label: "Verified Users", value: users.filter(u => u.status === "APPROVED").length.toString(), icon: <Users className="text-amber-400 w-5 h-5" /> },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5 bg-white/3 border border-white/10 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-lg bg-white/5">{s.icon}</div>
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
              </div>
              <div className="text-2xl font-black text-white">{s.value}</div>
              <div className="text-[11px] text-white/30 uppercase tracking-[0.2em] mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* SEARCH & CONTROLS */}
        <div className="rounded-2xl p-6 bg-white/3 border border-white/10 backdrop-blur-md flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <Input 
              placeholder="Search User ID, Name or Phone..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-12 bg-black/20 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl focus:border-amber-500/40 transition-all font-medium" 
            />
          </div>
          <Button onClick={fetchUsers} disabled={loading} className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-11 rounded-xl px-6">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Sync Data
          </Button>
        </div>

        {/* USERS TABLE */}
        <div className="rounded-3xl overflow-hidden bg-white/3 border border-white/10 shadow-2xl">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-white/5 border-b border-white/10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/40 uppercase tracking-widest text-[10px] font-black h-12">User Identity</TableHead>
                  <TableHead className="text-white/40 uppercase tracking-widest text-[10px] font-black h-12">Wallet Balance</TableHead>
                  <TableHead className="text-white/40 uppercase tracking-widest text-[10px] font-black h-12">Deposits / Withdraws</TableHead>
                  <TableHead className="text-white/40 uppercase tracking-widest text-[10px] font-black h-12">Win / Loss Stats</TableHead>
                  <TableHead className="text-right text-white/40 uppercase tracking-widest text-[10px] font-black h-12 px-6">System Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-20 text-white/20 animate-pulse uppercase font-black tracking-[0.3em]">Downloading Node Data...</TableCell></TableRow>
                ) : paginatedUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-20 text-white/20 uppercase font-black tracking-[0.3em]">No Records Found</TableCell></TableRow>
                ) : paginatedUsers.map(user => (
                  <TableRow key={user.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                    <TableCell className="py-4">
                      <div className="font-black text-white group-hover:text-amber-400 transition-colors uppercase tracking-wider">{user.name || "UNNAMED_ENTITY"}</div>
                      <div className="text-[10px] text-white/30 font-mono mt-0.5">{user.phone || "PH_HIDDEN"}</div>
                      <div className="text-[8px] text-white/10 font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">ID: {user.id}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="text-xl font-black text-amber-400">₹{(Number(user.token_balance) || 0).toLocaleString()}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-[10px]">
                          <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/5 px-1.5 py-0 text-[8px]">DEP</Badge>
                          <span className="text-emerald-400/80 font-bold">₹{(Number(user.total_deposit_amount) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <Badge variant="outline" className="border-red-500/20 text-red-400 bg-red-500/5 px-1.5 py-0 text-[8px]">WIT</Badge>
                          <span className="text-red-400/80 font-bold">₹{(Number(user.total_withdraw_amount) || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-[10px]">
                          <Badge variant="outline" className="border-blue-500/20 text-blue-400 bg-blue-500/5 px-1.5 py-0 text-[8px]">WIN</Badge>
                          <span className="text-blue-400/80 font-bold">₹{(Number(user.total_win_amount) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <Badge variant="outline" className="border-orange-500/20 text-orange-400 bg-orange-500/5 px-1.5 py-0 text-[8px]">LOS</Badge>
                          <span className="text-orange-400/80 font-bold">₹{(Number(user.total_loss_amount) || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-4 px-6">
                      <div className="flex justify-end gap-2">
                         <button 
                           onClick={() => handleOpenModal(user, "ADD")}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 transition-all"
                         >
                           <ArrowUpCircle className="w-3.5 h-3.5" /> ADD
                         </button>
                         <button 
                           onClick={() => handleOpenModal(user, "WITHDRAW")}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-all"
                         >
                           <ArrowDownCircle className="w-3.5 h-3.5" /> WITHDRAW
                         </button>
                         <button 
                           onClick={() => handleOpenModal(user, "ADJUST")}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-white/40 hover:text-white/60 hover:bg-white/10 transition-all"
                         >
                           <Settings2 className="w-3.5 h-3.5" /> ADJUST
                         </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* PAGINATION */}
          <div className="p-4 bg-white/5 border-t border-white/10 flex items-center justify-between">
            <div className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">
              Showing {paginatedUsers.length} of {filteredUsers.length} Users
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(p => p - 1)}
                className="bg-black/20 border-white/10 text-white/60 hover:text-white disabled:opacity-10 h-8 px-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center font-black text-xs text-amber-400">
                {currentPage} <span className="mx-2 text-white/10">/</span> {totalPages || 1}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === totalPages || totalPages === 0} 
                onClick={() => setCurrentPage(p => p + 1)}
                className="bg-black/20 border-white/10 text-white/60 hover:text-white disabled:opacity-10 h-8 px-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* TRANSACTION MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#0a0a0f] border-white/10 text-white shadow-2xl rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-widest uppercase flex items-center gap-3">
              {modalAction === "ADD" && <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><ArrowUpCircle className="text-emerald-400 w-5 h-5" /></div>}
              {modalAction === "WITHDRAW" && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20"><ArrowDownCircle className="text-red-400 w-5 h-5" /></div>}
              {modalAction === "ADJUST" && <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20"><Settings2 className="text-amber-400 w-5 h-5" /></div>}
              {modalAction === "ADD" ? "Deposit Tokens" : modalAction === "WITHDRAW" ? "Withdraw Tokens" : "Manual Adjustment"}
            </DialogTitle>
            <DialogDescription className="text-white/30 pt-2 text-xs uppercase tracking-tight">
              Action for account: <span className="text-white font-bold">{selectedUser?.name}</span> ({selectedUser?.phone})
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-6">
            <div className="bg-white/5 rounded-2xl p-5 border border-white/10 flex items-center justify-between shadow-inner">
               <div>
                 <div className="text-[9px] text-white/20 uppercase tracking-[0.3em] font-black mb-1">Current Wallet</div>
                 <div className="text-3xl font-black text-amber-400">₹{(selectedUser?.token_balance || 0).toLocaleString()}</div>
               </div>
               <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-black/40">
                  <DollarSign className="w-6 h-6 text-white/20" />
               </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 ml-1">
                {modalAction === "ADJUST" ? "New Balance Target" : "Transaction Amount"}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-white/30">₹</span>
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="bg-black/60 border-white/10 text-white h-14 pl-10 text-2xl font-black focus:border-amber-500/40 rounded-xl"
                />
              </div>
              <p className="text-[9px] text-white/20 uppercase tracking-widest pl-1">
                {modalAction === "ADJUST" ? "System will calculate the adjustment delta automatically." : "Tokens will be added/deducted from user immediately."}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="text-white/30 hover:text-white uppercase text-[10px] font-black tracking-widest">Cancel</Button>
            <Button 
               onClick={handleTransaction} 
               disabled={isActionLoading || !amount}
               className={`font-black uppercase tracking-[0.2em] h-12 px-8 rounded-xl relative overflow-hidden group shadow-lg active:scale-95 transition-all ${
                 modalAction === "ADD" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : 
                 modalAction === "WITHDRAW" ? "bg-red-600 hover:bg-red-500 text-white" : 
                 "bg-amber-600 hover:bg-amber-500 text-white"
               }`}
            >
              {isActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>EXECUTE {modalAction}</>}
              <div className="absolute inset-0 bg-white/10 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTokenManagement;
