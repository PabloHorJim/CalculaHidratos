import React, { useRef, useCallback } from 'react';

interface SwipeConfig {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    threshold?: number;
    allowedTime?: number;
}

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold = 50, allowedTime = 400 }: SwipeConfig) {
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const touchStartTime = useRef(0);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
    }, []);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        const elapsed = Date.now() - touchStartTime.current;

        // Only trigger if horizontal movement is dominant and within time limit
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold && elapsed < allowedTime) {
            if (dx > 0) {
                onSwipeRight();
            } else {
                onSwipeLeft();
            }
        }
    }, [onSwipeLeft, onSwipeRight, threshold, allowedTime]);

    return { onTouchStart, onTouchEnd };
}
