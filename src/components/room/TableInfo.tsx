interface TableInfoProps {
    tableName: string;
    minBet: number;
    roundId: string;
    bettingOpen: boolean;
    countdown: number;
}

const TableInfo = ({ tableName, minBet, roundId, bettingOpen, countdown }: TableInfoProps) => {
    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;
    const isUrgent = countdown <= 10 && bettingOpen;

    return (
        <div className="table-info-panel rounded-xl p-3 flex flex-col gap-2 min-w-[160px]">
            <div className="flex items-center justify-between gap-2">
                <span className="text-white/50 text-[10px] uppercase tracking-wider">Table</span>
                <span className="text-white font-bold text-xs truncate">{tableName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className="text-white/50 text-[10px] uppercase tracking-wider">Min Bet</span>
                <span className="text-amber-400 font-bold text-xs">₹{minBet.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className="text-white/50 text-[10px] uppercase tracking-wider">Round</span>
                <span className="text-white/70 text-xs font-mono">{roundId}</span>
            </div>

            <div className="border-t border-white/10 pt-2 mt-1">
                <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[10px] uppercase tracking-wider">Status</span>
                    <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bettingOpen
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                            }`}
                    >
                        {bettingOpen ? "OPEN" : "CLOSED"}
                    </span>
                </div>

                {bettingOpen && (
                    <div className="mt-2 text-center">
                        <div
                            className={`font-mono text-2xl font-bold tabular-nums transition-colors ${isUrgent ? "text-red-400 animate-pulse" : "text-white"
                                }`}
                        >
                            {mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`}
                        </div>
                        <div className="text-[9px] text-white/30 uppercase tracking-wider mt-0.5">Betting closes in</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TableInfo;
