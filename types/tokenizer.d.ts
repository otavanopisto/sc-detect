export declare function simpleTokenizer(input: string): string[];
/**
 * Checks how similar two token arrays are and gives a score between 0 and 1.
 * @param tokensA
 * @param tokensB
 * @returns
 */
export declare function tokenSimilarityCompare(tokensA: string[], tokensB: string[]): number;
/**
 * Checks what proportion of tokens in tokensContained are also in tokensContainer and gives a score between 0 and 1.
 * @param tokensContainer
 * @param tokensContained
 */
export declare function tokenContainmentCompare(tokensContainer: string[], tokensContained: string[]): number;
export declare function tokenIncludesScore(tokensContainer: string[], tokensContained: string[], minimum_relevant: number): number;
