import { useEffect, useRef } from "react";

interface BettingZonesProps {
    andarTotal: number;
    baharTotal: number;
    andarChips: number[];
    baharChips: number[];
    bettingOpen: boolean;
    result: "andar" | "bahar" | null;
    onBet: (side: "andar" | "bahar") => void;
}

const CHIP_COLORS: Record<number, string> = {
    500: "#e74c3c",
    1000: "#27ae60",
    2000: "#8e44ad",
    5000: "#d35400",
    10000: "#2c3e50",
};

const ChipStack = ({ chips }: { chips: number[] }) => {
    const visible = chips.slice(-8); // show last 8 chips max
    return (
        <div className="relative flex items-end justify-center" style={{ height: 60 }}>
            {visible.map((chip, i) => (
                <div
                    key={i}
                    className="absolute rounded-full border-2 border-white/20 chip-stack-item"
                    style={{
                        width: 36,
                        height: 36,
                        background: `radial-gradient(circle at 35% 35%, ${CHIP_COLORS[chip] || "#555"}cc, ${CHIP_COLORS[chip] || "#333"})`,
                        bottom: i * 4,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: i,
                        boxShadow: `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
                        animationDelay: `${i * 0.02}s`,
                    }}
                />
            ))}
        </div>
    );
};

const BettingZones = ({
    andarTotal,
    baharTotal,
    andarChips,
    baharChips,
    bettingOpen,
    result,
    onBet,
}: BettingZonesProps) => {
    const andarRef = useRef<HTMLButtonElement>(null);
    const baharRef = useRef<HTMLButtonElement>(null);

    // Ripple effect on click
    const handleClick = (side: "andar" | "bahar", e: React.MouseEvent) => {
        if (!bettingOpen) return;
        const btn = side === "andar" ? andarRef.current : baharRef.current;
        if (!btn) return;
        const ripple = document.createElement("span");
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.cssText = `
      position:absolute;width:${size}px;height:${size}px;
      left:${e.clientX - rect.left - size / 2}px;
      top:${e.clientY - rect.top - size / 2}px;
      background:rgba(255,255,255,0.2);border-radius:50%;
      transform:scale(0);animation:ripple 0.5s linear;pointer-events:none;
    `;
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
        onBet(side);
    };

    return (
        <div className="flex gap-3 w-full h-full">
            {/* ANDAR */}
            <button
                ref={andarRef}
                onClick={(e) => handleClick("andar", e)}
                disabled={!bettingOpen}
                className={`relative flex-1 rounded-2xl flex flex-col items-center justify-between py-4 px-3 overflow-hidden transition-all duration-200 select-none
          ${!bettingOpen ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-110 active:scale-[0.98]"}
          ${result === "andar" ? "zone-win-glow" : ""}
          ${result === "bahar" ? "opacity-50" : ""}
        `}
                style={{
                    background: result === "andar"
                        ? "linear-gradient(160deg, #c0392b, #922b21)"
                        : "linear-gradient(160deg, #922b21, #641e16)",
                    border: result === "andar"
                        ? "2px solid #f1948a"
                        : "2px solid rgba(255,255,255,0.08)",
                }}
            >
                <div className="text-white font-black text-2xl tracking-[0.15em] drop-shadow-lg">ANDAR</div>

                <div className="flex-1 flex items-center justify-center w-full py-2">
                    {andarChips.length > 0 ? (
                        <ChipStack chips={andarChips} />
                    ) : (
                        <div className="text-white/20 text-xs uppercase tracking-widest">Click to bet</div>
                    )}
                </div>

                <div className="text-center">
                    <div className="text-white/50 text-[9px] uppercase tracking-wider">Total Bet</div>
                    <div className="text-white font-black text-lg">
                        {andarTotal > 0 ? `₹${andarTotal.toLocaleString()}` : "—"}
                    </div>
                </div>

                {result === "andar" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
                        <span className="text-white font-black text-3xl drop-shadow-lg animate-bounce">🏆 WIN</span>
                    </div>
                )}
            </button>

            {/* Divider */}
            <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                <div className="w-px h-full bg-white/10" />
                <div className="text-white/30 text-[10px] font-bold tracking-widest rotate-0 bg-black/40 px-1 py-2 rounded">VS</div>
                <div className="w-px h-full bg-white/10" />
            </div>

            {/* BAHAR */}
            <button
                ref={baharRef}
                onClick={(e) => handleClick("bahar", e)}
                disabled={!bettingOpen}
                className={`relative flex-1 rounded-2xl flex flex-col items-center justify-between py-4 px-3 overflow-hidden transition-all duration-200 select-none
          ${!bettingOpen ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-110 active:scale-[0.98]"}
          ${result === "bahar" ? "zone-win-glow" : ""}
          ${result === "andar" ? "opacity-50" : ""}
        `}
                style={{
                    background: result === "bahar"
                        ? "linear-gradient(160deg, #1a5276, #154360)"
                        : "linear-gradient(160deg, #1a3a4a, #0d2233)",
                    border: result === "bahar"
                        ? "2px solid #7fb3d3"
                        : "2px solid rgba(255,255,255,0.08)",
                }}
            >
                <div className="text-white font-black text-2xl tracking-[0.15em] drop-shadow-lg">BAHAR</div>

                <div className="flex-1 flex items-center justify-center w-full py-2">
                    {baharChips.length > 0 ? (
                        <ChipStack chips={baharChips} />
                    ) : (
                        <div className="text-white/20 text-xs uppercase tracking-widest">Click to bet</div>
                    )}
                </div>

                <div className="text-center">
                    <div className="text-white/50 text-[9px] uppercase tracking-wider">Total Bet</div>
                    <div className="text-white font-black text-lg">
                        {baharTotal > 0 ? `₹${baharTotal.toLocaleString()}` : "—"}
                    </div>
                </div>

                {result === "bahar" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
                        <span className="text-white font-black text-3xl drop-shadow-lg animate-bounce">🏆 WIN</span>
                    </div>
                )}
            </button>
        </div>
    );
};

export default BettingZones;
