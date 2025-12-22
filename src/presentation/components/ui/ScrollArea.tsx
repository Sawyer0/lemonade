import React from 'react';
import { clsx } from 'clsx';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
    ({ children, className, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={clsx(
                    "overflow-y-scroll",
                    // Custom Scrollbar Styling for visibility
                    "[&::-webkit-scrollbar]:w-2",
                    "[&::-webkit-scrollbar-track]:bg-zinc-800",
                    "[&::-webkit-scrollbar-thumb]:bg-zinc-500",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-zinc-400",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

ScrollArea.displayName = "ScrollArea";

