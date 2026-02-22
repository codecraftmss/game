const CHIPS = [
    { value: 500, label: "500", color: "#e74c3c", shadow: "#c0392b" },
    { value: 1000, label: "1K", color: "#27ae60", shadow: "#1e8449" },
    { value: 2000, label: "2K", color: "#8e44ad", shadow: "#6c3483" },
    { value: 5000, label: "5K", color: "#d35400", shadow: "#a04000" },
    { value: 10000, label: "10K", color: "#2c3e50", shadow: "#1a252f" },
];

interface ChipSelectorProps {
    selected: number | null;
    onSelect: (value: number) => void;
    disabled: boolean;
}

const ChipSelector = ({ selected, onSelect, disabled }: ChipSelectorProps) => (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
        {CHIPS.map((chip) => {
            const isSelected = selected === chip.value;
            return (
                <button
                    key={chip.value}
                    onClick={() => !disabled && onSelect(chip.value)}
                    disabled={disabled}
                    className={`chip-btn relative flex items-center justify-center rounded-full font-bold text-white select-none transition-all duration-150
            ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:scale-110 active:scale-95"}
            ${isSelected ? "chip-selected" : ""}
          `}
                    style={{
                        width: 52,
                        height: 52,
                        background: `radial-gradient(circle at 35% 35%, ${chip.color}ee, ${chip.shadow})`,
                        boxShadow: isSelected
                            ? `0 0 0 3px #f1c40f, 0 0 16px #f1c40f88, 0 4px 12px ${chip.shadow}99`
                            : `0 4px 8px ${chip.shadow}99, inset 0 1px 0 rgba(255,255,255,0.2)`,
                        border: `2px dashed rgba(255,255,255,0.25)`,
                        fontSize: chip.value >= 10000 ? 10 : 12,
                    }}
                >
                    {/* Inner ring */}
                    <div
                        className="absolute inset-[6px] rounded-full border border-white/20 flex items-center justify-center"
                        style={{ background: `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.15), transparent)` }}
                    >
                        <span className="font-black tracking-tight leading-none">{chip.label}</span>
                    </div>
                    {isSelected && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border border-black" />
                    )}
                </button>
            );
        })}
    </div>
);

export default ChipSelector;
