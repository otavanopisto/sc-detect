import { simpleTokenizer, tokenSimilarityCompare } from "./tokenizer";

export interface WatchdogConfig {
    weights: {
        reasons: {
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: number,
            COPY_RELATES_TO_PASTE: number,
            CONTENT_CONTAINS_AI_SIGNATURES: number,
            UNMODIFIED_PASTES: number,
        },
    },
    paste_size_threshold: number,
    copy_size_threshold: number,
    statistics: {
        average_human_typing_speed_wpm: number,
        average_human_typing_speed_cpm: number,
        fast_human_typing_speed_wpm: number,
        fast_human_typing_speed_cpm: number,
        average_human_reading_speed_wpm: number,
        fast_human_reading_speed_wpm: number,
    }
}

const DEFAULT_CONFIG: WatchdogConfig = {
    weights: {
        reasons: {
            KEEPS_SWITCHING_TABS_AND_COPY_PASTING: 0.3,
            COPY_RELATES_TO_PASTE: 0.3,
            CONTENT_CONTAINS_AI_SIGNATURES: 0.2,
            UNMODIFIED_PASTES: 0.1,
        },
    },
    paste_size_threshold: 100,
    copy_size_threshold: 30,
    statistics: {
        average_human_typing_speed_wpm: 40,
        average_human_typing_speed_cpm: 200,
        fast_human_typing_speed_wpm: 60,
        fast_human_typing_speed_cpm: 300,
        average_human_reading_speed_wpm: 200,
        fast_human_reading_speed_wpm: 300,
    }
}

export interface WatchdogFactors {
    deadline: number,
    caught_rate: number,
    non_native_language: boolean,
}

const DEFAULT_FACTORS: WatchdogFactors = {
    deadline: 0,
    caught_rate: 0,
    non_native_language: false,
}

class WatchdogHandle {
    element: HTMLElement;
    watchdog: Watchdog;
    isInitialized: boolean = false;

    constructor(element: HTMLElement, watchdog: Watchdog) {
        this.element = element;
        this.watchdog = watchdog;

        this.handlePaste = this.handlePaste.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }
    initialize() {
        if (!this.watchdog.isMonitoring) {
            throw new Error('Watchdog is not initialized. Please call scDetect.initialize() first.');
        }
        this.isInitialized = true;
        // make sure that is in an input with contenteditable or textarea or input type=text
        const tagName = this.element.tagName.toLowerCase();
        const type = (this.element as HTMLInputElement).type;
        if (tagName === 'textarea' || (tagName === 'input' && type === 'text') || this.element.isContentEditable) {
            // Start monitoring the element for copy-paste and tab switch events
            // Implementation of monitoring logic goes here
            this.restart();
        } else {
            throw new Error('Element is not a valid input field (textarea, input type=text, or contenteditable).');
        }
    }
    restart() {
        // Implementation of restart method for this handle
        // add event listeners to paste, input
        this.element.addEventListener('paste', this.handlePaste);
        this.element.addEventListener('input', this.handleInput);
    }
    stop() {
        // Implementation of stop method for this handle
        this.isInitialized = false;

        // remove all event listeners
        this.element.removeEventListener('paste', this.handlePaste);
        this.element.removeEventListener('input', this.handleInput);
    }
    destroy() {
        // Implementation of destroy method for this handle
        this.stop();
        // Additional cleanup
        this.watchdog.handles = this.watchdog.handles.filter(h => h !== this);
    }
    handlePaste(e: ClipboardEvent) {
        const clipboardData = e.clipboardData;
        if (!clipboardData) {
            return;
        }
        const text = clipboardData.getData('text/plain');

        if (!text) {
            return;
        }

        // check if it fits the paste size threshold
        if (text.length < this.watchdog.config.paste_size_threshold) {
            return;
        }

        const tokens = simpleTokenizer(text);
        const similarity = tokenSimilarityCompare(tokens, this.watchdog.lastCopiedInfo ? this.watchdog.lastCopiedInfo.tokens : []);

        // similarities too high are likely modified pastes, so we just ignore them
        if (similarity > 0.9) {
            return;
        }

        // Now lets look for a copy event, followed by a tabout event, followed by this paste event
        // within a reasonable time frame (e.g., 5 minutes)
        const now = new Date();
        let foundRelatedCopy = false;
        let switchedTabsRecently = false;

        if (this.watchdog.lastCopiedInfo) {
            const timeDiff = now.getTime() - this.watchdog.lastCopiedInfo.timestamp.getTime();
            if (timeDiff < 5 * 60 * 1000) { // 5 minutes
                foundRelatedCopy = true;
            }
        }

        if (this.watchdog.activeTabFocusInfo) {
            const timeDiff = now.getTime() - this.watchdog.activeTabFocusInfo.focused_in.getTime();
            if (timeDiff < 5 * 60 * 1000) { // 5 minutes
                switchedTabsRecently = true;
            }
        }
    }
    handleInput() {
    }
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

class Watchdog {
    config: WatchdogConfig;
    factors: WatchdogFactors;
    isMonitoring: boolean = false;
    handles: WatchdogHandle[] = [];
    
    tabFocusWatchInfoHistory: TabFocusWatchInfo[] = [];
    activeTabFocusInfo: TabFocusWatchInfo | null = null;

    lastCopiedInfo: CopiedInfo | null = null;
    copyInfo10History: CopiedInfo[] = [];

    constructor() {
        // Initialization code
        this.config = DEFAULT_CONFIG;
        this.factors = DEFAULT_FACTORS;

        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
    }
    query(selector: string) {
        // Implementation of query method
        const element = document.querySelectorAll(selector);
        // check that only one element is found
        if (element.length !== 1) {
            throw new Error(`Expected one element for selector "${selector}", but found ${element.length}.`);
        }
        const handle = new WatchdogHandle(element[0] as HTMLElement, this);
        this.handles.push(handle);
        return handle;
    }
    queryAll(selector: string) {
        // Implementation of queryAll method
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
            const handle = new WatchdogHandle(el as HTMLElement, this);
            this.handles.push(handle);
            return handle;
        });
    }
    initialize(config?: Partial<WatchdogConfig>, factors?: Partial<WatchdogFactors>) {
        // Implementation of initialize method
        // patch DEFAULT_CONFIG and DEFAULT_FACTORS with provided config and factors
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.factors = { ...DEFAULT_FACTORS, ...factors };

        if (!this.isMonitoring) {
            this.beginMonitoring();
        }
    }
    stop() {
        // Implementation of stop method
        this.isMonitoring = false;
        this.handles.forEach((handle) => handle.stop());

        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        document.removeEventListener('copy', this.handleCopy);
    }
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
    handleCopy(event: ClipboardEvent) {
        const clipboardData = event.clipboardData;
        if (clipboardData) {
            const content = clipboardData.getData('text/plain');
            const size = content.length;
            // check if it fits the copy size threshold
            if (size < this.config.copy_size_threshold) {
                return;
            }
            this.lastCopiedInfo = {
                timestamp: new Date(),
                content: content,
                tokens: simpleTokenizer(content),
                size: size,
            };
            this.copyInfo10History.push(this.lastCopiedInfo);
            if (this.copyInfo10History.length > 10) {
                this.copyInfo10History.shift();
            }
        }
    }
}

const watchdog = new Watchdog();

export default watchdog;
