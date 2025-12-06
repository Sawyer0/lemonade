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

    if (!videoUrl || hasError) {
        return (
            <div className="absolute inset-0 z-0 bg-zinc-900 flex items-center justify-center">
                <p className="text-zinc-500 font-mono">
                    {hasError ? "VIDEO SIGNAL LOST" : "WAITING FOR VIDEO FEED..."}
                </p>
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
