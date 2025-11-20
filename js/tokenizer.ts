const SIMPLE_TOKENIZER_CACHE: { [key: string]: string[] } = {};
const SIMPLE_TOKENIZER_CACHE_TIMEOUTS : { [key: string]: any } = {};

export function simpleTokenizer(input: string): string[] {
    if (SIMPLE_TOKENIZER_CACHE[input]) {
        clearTimeout(SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input]);
        SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input] = setTimeout(() => {
            delete SIMPLE_TOKENIZER_CACHE[input];
            delete SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input];
        }, 60000); // Cache timeout of 60 seconds
        return SIMPLE_TOKENIZER_CACHE[input];
    }

    const tokens: string[] = [];
    let currentToken = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (/\s/.test(char)) {
            if (currentToken) {
                tokens.push(currentToken);
                currentToken = '';
            }
        } else if (/[.,!?;:()]/.test(char)) {
            if (currentToken) {
                tokens.push(currentToken);
                currentToken = '';
            }
            tokens.push(char);
        } else {
            currentToken += char;
        }
    }

    if (currentToken) {
        tokens.push(currentToken);
    }

    SIMPLE_TOKENIZER_CACHE[input] = tokens.map((token) => normalizeToken(token)).filter((token) => token.length > 0);

    SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input] = setTimeout(() => {
        delete SIMPLE_TOKENIZER_CACHE[input];
        delete SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input];
    }, 60000); // Cache timeout of 60 seconds

    return SIMPLE_TOKENIZER_CACHE[input];
}

// it should normalize tokens for languages like english, spanish, french, finnish, norwegian, swedish, german, dutch, etc...
function normalizeToken(token: string): string {
    const accentsMap: { [key: string]: string } = {
        'á': 'a',
        'é': 'e',
        'í': 'i',
        'ó': 'o',
        'ú': 'u',
        'ñ': 'n',
        'ä': 'a',
        'ö': 'o',
        'ü': 'u',
    };

    // normalize common prefixes and suffixes for languages like english, spanish, french, finnish, norwegian, swedish, german, dutch, etc...
    const commonPrefixes = ['un', 're', 'in', 'im', 'dis', 'en', 'non', 'non-', 'pre', 'pre-', 'mis', 'sub', 'inter', 'fore', 'de', 'trans', 'super', 'semi', 'anti', 'mid', 'under'];
    const commonSuffixes = ['s', 'es', 'ed', 'ing', 'ly', 'er', 'or', 'ion', 'tion', 'ation', 'ity', 'ment', 'ness', 'ful', 'less', 'est', 'ive', 'y', 'ize', 'ise', 'ify', 'en', 'ssa', 'lla', 'aa'];

    for (const prefix of commonPrefixes) {
        if (token.startsWith(prefix)) {
            token = token.replace(prefix, '');
            break;
        }
    }

    for (const suffix of commonSuffixes) {
        if (token.endsWith(suffix)) {
            token = token.replace(suffix, '');
            break;
        }
    }

    return token
        .toLowerCase()
        .replace(/[áéíóúñäöü]/g, (match) => accentsMap[match] || match);
}

/**
 * Checks how similar two token arrays are and gives a score between 0 and 1.
 * @param tokensA 
 * @param tokensB 
 * @returns 
 */
export function tokenSimilarityCompare(tokensA: string[], tokensB: string[]): number {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}

/**
 * Checks what proportion of tokens in tokensContained are also in tokensContainer and gives a score between 0 and 1.
 * @param tokensContainer 
 * @param tokensContained 
 */
export function tokenContainmentCompare(tokensContainer: string[], tokensContained: string[]): number {
    const setContainer = new Set(tokensContainer);
    const setContained = new Set(tokensContained);

    const intersection = new Set([...setContained].filter(x => setContainer.has(x)));

    return intersection.size / setContained.size;
}

export function tokenIncludesScore(tokensContainer: string[], tokensContained: string[], minimum_relevant: number): number {
    // we need to look for exact sequences of tokensContained in tokensContainer in the same order as well as potential fragments
    let score = 0;
    // we will iterate over tokensContained to check each token as if it is found
    for (let i = 0; i < tokensContained.length; i++) {
        // find the token in tokensContainer
        let thisTokenMaxScoreSoFar = 0;
        // now we will iterate over tokensContainer to find matches
        for (let j = 0; j < tokensContainer.length; j++) {
            // check if tokensContainer[j] matches tokensContained[i]
            if (tokensContainer[j] === tokensContained[i]) {
                // now we need to see how many tokens match in sequence from this point
                // we will calculate a score for this token match based on how many tokens match in sequence
                let thisTokenScoreAtThisLocation = 0;
                // we found a match, now let's check if the token is surrounded by the tokens before and after it that match as well
                let matchLength = 0;
                let matchMax = 0
                // check backwards and forwards, seeing how well the surrounding tokens match
                for (let k = -i; k < tokensContained.length - i; k++) {
                    // the further away we go, the less weight it has, so we add a fraction of 1 based on how far we are from the center
                    const potentialScoreAdded = 1 - (Math.abs(k) / tokensContained.length);
                    matchMax += potentialScoreAdded;
                    if (tokensContainer[j + k] === tokensContained[i + k]) {
                        matchLength += potentialScoreAdded
                    }
                }

                // calculate score for this token at this location
                thisTokenScoreAtThisLocation = matchLength / matchMax;
                
                // see if it's the best score for this token so far
                // use a max function to keep the best score
                if (thisTokenScoreAtThisLocation > thisTokenMaxScoreSoFar) {
                    thisTokenMaxScoreSoFar = thisTokenScoreAtThisLocation;
                }
            }
        }

        // add the best score for this token to the total score
        score += thisTokenMaxScoreSoFar;
    }

    // average the score over the number of tokens contained
    const finalScore = score / tokensContained.length;

    // check if the final score is above the minimum relevant threshold
    if (finalScore >= minimum_relevant) {
        return finalScore;
    }

    return 0;
}