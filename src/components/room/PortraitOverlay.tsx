import { RotateCcw } from "lucide-react";

const PortraitOverlay = () => (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center gap-6 portrait-only">
        <div className="relative">
            <RotateCcw className="w-16 h-16 text-amber-400 animate-spin-slow" />
        </div>
        <div className="text-center px-8">
            <p className="text-white text-xl font-bold mb-2">Rotate Your Device</p>
            <p className="text-white/50 text-sm">Please rotate to landscape mode to play</p>
        </div>
        <div className="flex gap-2 mt-2">
            <div className="w-16 h-10 border-2 border-amber-400/40 rounded-lg flex items-center justify-center">
                <div className="w-8 h-6 bg-amber-400/20 rounded" />
            </div>
            <div className="text-amber-400 self-center text-2xl">→</div>
            <div className="w-10 h-16 border-2 border-amber-400 rounded-lg flex items-center justify-center rotate-90">
                <div className="w-8 h-6 bg-amber-400/40 rounded" />
            </div>
        </div>
    </div>
);

export default PortraitOverlay;
