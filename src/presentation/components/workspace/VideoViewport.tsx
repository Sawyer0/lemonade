import { FC } from 'react';

interface VideoViewportProps {
    videoUrl?: string;
}

export const VideoViewport: FC<VideoViewportProps> = ({ videoUrl }) => {
    return (
        <div className="absolute inset-0 z-0">
            {videoUrl ? (
                <video
                    src={videoUrl}
                    className="w-full h-full object-cover"
                    controls={false}
                    autoPlay
                    loop
                    muted
                    playsInline
                />
            ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                    <p className="text-zinc-500 font-mono">WAITING FOR VIDEO FEED...</p>
                </div>
            )}
        </div>
    );
};
