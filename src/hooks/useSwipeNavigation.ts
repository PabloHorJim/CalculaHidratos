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
    const ignore = useRef(false);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        // Dragging a slider or moving the caret in a text field is not a tab swipe
        const target = e.target as HTMLElement | null;
        ignore.current = !!target?.closest?.('input, textarea, select, [data-no-swipe]');
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
    }, []);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (ignore.current) return;
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
