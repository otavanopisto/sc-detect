export function simpleTokenizer(input: string): string[] {
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

    return tokens.map((token) => normalizeToken(token)).filter((token) => token.length > 0);
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

export function tokenSimilarityCompare(tokensA: string[], tokensB: string[]): number {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}