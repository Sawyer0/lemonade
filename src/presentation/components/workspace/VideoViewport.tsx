import { FC, useState } from 'react';

interface VideoViewportProps {
    videoUrl?: string;
}

export const VideoViewport: FC<VideoViewportProps> = ({ videoUrl }) => {
    const [hasError, setHasError] = useState(false);

    const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        console.error("Video Playback Error:", e.nativeEvent);
        setHasError(true);
    };

    // Reset error state when URL changes
    if (videoUrl && hasError) {
        setHasError(false);
    }

    if (!videoUrl || hasError) {
        return (
            <div className="absolute inset-0 z-0 bg-zinc-900 flex items-center justify-center">
                <p className="text-zinc-500 font-mono">
                    {hasError ? "VIDEO SIGNAL LOST" : "WAITING FOR VIDEO FEED..."}
                </p>
            </div>
        );
    }

    // If it's a Google Storage URI (gs://), we can't play it directly in the browser.
    // Since playback isn't required, we show a status placeholder.
    if (videoUrl?.startsWith('gs://')) {
        return (
            <div className="absolute inset-0 z-0 bg-zinc-900 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                    <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <p className="text-zinc-400 font-mono text-sm">VIDEO UPLOADED • ANALYZING</p>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-0">
            <video
                src={videoUrl}
                className="w-full h-full object-cover"
                controls={false}
                autoPlay
                loop
                muted
                playsInline
                onError={handleError}
            />
        </div>
    );
};
