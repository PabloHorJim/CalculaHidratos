/**
 * Determines the meal slot (periodo de comida) based on an hour.
 */
export const getMealSlot = (hour: number): string => {
    if (hour >= 6 && hour < 12) return 'breakfast';
    if (hour >= 12 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 23) return 'dinner';
    return 'night';
};
