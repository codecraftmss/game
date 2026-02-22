import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
    streamUrl?: string;
}

// Extract YouTube video ID from any YouTube URL format
const getYouTubeId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([^&?\s]+)/,
        /youtube\.com\/embed\/([^&?\s]+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
};

const VideoPlayer = ({ streamUrl }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Detect if it's a YouTube URL
    const youtubeId = streamUrl ? getYouTubeId(streamUrl) : null;

    useEffect(() => {
        if (youtubeId) return; // YouTube uses iframe, not video tag
        const video = videoRef.current;
        if (!video || !streamUrl) return;

        if (Hls.isSupported()) {
            const hls = new Hls({
                lowLatencyMode: true,
                backBufferLength: 0,
                maxBufferLength: 4,
                maxMaxBufferLength: 8,
                liveSyncDurationCount: 2,
                liveMaxLatencyDurationCount: 4,
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => { });
            });
            return () => hls.destroy();
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = streamUrl;
            video.play().catch(() => { });
        }
    }, [streamUrl, youtubeId]);

    return (
        <div className="relative w-full h-full flex items-center justify-center bg-black rounded-xl overflow-hidden">
            {/* LIVE badge */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
            </div>

            {youtubeId ? (
                /* YouTube embed */
                <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ border: "none" }}
                />
            ) : streamUrl ? (
                /* HLS stream (VPS / Cloudflare) */
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                    autoPlay
                    playsInline
                    controls={false}
                />
            ) : (
                /* No stream yet */
                <div className="flex flex-col items-center justify-center gap-3 text-white/30 w-full h-full bg-gradient-to-br from-gray-900 to-black">
                    <div className="text-5xl">🎴</div>
                    <p className="text-sm font-medium tracking-wider uppercase">Live Stream Loading...</p>
                    <div className="flex gap-1 mt-2">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="w-2 h-2 rounded-full bg-red-500 animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
