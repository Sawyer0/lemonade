import { ILogger } from '@lemonade/core';

export interface PerformanceMetrics {
    fps: number;
    isThermalThrottled: boolean;
    shouldThrottle: boolean;
}

export class PerformanceMonitor {
    private fps: number = 60;
    private isThermalThrottled: boolean = false;

    constructor(private logger: ILogger) { }

    /**
     * Returns current performance metrics.
     * shouldThrottle is true if FPS is too low or device is overheating.
     */
    getMetrics(): PerformanceMetrics {
        const shouldThrottle = this.isThermalThrottled || this.fps < 15;

        if (shouldThrottle) {
            this.logger.warn('Performance degraded. Throttling active.', {
                fps: this.fps,
                isThermalThrottled: this.isThermalThrottled
            });
        }

        return {
            fps: this.fps,
            isThermalThrottled: this.isThermalThrottled,
            shouldThrottle
        };
    }

    /**
     * Updates the current FPS estimate.
     */
    updateFps(newFps: number): void {
        this.fps = newFps;
    }

    /**
     * Updates thermal throttling state.
     * In production, this would be updated via native thermal state events.
     */
    setThermalThrottled(throttled: boolean): void {
        if (throttled !== this.isThermalThrottled) {
            this.logger.info(`Thermal throttling state changed: ${throttled}`);
            this.isThermalThrottled = throttled;
        }
    }
}
