import { simpleTokenizer, tokenContainmentCompare, tokenIncludesScore, tokenSimilarityCompare } from "./tokenizer";
import { findAISignatures } from "./ai";

/**
 * Watchdog module to monitor copy-paste behavior and tab switching
 * to detect potential cheating
 * 
 * weights:
 *  - KEEPS_SWITCHING_TABS_AND_COPY_PASTING: weight for the factor that measures
 *    how much the user keeps switching tabs and copy-pasting
 *  - COPY_RELATES_TO_PASTE: weight for the factor that measures how much
 *   the copy events relate to the paste events
 *  - CONTENT_CONTAINS_AI_SIGNATURES: weight for the factor that measures
 *   how much the content contains AI signatures
 *  - UNMODIFIED_PASTES: weight for the factor that measures how much
 *  the pastes are unmodified
 * 
 * min_copy_event_time_weight: minimum weight for the time factor, the closer it is to the time limit, the minimum weight is applied
 * min_tab_event_time_weight: minimum weight for the time factor, the closer it is to the time limit, the minimum weight is applied
 * 
 * Keep the weights summing to 1.0 in order to have a proper confidence score
 * between 0 and 1.0
 * 
 * Note that a confidence score close to 1.0 does not necessarily mean cheating,
 * but rather a high likelihood of cheating behavior based on the monitored factors.
 * A human review is still recommended for high confidence scores.
 * 
 * paste_size_threshold: minimum size of pasted content to consider
 * copy_size_threshold: minimum size of copied content to consider
 * settings:
 *  - relevant_copy_event_minutes: time window in minutes to consider
 *    copy events as relevant to paste events
 *  - relevant_tab_in_out_event_minutes: time window in minutes to consider
 *    tab in/out events as relevant to copy-paste behavior
 */
export interface WatchdogConfig {
    weights: {
        reasons: {
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: number,
            COPY_RELATES_TO_PASTE: number,
            CONTENT_CONTAINS_AI_SIGNATURES: number,
            UNMODIFIED_PASTES: number,
        },
        min_copy_event_time_weight: number,
        min_tab_event_time_weight: number,
    },
    paste_size_threshold: number,
    copy_size_threshold: number,
    settings: {
        relevant_copy_event_minutes: number;
        relevant_tab_in_out_event_minutes: number;
    }
}

/**
 * The default configuration for the Watchdog module
 */
const DEFAULT_CONFIG: WatchdogConfig = {
    weights: {
        reasons: {
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: 0.3,
            COPY_RELATES_TO_PASTE: 0.3,
            CONTENT_CONTAINS_AI_SIGNATURES: 0.2,
            UNMODIFIED_PASTES: 0.1,
        },
        min_copy_event_time_weight: 0.5,
        min_tab_event_time_weight: 0.5,
    },
    paste_size_threshold: 30,
    copy_size_threshold: 30,
    settings: {
        relevant_copy_event_minutes: 5,
        relevant_tab_in_out_event_minutes: 5,
    }
}

/**
 * Factors that influence the Watchdog analysis
 * - deadline: time remaining until the deadline in minutes, if zero or negative, no deadline
 * - caught_rate: rate of previous cheating detections for the user, between 0 and 1
 * - non_native_language: whether the user is using a non-native language for the test
 */
export interface WatchdogFactors {
    deadline: number,
    caught_rate: number,
    non_native_language: boolean,
}

/**
 * The default factors for the Watchdog module
 * - deadline: 0 (no deadline)
 * - caught_rate: 0 (no previous cheating detections)
 * - non_native_language: false (native language)
 */
const DEFAULT_FACTORS: WatchdogFactors = {
    deadline: 0,
    caught_rate: 0,
    non_native_language: false,
}

/**
 * Interface for copy-paste contribution objects
 */
export interface CopyPasteContribution {
    /**
     * AI signature score for the pasted content, a number between 0 and 1 on whether the content has AI signatures
     */
    aiScore: number;
    /**
     * Cheating paste score based on similarity and related copy/tab switch events, a number between 0 and 1
     */
    pasteScore: number;
    /**
     * Final score for this contribution, a number between 0 and 1, the maximum between aiScore and pasteScore
     */
    score: number;
    /**
     * Timestamp of the paste event
     */
    timestamp: Date;
    /**
     * Similarity between copied and pasted content, a number between 0 and 1
     */
    similarity: number;
    /**
     * Factor how much a paste is related to a copy event, based on the content of the tokens, a number between 0 and 1
     */
    containment: number;
    /**
     * Factor how much a paste is related to a copy event, based on the time and tab switching, a number between 0 and 1
     */
    copyFactor: number;
    /**
     * Factor how much a paste is related to a tab switch event, based on the time, a number between 0 and 1
     */
    tabSwitchFactor: number;
    /**
     * Content of the pasted text
     */
    content: string;
}

/**
 * State interface for each WatchdogHandle, each one represents a monitored input element or textarea
 * - COPY_PASTE_CONTRIBUTIONS: array of copy-paste contribution objects
 * - COPY_RELATES_TO_PASTE: score for the factor that measures how much copy events relate to paste events
 * - CONTENT_CONTAINS_AI_SIGNATURES: score for the factor that measures how much the content contains AI signatures
 * - UNMODIFIED_PASTES: score for the factor that measures how much the pastes are unmodified
 * - KEEPS_SWITCHING_TABS_AND_COPY_PASTING: score for the factor that measures how much the user keeps switching tabs and copy-pasting
 * 
 * All factors are between 0 and 1, the final confidence score is calculated
 * by weighting each factor according to the weights defined in the WatchdogConfig
 */
export interface WatchdogHandleState {
    COPY_PASTE_CONTRIBUTIONS: Array<CopyPasteContribution>;
    COPY_RELATES_TO_PASTE: number;
    CONTENT_CONTAINS_AI_SIGNATURES: number;
    UNMODIFIED_PASTES: number;
    KEEPS_SWITCHING_TABS_AND_COPY_PASTING: number;
}

export type WatchdogStateLoader = () => Promise<WatchdogHandleState>;

class WatchdogHandle {
    element: HTMLElement;
    watchdog: Watchdog;
    isInitialized: boolean = false;
    state: WatchdogHandleState;
    loadStateLoader: WatchdogStateLoader | null = null;
    listeners: Array<(analysis: IWatchdogAnalysis) => void> = [];
    doNotSetupEvents: boolean = false;
    //shouldBeAttemptedToProcessAsInputDiff: boolean = false;
    //lastInputValue: string = "";
    //selectionWhilePaste: string = "";

    constructor(element: HTMLElement, watchdog: Watchdog) {
        this.element = element;
        this.watchdog = watchdog;
        this.state = {
            COPY_PASTE_CONTRIBUTIONS: [],
            // INPUT_CONTRIBUTIONS: [],

            COPY_RELATES_TO_PASTE: 0,
            CONTENT_CONTAINS_AI_SIGNATURES: 0,
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: 0,
            UNMODIFIED_PASTES: 0,
        };

        this.handlePaste = this.handlePaste.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }
    public setStateLoader(fn: WatchdogStateLoader) {
        this.loadStateLoader = fn;
    }

    /**
     * Initialize the WatchdogHandle
     * @param doNotSetupEvents If true, do not setup event listeners, you will need to set them up manually
     * by calling handlePaste and handleInput methods manually
     */
    async initialize(doNotSetupEvents: boolean = false) {
        if (!this.watchdog.isMonitoring) {
            throw new Error('Watchdog is not initialized. Please call scDetect.initialize() first.');
        }
        this.isInitialized = true;
        this.doNotSetupEvents = doNotSetupEvents;
        // make sure that is in an input with contenteditable or textarea or input type=text
        const tagName = this.element.tagName.toLowerCase();
        const type = (this.element as HTMLInputElement).type;
        if (tagName === 'textarea' || (tagName === 'input' && type === 'text') || this.element.isContentEditable) {
            // Start monitoring the element for copy-paste and tab switch events
            // Implementation of monitoring logic goes here
            await this.loadState();
            this.restart();
        } else {
            throw new Error('Element is not a valid input field (textarea, input type=text, or contenteditable).');
        }
    }
    public async loadState() {
        // Implementation of loadState method for this handle
        // Load any saved state from this.state
        if (this.loadStateLoader) {
            this.state = await this.loadStateLoader();
        }

        // TODO other loading mechanisms can be added here
        this.recalculateCopyRelatesToPaste();
        this.recalculateAIScore();
        this.recalculateUnmodifiedPastes();
        this.recalculateKeepsSwitchingTabsAndCopyPasting();
        this.onNewScoreCalculated();
    }
    public getState() {
        return this.state;
    }
    public restart() {
        if (!this.isInitialized) {
            throw new Error('WatchdogHandle is not initialized. Please call initialize() first.');
        }
        
        //this.lastInputValue = this.getContentFromHTMLElement();

        // Implementation of restart method for this handle
        // add event listeners to paste, input
        if (!this.doNotSetupEvents) {
            this.element.removeEventListener('paste', this.handlePaste);
            this.element.removeEventListener('input', this.handleInput as any);
            this.element.addEventListener('paste', this.handlePaste);
            this.element.addEventListener('input', this.handleInput as any);
        }
    }
    public stop() {
        // Implementation of stop method for this handle
        this.isInitialized = false;

        // remove all event listeners
        if (!this.doNotSetupEvents) {
            this.element.removeEventListener('paste', this.handlePaste);
            this.element.removeEventListener('input', this.handleInput as any);
        }
    }
    public destroy() {
        // Implementation of destroy method for this handle
        this.stop();
        // Additional cleanup
        this.watchdog.handles = this.watchdog.handles.filter(h => h !== this);
    }
    public handleInput(e: InputEvent) {
        //if (e.inputType === "insertFromPaste" && this.shouldBeAttemptedToProcessAsInputDiff) {
        //    this.shouldBeAttemptedToProcessAsInputDiff = false;

        //    const originalText = this.lastInputValue.replace(this.selectionWhilePaste, '');
        //    const currentText = this.getContentFromHTMLElement();

        //    let newText = ""
        //    let startIndex = 0;
        //    let endIndex = currentText.length - 1;

            // we want to move this cursor through the originalText and currentText and find where they differ to set our start index
        //    while (startIndex < originalText.length && startIndex < currentText.length && originalText[startIndex] === currentText[startIndex]) {
        //        startIndex++;
        //    }
            // now we do the same from the end to find the end index
        //    while (endIndex >= 0 && endIndex >= startIndex && originalText[originalText.length - 1 - (currentText.length - 1 - endIndex)] === currentText[endIndex]) {
        //        endIndex--;
        //    }

        //    if (endIndex >= startIndex) {
        //        newText = currentText.substring(startIndex, endIndex + 1);
        //        console.log(newText);
        //        this.handlePastedText(newText);
        //    }

        //}

        this.recalculateCopyRelatesToPaste();
        this.recalculateAIScore();
        this.recalculateUnmodifiedPastes();
        this.recalculateKeepsSwitchingTabsAndCopyPasting();
        this.onNewScoreCalculated();

        //this.lastInputValue = this.getContentFromHTMLElement();
    }
    /**
     * If you want to refresh the internal input value
     * Because you have some external code modifying the input value
     * programmatically rather than the user typing or pasting, please
     * call this method to update the internal state.
     */
    //refreshInternalInputValue() {
    //    this.lastInputValue = this.getContentFromHTMLElement();
    //}
    public handlePaste(e: ClipboardEvent) {
        const clipboardData = e.clipboardData;
        if (!clipboardData) {
            return;
        }
        const text = clipboardData.getData('text/plain');

        if (!text) {
            //this.shouldBeAttemptedToProcessAsInputDiff = true;
            //this.selectionWhilePaste = document.getSelection()?.toString() || "";
            return;
        }

        // check if it fits the paste size threshold
        if (text.length < this.watchdog.config.paste_size_threshold) {
            return;
        }

        this.handlePastedText(text);
    }

    private handlePastedText(text: string) {
        const tokens = simpleTokenizer(text);
        const similarity = tokenSimilarityCompare(tokens, this.watchdog.lastCopiedInfo ? this.watchdog.lastCopiedInfo.tokens : []);
        const containment = this.watchdog.lastCopiedInfo?.tokens.length ? tokenContainmentCompare(tokens, this.watchdog.lastCopiedInfo ? this.watchdog.lastCopiedInfo.tokens : []) : 0;

        // similarities too high are likely modified pastes, so we just ignore them
        if (similarity > 0.9) {
            return;
        }

        // Now lets look for a copy event, followed by a tabout event, followed by this paste event
        // within a reasonable time frame (e.g., 5 minutes)
        const now = new Date();
        let foundRelatedCopy = false;
        let foundRelatedCopyTimeFactor = 0;
        let switchedTabsRecently = false;
        let switchedTabsRecentlyTimeFactor = 0;

        if (this.watchdog.lastCopiedInfo) {
            const timeDiff = now.getTime() - this.watchdog.lastCopiedInfo.timestamp.getTime();
            if (timeDiff < this.watchdog.config.settings.relevant_copy_event_minutes * 60 * 1000) {
                foundRelatedCopy = true;
                foundRelatedCopyTimeFactor = 1 - (timeDiff / (this.watchdog.config.settings.relevant_copy_event_minutes * 60 * 1000));
                if (foundRelatedCopyTimeFactor < this.watchdog.config.weights.min_copy_event_time_weight) {
                    foundRelatedCopyTimeFactor = this.watchdog.config.weights.min_copy_event_time_weight;
                }
            }
        }

        if (this.watchdog.activeTabFocusInfo) {
            const timeDiff = now.getTime() - this.watchdog.activeTabFocusInfo.focused_in.getTime();
            if (timeDiff < this.watchdog.config.settings.relevant_tab_in_out_event_minutes * 60 * 1000) {
                switchedTabsRecently = true;
                switchedTabsRecentlyTimeFactor = 1 - (timeDiff / (this.watchdog.config.settings.relevant_tab_in_out_event_minutes * 60 * 1000));
                if (switchedTabsRecentlyTimeFactor < this.watchdog.config.weights.min_tab_event_time_weight) {
                    switchedTabsRecentlyTimeFactor = this.watchdog.config.weights.min_tab_event_time_weight;
                }
            }
        }

        const foundRelatedCopyFactor = (foundRelatedCopy ? 1 : 0) * foundRelatedCopyTimeFactor;
        const switchedTabsRecentlyFactor = (switchedTabsRecently ? 1 : 0) * switchedTabsRecentlyTimeFactor;
        // the cheating paste score is the average of the three factors
        // we weight equally the containment, as in if the pasted content relates to copied content and by how much it relates
        // and the foundRelatedCopyFactor and switchedTabsRecentlyFactor, which are time-weighted factors indicating recent related copy and tab switch events
        const cheatingPasteScore = containment * foundRelatedCopyFactor * switchedTabsRecentlyFactor;
        let score = cheatingPasteScore;

        // we also check for AI signatures in the pasted content
        const aiScore = findAISignatures(text, 1);

        // if aiScore is higher than cheatingPasteScore, we use that as the score
        if (aiScore >= cheatingPasteScore) {
            score *= aiScore;
        }

        this.state.COPY_PASTE_CONTRIBUTIONS.push({
            pasteScore: cheatingPasteScore,
            score: score,
            aiScore: aiScore,
            timestamp: now,
            similarity: similarity,
            containment: containment,
            copyFactor: foundRelatedCopyFactor,
            tabSwitchFactor: switchedTabsRecentlyFactor,
            content: text,
        });
    }
    private recalculateCopyRelatesToPaste() {
        // calculate average score, guarding against empty contributions array
        if (this.state.COPY_PASTE_CONTRIBUTIONS.length === 0) {
            this.state.COPY_RELATES_TO_PASTE = 0;
        } else {
            // we average the scores of all contributions
            let total = 0;
            const currentContent = this.getContentFromHTMLElement();
            this.state.COPY_PASTE_CONTRIBUTIONS.forEach((contribution) => {
                // let's see how much of the content out of the current content is made of copied content
                const tokenIncludesScoreValue = tokenIncludesScore(simpleTokenizer(currentContent), simpleTokenizer(contribution.content), 0.7);
                total += tokenIncludesScoreValue * contribution.score;
            })
            this.state.COPY_RELATES_TO_PASTE = total / this.state.COPY_PASTE_CONTRIBUTIONS.length;
        }
    }
    private recalculateAIScore() {
        if (this.state.COPY_PASTE_CONTRIBUTIONS.length === 0) {
            this.state.CONTENT_CONTAINS_AI_SIGNATURES = 0;
        } else {
            let total = 0;
            const currentContent = this.getContentFromHTMLElement();
            this.state.COPY_PASTE_CONTRIBUTIONS.forEach((contribution) => {
                // let's see how much of the content out of the current content is made of copied content
                const tokenIncludesScoreValue = tokenIncludesScore(simpleTokenizer(currentContent), simpleTokenizer(contribution.content), 0.7);
                total += tokenIncludesScoreValue * contribution.aiScore;
            })
            this.state.CONTENT_CONTAINS_AI_SIGNATURES = total / this.state.COPY_PASTE_CONTRIBUTIONS.length;
        }
    }
    private recalculateUnmodifiedPastes() {
        // recalculate unmodified pastes factor
        let unmodifiedPastes = 0;
        const totalPastes = this.state.COPY_PASTE_CONTRIBUTIONS.length;

        if (totalPastes === 0) {
            this.state.UNMODIFIED_PASTES = 0;
            return;
        }

        let contentWorking = this.getContentFromHTMLElement();
        this.state.COPY_PASTE_CONTRIBUTIONS.forEach((contribution) => {
            if (contentWorking.includes(contribution.content)) {
                unmodifiedPastes++;
                // remove the pasted content from the working content to avoid double counting
                contentWorking = contentWorking.replace(contribution.content, '');
            } else {
                // find a match sentence by sentence
                const sentences = contribution.content.split(/(?<=[.!?])\s+|\n|\r\n/).filter(s => s.trim().length > 0);
                let localUnmodifiedPastes = 0;
                for (const sentence of sentences) {
                    if (contentWorking.includes(sentence)) {
                        localUnmodifiedPastes++;
                        // remove the pasted content from the working content to avoid double counting
                        contentWorking = contentWorking.replace(sentence, '');
                    }
                }
                unmodifiedPastes += localUnmodifiedPastes / sentences.length;
            }
        });

        const unmodifiedPastesRatio = unmodifiedPastes / totalPastes;
        const remainingCharacters = contentWorking.length;
        const totalCharacters = this.getContentFromHTMLElement().length;
        const remainingCharactersRatio = totalCharacters > 0 ? remainingCharacters / totalCharacters : 0;

        // combine both ratios to get a final unmodified pastes score
        const finalUnmodifiedPastesScore = (unmodifiedPastesRatio + (1 - remainingCharactersRatio)) / 2;

        this.state.UNMODIFIED_PASTES = finalUnmodifiedPastesScore;  
    }
    private recalculateKeepsSwitchingTabsAndCopyPasting() {
        // recalculate keeps switching tabs and copy pasting factor
        // for that we will look for an ever alternating pattern of tab switches followed by a paste event
        let switchingTabAndCopyPastingScore = 0;
        let totalPatterns = 0;

        // first let's loop in the tab focus history to find tab switches
        const tabFocusHistoryWithCurrent: TabFocusWatchInfo[] = [...this.watchdog.tabFocusWatchInfoHistory, this.watchdog.activeTabFocusInfo] as TabFocusWatchInfo[];

        if (tabFocusHistoryWithCurrent.length < 2) {
            this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING = 0;
            return;
        }

        const currentContent = this.getContentFromHTMLElement();
        const currentContentTokens = simpleTokenizer(currentContent);
        for (let i = 1; i < tabFocusHistoryWithCurrent.length; i++) {
            const current = tabFocusHistoryWithCurrent[i];
            const next = tabFocusHistoryWithCurrent[i + 1];

            // find one or more paste events between current.focused_out and next.focused_out so we can assume that it was a tab switch followed by a paste, if the
            // next has no focused_out, we use now as the end time
            const endTime = next && next.focused_out ? next.focused_out : new Date();
            const startTime = current.focused_out ? current.focused_out : current.focused_in;

            const pastesInBetween = this.state.COPY_PASTE_CONTRIBUTIONS.filter(contribution => {
                return contribution.timestamp >= startTime && contribution.timestamp <= endTime;
            });
            if (pastesInBetween.length > 0) {
                totalPatterns++;
                let maxScoreOfAPaste = 0;
                pastesInBetween.forEach((contribution) => {
                    let actualScore = 0;
                    // we need to check against the current content
                    // to see if the pasted content is included in the current content
                    // in one way or another
                    const tokenIncludesScoreValue = tokenIncludesScore(currentContentTokens, simpleTokenizer(contribution.content), 0.7);
                    actualScore = tokenIncludesScoreValue * contribution.score;
                    if (actualScore > maxScoreOfAPaste) {
                        maxScoreOfAPaste = actualScore;
                    }
                });
                switchingTabAndCopyPastingScore += maxScoreOfAPaste;
            }
        }

        if (totalPatterns === 0) {
            this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING = 0;
            return;
        }

        const finalScore = switchingTabAndCopyPastingScore / totalPatterns;
        this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING = finalScore;
    }
    private getContentFromHTMLElement() {
        // get the value of the input field, textarea or contenteditable
        if (this.element.tagName.toLowerCase() === 'textarea' || (this.element.tagName.toLowerCase() === 'input' && (this.element as HTMLInputElement).type === 'text')) {
            return (this.element as HTMLInputElement).value;
        } else if (this.element.isContentEditable) {
            return this.element.innerText;
        }
        return '';
    }
    public getLastAnalysis(): IWatchdogAnalysis {
        // we need to reweight these factors based on the config weights
        const WEIGHTED = {
            COPY_RELATES_TO_PASTE: this.state.COPY_RELATES_TO_PASTE*this.watchdog.config.weights.reasons.COPY_RELATES_TO_PASTE,
            CONTENT_CONTAINS_AI_SIGNATURES: this.state.CONTENT_CONTAINS_AI_SIGNATURES*this.watchdog.config.weights.reasons.CONTENT_CONTAINS_AI_SIGNATURES,
            UNMODIFIED_PASTES: this.state.UNMODIFIED_PASTES*this.watchdog.config.weights.reasons.UNMODIFIED_PASTES,
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING*this.watchdog.config.weights.reasons.KEEPS_SWITCHING_TABS_AND_COPY_PASTING,
        };

        return {
            raw: {
                COPY_RELATES_TO_PASTE: this.state.COPY_RELATES_TO_PASTE,
                CONTENT_CONTAINS_AI_SIGNATURES: this.state.CONTENT_CONTAINS_AI_SIGNATURES,
                UNMODIFIED_PASTES: this.state.UNMODIFIED_PASTES,
                KEEPS_SWITCHING_TABS_AND_COPY_PASTING: this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING,
            },
            weighted: WEIGHTED,
            confidence: WEIGHTED.COPY_RELATES_TO_PASTE +
                WEIGHTED.CONTENT_CONTAINS_AI_SIGNATURES +
                WEIGHTED.UNMODIFIED_PASTES +
                WEIGHTED.KEEPS_SWITCHING_TABS_AND_COPY_PASTING,
        };
    }
    private onNewScoreCalculated() {
        // placeholder for future event handling when a new score is calculated
        const analysis = this.getLastAnalysis();
        this.listeners.forEach((listener) => {
            listener(analysis);
        });
    }
    public addEventListenerOnNewScoreCalculated(callback: (analysis: IWatchdogAnalysis) => void) {
        this.listeners.push(callback);
    }
    public removeEventListenerOnNewScoreCalculated(callback: (analysis: IWatchdogAnalysis) => void) {
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }
}

export interface IWatchdogAnalysis {
    raw: {
        COPY_RELATES_TO_PASTE: number;
        CONTENT_CONTAINS_AI_SIGNATURES: number;
        UNMODIFIED_PASTES: number;
        KEEPS_SWITCHING_TABS_AND_COPY_PASTING: number;
    };
    weighted: {
        COPY_RELATES_TO_PASTE: number;
        CONTENT_CONTAINS_AI_SIGNATURES: number;
        UNMODIFIED_PASTES: number;
        KEEPS_SWITCHING_TABS_AND_COPY_PASTING: number;
    };
    confidence: number;
}

export interface TabFocusWatchInfo {
    focused_in: Date;
    focused_out?: Date;
    duration_ms?: number;
    gap_ms: number;
    is_focused: boolean;
}

export interface CopiedInfo {
    timestamp: Date;
    content: string;
    tokens: string[];
    size: number;
}

/**
 * Watchdog class to monitor copy-paste behavior and tab switching
 * this is the base class that manages the monitoring and analysis
 */
class Watchdog {
    /**
     * Configuration for the Watchdog module
     */
    config: WatchdogConfig;
    /**
     * Factors influencing the Watchdog's analysis
     */
    factors: WatchdogFactors;
    /**
     * Indicates whether the Watchdog is currently monitoring
     */
    isMonitoring: boolean = false;
    /**
     * Array of WatchdogHandle instances being monitored these
     * represent the monitored input elements or textareas
     */
    handles: WatchdogHandle[] = [];
    /**
     * User ID being monitored
     */
    userId: string | null = null;
    
    /**
     * Tab focus watch info history and active tab focus info
     * keeping track of when the tab was focused and unfocused
     * does not include the current active tab focus info
     */
    tabFocusWatchInfoHistory: TabFocusWatchInfo[] = [];
    /**
     * Active tab focus info representing the current tab focus state
     */
    activeTabFocusInfo: TabFocusWatchInfo | null = null;

    /**
     * Last copied info event
     */
    lastCopiedInfo: CopiedInfo | null = null;
    /**
     * History of last 10 copied info events, it includes the lastCopiedInfo as the last element
     */
    copyInfo10History: CopiedInfo[] = [];

    /**
     * Constructor for the Watchdog class
     */
    constructor() {
        // Initialization code
        this.config = DEFAULT_CONFIG;
        this.factors = DEFAULT_FACTORS;
        this.userId = null;

        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.query = this.query.bind(this);
        this.queryAll = this.queryAll.bind(this);
        this.initialize = this.initialize.bind(this);
        this.stop = this.stop.bind(this);
        this.changeUser = this.changeUser.bind(this);
        this.beginMonitoring = this.beginMonitoring.bind(this);
    }

    /**
     * query an element to monitor, use a CSS selector to pick this element or provide the element directly
     * @param selector 
     * @returns 
     */
    query(selector: string | HTMLElement) {
        // Implementation of query method
        const element = typeof selector === "string" ? document.querySelectorAll(selector) : [selector];
        // check that only one element is found
        if (element.length !== 1) {
            throw new Error(`Expected one element for selector "${selector}", but found ${element.length}.`);
        }
        const handle = new WatchdogHandle(element[0] as HTMLElement, this);
        this.handles.push(handle);
        return handle;
    }
    /**
     * Query all elements matching the selector to monitor, use a CSS selector to pick these elements
     * otherwise provide an array of elements directly
     * @param selector 
     */
    queryAll(selector: string | HTMLElement[]) {
        // Implementation of queryAll method
        const elements = typeof selector === "string" ? document.querySelectorAll(selector) : selector;
        return Array.from(elements).map((el) => {
            const handle = new WatchdogHandle(el as HTMLElement, this);
            this.handles.push(handle);
            return handle;
        });
    }

    /**
     * initialize the Watchdog module, this needs to be called before starting monitoring
     * otherwise an error will be thrown when trying to monitor elements, as the configuration
     * and factors will not be set; you can re-initialize to change user or configuration on the fly
     * 
     * @param userId 
     * @param config 
     * @param factors 
     */
    initialize(
        userId: string,
        config?: Partial<WatchdogConfig>,
        factors?: Partial<WatchdogFactors>,
    ) {
        // Implementation of initialize method
        // patch DEFAULT_CONFIG and DEFAULT_FACTORS with provided config and factors
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.factors = { ...DEFAULT_FACTORS, ...factors };
        this.userId = userId;

        if (!this.isMonitoring) {
            this.beginMonitoring();
        }
    }

    /**
     * stop the Watchdog monitoring
     */
    stop() {
        // Implementation of stop method
        this.isMonitoring = false;
        this.handles.forEach((handle) => handle.stop());

        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        document.removeEventListener('copy', this.handleCopy);
    }

    /**
     * Change the user being monitored, stops and restarts monitoring for the new user
     * 
     * @param userId 
     */
    changeUser(userId: string) {
        // Implementation of changeUser method
        this.userId = userId;
        this.stop();
        this.handles.forEach((handle) => handle.loadState());
        this.beginMonitoring();
    }

    /**
     * Begin monitoring for copy-paste and tab switching events
     */
    beginMonitoring() {
        // Implementation of beginMonitoring method
        this.isMonitoring = true;

        this.activeTabFocusInfo = {
            focused_in: new Date(),
            gap_ms: 0,
            is_focused: true,
        };
        this.tabFocusWatchInfoHistory = []
        this.lastCopiedInfo = null;
        this.copyInfo10History = [];

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        document.addEventListener('copy', this.handleCopy);
        
        this.handles.forEach((handle) => {
            if (handle.isInitialized) {
                handle.restart();
            }
        });
    }

    /**
     * Handle visibility change events to track tab focus and unfocus
     */
    handleVisibilityChange() {
        if (document.hidden && this.activeTabFocusInfo) {
            this.activeTabFocusInfo.focused_out = new Date();
            this.activeTabFocusInfo.duration_ms = this.activeTabFocusInfo.focused_out.getTime() - this.activeTabFocusInfo.focused_in.getTime();
            this.activeTabFocusInfo.is_focused = false;
            this.tabFocusWatchInfoHistory.push(this.activeTabFocusInfo);
            this.activeTabFocusInfo = null;
        } else {
            const lastFocusInfo = this.tabFocusWatchInfoHistory.length > 0 ? this.tabFocusWatchInfoHistory[this.tabFocusWatchInfoHistory.length - 1] : null;
            const gap_ms = lastFocusInfo && lastFocusInfo.focused_out ? (new Date().getTime() - lastFocusInfo.focused_out.getTime()) : 0;
            this.activeTabFocusInfo = {
                focused_in: new Date(),
                gap_ms: gap_ms,
                is_focused: true,
            };
        }
    }

    /**
     * Handle copy events to track copied content
     */
    handleCopy(event: ClipboardEvent) {
        const clipboardData = event.clipboardData;
        if (clipboardData) {
            const content = clipboardData.getData('text/plain');
            const selectedText = window.getSelection()?.toString() || '';
            const finalContent = content || selectedText;
            if (!finalContent) {
                return;
            }
            const size = finalContent.length;
            // check if it fits the copy size threshold
            if (size < this.config.copy_size_threshold) {
                return;
            }
            this.lastCopiedInfo = {
                timestamp: new Date(),
                content: finalContent,
                tokens: simpleTokenizer(finalContent),
                size: size,
            };
            this.copyInfo10History.push(this.lastCopiedInfo);
            if (this.copyInfo10History.length > 10) {
                this.copyInfo10History.shift();
            }
        }
    }
}

// initialize the default watchdog instance
const watchdog = new Watchdog();

export default watchdog;
