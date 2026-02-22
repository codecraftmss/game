import { Undo2 } from "lucide-react";

interface BettingPanelProps {
    balance: number;
    andarTotal: number;
    baharTotal: number;
    bettingOpen: boolean;
    canUndo: boolean;
    onUndo: () => void;
    onPlaceBet: () => void;
    betPlaced: boolean;
}

const BettingPanel = ({
    balance,
    andarTotal,
    baharTotal,
    bettingOpen,
    canUndo,
    onUndo,
    onPlaceBet,
    betPlaced,
}: BettingPanelProps) => {
    const totalBet = andarTotal + baharTotal;

    return (
        <div className="betting-panel flex flex-col gap-2 p-3 rounded-xl min-w-[130px]">
            {/* Balance */}
            <div className="text-center border-b border-white/10 pb-2">
                <div className="text-[9px] text-white/40 uppercase tracking-widest mb-0.5">Balance</div>
                <div className="text-amber-400 font-black text-base leading-tight">
                    ₹{balance.toLocaleString()}
                </div>
            </div>

            {/* Bet amounts */}
            <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <span className="text-[9px] text-white/40 uppercase tracking-wider">Andar</span>
                    <span className="text-white font-bold text-xs">₹{andarTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[9px] text-white/40 uppercase tracking-wider">Bahar</span>
                    <span className="text-white font-bold text-xs">₹{baharTotal.toLocaleString()}</span>
                </div>
                {totalBet > 0 && (
                    <div className="flex justify-between items-center border-t border-white/10 pt-1 mt-1">
                        <span className="text-[9px] text-amber-400/70 uppercase tracking-wider">Total</span>
                        <span className="text-amber-400 font-black text-xs">₹{totalBet.toLocaleString()}</span>
                    </div>
                )}
            </div>

            {/* Undo */}
            <button
                onClick={onUndo}
                disabled={!canUndo || !bettingOpen}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
          ${canUndo && bettingOpen
                        ? "bg-red-600/80 hover:bg-red-600 text-white active:scale-95"
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
            >
                <Undo2 className="w-3 h-3" />
                Undo
            </button>

            {/* Place Bet */}
            <button
                onClick={onPlaceBet}
                disabled={!bettingOpen || totalBet === 0 || betPlaced}
                className={`py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all
          ${bettingOpen && totalBet > 0 && !betPlaced
                        ? "place-bet-btn text-white active:scale-95"
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
            >
                {betPlaced ? "✓ Bet Placed" : "Place Bet"}
            </button>
        </div>
    );
};

export default BettingPanel;
