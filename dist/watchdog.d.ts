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
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: number;
            COPY_RELATES_TO_PASTE: number;
            CONTENT_CONTAINS_AI_SIGNATURES: number;
            UNMODIFIED_PASTES: number;
        };
        min_copy_event_time_weight: number;
        min_tab_event_time_weight: number;
    };
    paste_size_threshold: number;
    copy_size_threshold: number;
    settings: {
        relevant_copy_event_minutes: number;
        relevant_tab_in_out_event_minutes: number;
    };
}
/**
 * Factors that influence the Watchdog analysis
 * - deadline: time remaining until the deadline in minutes, if zero or negative, no deadline
 * - caught_rate: rate of previous cheating detections for the user, between 0 and 1
 * - non_native_language: whether the user is using a non-native language for the test
 */
export interface WatchdogFactors {
    deadline: number;
    caught_rate: number;
    non_native_language: boolean;
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
declare class WatchdogHandle {
    element: HTMLElement;
    watchdog: Watchdog;
    isInitialized: boolean;
    state: WatchdogHandleState;
    loadStateLoader: WatchdogStateLoader | null;
    constructor(element: HTMLElement, watchdog: Watchdog);
    setStateLoader(fn: WatchdogStateLoader): void;
    initialize(): Promise<void>;
    loadState(): Promise<void>;
    getState(): WatchdogHandleState;
    restart(): void;
    stop(): void;
    destroy(): void;
    handleInput(e: Event): void;
    handlePaste(e: ClipboardEvent): void;
    private recalculateCopyRelatesToPaste;
    private recalculateAIScore;
    private recalculateUnmodifiedPastes;
    private recalculateKeepsSwitchingTabsAndCopyPasting;
    getCurrentAISignatureScore(): number;
    getContentFromHTMLElement(): string;
    getLastAnalysis(): {
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
    };
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
declare class Watchdog {
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
    isMonitoring: boolean;
    /**
     * Array of WatchdogHandle instances being monitored these
     * represent the monitored input elements or textareas
     */
    handles: WatchdogHandle[];
    /**
     * User ID being monitored
     */
    userId: string | null;
    /**
     * Tab focus watch info history and active tab focus info
     * keeping track of when the tab was focused and unfocused
     * does not include the current active tab focus info
     */
    tabFocusWatchInfoHistory: TabFocusWatchInfo[];
    /**
     * Active tab focus info representing the current tab focus state
     */
    activeTabFocusInfo: TabFocusWatchInfo | null;
    /**
     * Last copied info event
     */
    lastCopiedInfo: CopiedInfo | null;
    /**
     * History of last 10 copied info events, it includes the lastCopiedInfo as the last element
     */
    copyInfo10History: CopiedInfo[];
    /**
     * Constructor for the Watchdog class
     */
    constructor();
    /**
     * query an element to monitor, use a CSS selector to pick this element or provide the element directly
     * @param selector
     * @returns
     */
    query(selector: string | HTMLElement): WatchdogHandle;
    /**
     * Query all elements matching the selector to monitor, use a CSS selector to pick these elements
     * otherwise provide an array of elements directly
     * @param selector
     */
    queryAll(selector: string | HTMLElement[]): void;
    /**
     * initialize the Watchdog module, this needs to be called before starting monitoring
     * otherwise an error will be thrown when trying to monitor elements, as the configuration
     * and factors will not be set; you can re-initialize to change user or configuration on the fly
     *
     * @param userId
     * @param config
     * @param factors
     */
    initialize(userId: string, config?: Partial<WatchdogConfig>, factors?: Partial<WatchdogFactors>): void;
    /**
     * stop the Watchdog monitoring
     */
    stop(): void;
    /**
     * Change the user being monitored, stops and restarts monitoring for the new user
     *
     * @param userId
     */
    changeUser(userId: string): void;
    /**
     * Begin monitoring for copy-paste and tab switching events
     */
    beginMonitoring(): void;
    /**
     * Handle visibility change events to track tab focus and unfocus
     */
    handleVisibilityChange(): void;
    /**
     * Handle copy events to track copied content
     */
    handleCopy(event: ClipboardEvent): void;
}
declare const watchdog: Watchdog;
export default watchdog;
