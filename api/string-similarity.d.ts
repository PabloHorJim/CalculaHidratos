declare module 'string-similarity' {
    export interface BestMatch {
        ratings: { target: string; rating: number }[];
        bestMatch: { target: string; rating: number };
        bestMatchIndex: number;
    }
    export function findBestMatch(mainString: string, targetStrings: string[]): BestMatch;
    export function compareTwoStrings(first: string, second: string): number;
    const _default: { findBestMatch: typeof findBestMatch; compareTwoStrings: typeof compareTwoStrings };
    export default _default;
}
