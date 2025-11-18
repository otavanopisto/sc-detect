"use strict";
(() => {
  // js/tokenizer.ts
  var SIMPLE_TOKENIZER_CACHE = {};
  var SIMPLE_TOKENIZER_CACHE_TIMEOUTS = {};
  function simpleTokenizer(input) {
    if (SIMPLE_TOKENIZER_CACHE[input]) {
      clearTimeout(SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input]);
      SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input] = setTimeout(() => {
        delete SIMPLE_TOKENIZER_CACHE[input];
        delete SIMPLE_TOKENIZER_CACHE_TIMEOUTS[input];
      }, 6e4);
      return SIMPLE_TOKENIZER_CACHE[input];
    }
    const tokens = [];
    let currentToken = "";
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (/\s/.test(char)) {
        if (currentToken) {
          tokens.push(currentToken);
          currentToken = "";
        }
      } else if (/[.,!?;:()]/.test(char)) {
        if (currentToken) {
          tokens.push(currentToken);
          currentToken = "";
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
    }, 6e4);
    return SIMPLE_TOKENIZER_CACHE[input];
  }
  function normalizeToken(token) {
    const accentsMap = {
      "\xE1": "a",
      "\xE9": "e",
      "\xED": "i",
      "\xF3": "o",
      "\xFA": "u",
      "\xF1": "n",
      "\xE4": "a",
      "\xF6": "o",
      "\xFC": "u"
    };
    const commonPrefixes = ["un", "re", "in", "im", "dis", "en", "non", "non-", "pre", "pre-", "mis", "sub", "inter", "fore", "de", "trans", "super", "semi", "anti", "mid", "under"];
    const commonSuffixes = ["s", "es", "ed", "ing", "ly", "er", "or", "ion", "tion", "ation", "ity", "ment", "ness", "ful", "less", "est", "ive", "y", "ize", "ise", "ify", "en", "ssa", "lla", "aa"];
    for (const prefix of commonPrefixes) {
      if (token.startsWith(prefix)) {
        token = token.replace(prefix, "");
        break;
      }
    }
    for (const suffix of commonSuffixes) {
      if (token.endsWith(suffix)) {
        token = token.replace(suffix, "");
        break;
      }
    }
    return token.toLowerCase().replace(/[áéíóúñäöü]/g, (match) => accentsMap[match] || match);
  }
  function tokenSimilarityCompare(tokensA, tokensB) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = /* @__PURE__ */ new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }
  function tokenContainmentCompare(tokensContainer, tokensContained) {
    const setContainer = new Set(tokensContainer);
    const setContained = new Set(tokensContained);
    const intersection = new Set([...setContained].filter((x) => setContainer.has(x)));
    return intersection.size / setContained.size;
  }
  function tokenIncludesScore(tokensContainer, tokensContained, minimum_relevant) {
    let score = 0;
    for (let i = 0; i <= tokensContained.length - tokensContained.length; i++) {
      let thisTokenMaxScoreSoFar = 0;
      for (let j = 0; j <= tokensContainer.length - tokensContained.length; j++) {
        if (tokensContainer[j] === tokensContained[i]) {
          let thisTokenScoreAtThisLocation = 0;
          let matchLength = 0;
          let matchMax = 0;
          for (let k = -i; k < tokensContained.length - i; k++) {
            const potentialScoreAdded = 1 - Math.abs(k) / tokensContained.length;
            matchMax += potentialScoreAdded;
            if (tokensContainer[j + k] === tokensContained[i + k]) {
              matchLength += potentialScoreAdded;
            }
          }
          thisTokenScoreAtThisLocation = matchLength / matchMax;
          if (thisTokenScoreAtThisLocation > thisTokenMaxScoreSoFar) {
            thisTokenMaxScoreSoFar = thisTokenScoreAtThisLocation;
          }
        }
      }
      score += thisTokenMaxScoreSoFar;
    }
    const finalScore = score / tokensContained.length;
    if (finalScore >= minimum_relevant) {
      return finalScore;
    }
    return 0;
  }

  // js/ai.ts
  function findAISignatures(text, treshold = 1) {
    let score = 0;
    const emDashCount = (text.match(/—/g) || []).length;
    score += emDashCount * 0.3;
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    score += emojiCount * 0.5;
    const aiPhrases = [
      "as an ai language model",
      "i am an ai",
      "i am an artificial intelligence",
      "as an artificial intelligence"
    ];
    for (const phrase of aiPhrases) {
      const phraseCount = (text.toLowerCase().match(new RegExp(phrase, "g")) || []).length;
      score += phraseCount * 1;
    }
    const numerationCount = (text.match(/\b\d+\./g) || []).length;
    score += numerationCount * 0.05;
    if (score > treshold) {
      return 1;
    }
    return 0;
  }

  // js/watchdog.ts
  var DEFAULT_CONFIG = {
    weights: {
      reasons: {
        KEEPS_SWITCHING_TABS_AND_COPY_PASTING: 0.3,
        COPY_RELATES_TO_PASTE: 0.3,
        CONTENT_CONTAINS_AI_SIGNATURES: 0.2,
        UNMODIFIED_PASTES: 0.1
      },
      min_copy_event_time_weight: 0.5,
      min_tab_event_time_weight: 0.5
    },
    paste_size_threshold: 100,
    copy_size_threshold: 30,
    settings: {
      relevant_copy_event_minutes: 5,
      relevant_tab_in_out_event_minutes: 5
    }
  };
  var DEFAULT_FACTORS = {
    deadline: 0,
    caught_rate: 0,
    non_native_language: false
  };
  var WatchdogHandle = class {
    constructor(element, watchdog2) {
      this.isInitialized = false;
      this.loadStateLoader = null;
      this.element = element;
      this.watchdog = watchdog2;
      this.state = {
        COPY_PASTE_CONTRIBUTIONS: [],
        // INPUT_CONTRIBUTIONS: [],
        COPY_RELATES_TO_PASTE: 0,
        CONTENT_CONTAINS_AI_SIGNATURES: 0,
        KEEPS_SWITCHING_TABS_AND_COPY_PASTING: 0,
        UNMODIFIED_PASTES: 0
      };
      this.handlePaste = this.handlePaste.bind(this);
    }
    setStateLoader(fn) {
      this.loadStateLoader = fn;
    }
    async initialize() {
      if (!this.watchdog.isMonitoring) {
        throw new Error("Watchdog is not initialized. Please call scDetect.initialize() first.");
      }
      this.isInitialized = true;
      const tagName = this.element.tagName.toLowerCase();
      const type = this.element.type;
      if (tagName === "textarea" || tagName === "input" && type === "text" || this.element.isContentEditable) {
        await this.loadState();
        this.restart();
      } else {
        throw new Error("Element is not a valid input field (textarea, input type=text, or contenteditable).");
      }
    }
    async loadState() {
      if (this.loadStateLoader) {
        this.state = await this.loadStateLoader();
      }
    }
    getState() {
      return this.state;
    }
    restart() {
      if (!this.isInitialized) {
        throw new Error("WatchdogHandle is not initialized. Please call initialize() first.");
      }
      this.element.removeEventListener("paste", this.handlePaste);
      this.element.removeEventListener("input", this.handleInput);
      this.element.addEventListener("paste", this.handlePaste);
      this.element.addEventListener("input", this.handleInput);
    }
    stop() {
      this.isInitialized = false;
      this.element.removeEventListener("paste", this.handlePaste);
      this.element.removeEventListener("input", this.handleInput);
    }
    destroy() {
      this.stop();
      this.watchdog.handles = this.watchdog.handles.filter((h) => h !== this);
    }
    handleInput(e) {
      this.recalculateCopyRelatesToPaste();
      this.recalculateAIScore();
      this.recalculateUnmodifiedPastes();
      this.recalculateKeepsSwitchingTabsAndCopyPasting();
    }
    handlePaste(e) {
      const clipboardData = e.clipboardData;
      if (!clipboardData) {
        return;
      }
      const text = clipboardData.getData("text/plain");
      if (!text) {
        return;
      }
      if (text.length < this.watchdog.config.paste_size_threshold) {
        return;
      }
      const tokens = simpleTokenizer(text);
      const similarity = tokenSimilarityCompare(tokens, this.watchdog.lastCopiedInfo ? this.watchdog.lastCopiedInfo.tokens : []);
      const containment = tokenContainmentCompare(this.watchdog.lastCopiedInfo ? this.watchdog.lastCopiedInfo.tokens : [], tokens);
      if (similarity > 0.9) {
        return;
      }
      const now = /* @__PURE__ */ new Date();
      let foundRelatedCopy = false;
      let foundRelatedCopyTimeFactor = 0;
      let switchedTabsRecently = false;
      let switchedTabsRecentlyTimeFactor = 0;
      if (this.watchdog.lastCopiedInfo) {
        const timeDiff = now.getTime() - this.watchdog.lastCopiedInfo.timestamp.getTime();
        if (timeDiff < this.watchdog.config.settings.relevant_copy_event_minutes * 60 * 1e3) {
          foundRelatedCopy = true;
          foundRelatedCopyTimeFactor = 1 - timeDiff / (this.watchdog.config.settings.relevant_copy_event_minutes * 60 * 1e3);
          if (foundRelatedCopyTimeFactor < this.watchdog.config.weights.min_copy_event_time_weight) {
            foundRelatedCopyTimeFactor = this.watchdog.config.weights.min_copy_event_time_weight;
          }
        }
      }
      if (this.watchdog.activeTabFocusInfo) {
        const timeDiff = now.getTime() - this.watchdog.activeTabFocusInfo.focused_in.getTime();
        if (timeDiff < this.watchdog.config.settings.relevant_tab_in_out_event_minutes * 60 * 1e3) {
          switchedTabsRecently = true;
          switchedTabsRecentlyTimeFactor = 1 - timeDiff / (this.watchdog.config.settings.relevant_tab_in_out_event_minutes * 60 * 1e3);
          if (switchedTabsRecentlyTimeFactor < this.watchdog.config.weights.min_tab_event_time_weight) {
            switchedTabsRecentlyTimeFactor = this.watchdog.config.weights.min_tab_event_time_weight;
          }
        }
      }
      const foundRelatedCopyFactor = (foundRelatedCopy ? 1 : 0) * foundRelatedCopyTimeFactor;
      const switchedTabsRecentlyFactor = (switchedTabsRecently ? 1 : 0) * switchedTabsRecentlyTimeFactor;
      const cheatingPasteScore = (containment + foundRelatedCopyFactor + switchedTabsRecentlyFactor) / 3;
      let score = cheatingPasteScore;
      const aiScore = findAISignatures(text, 1);
      if (aiScore >= cheatingPasteScore) {
        score = aiScore;
      }
      this.state.COPY_PASTE_CONTRIBUTIONS.push({
        pasteScore: cheatingPasteScore,
        score,
        aiScore,
        timestamp: now,
        similarity,
        containment,
        copyFactor: foundRelatedCopyFactor,
        tabSwitchFactor: switchedTabsRecentlyFactor,
        content: text
      });
      this.recalculateCopyRelatesToPaste();
      this.recalculateAIScore();
      this.recalculateUnmodifiedPastes();
      this.recalculateKeepsSwitchingTabsAndCopyPasting();
    }
    recalculateCopyRelatesToPaste() {
      if (this.state.COPY_PASTE_CONTRIBUTIONS.length === 0) {
        this.state.COPY_RELATES_TO_PASTE = 0;
      } else {
        let total = 0;
        const currentContent = this.getContentFromHTMLElement();
        this.state.COPY_PASTE_CONTRIBUTIONS.forEach((contribution) => {
          const tokenIncludesScoreValue = tokenIncludesScore(simpleTokenizer(currentContent), simpleTokenizer(contribution.content), 0.7);
          total += tokenIncludesScoreValue * contribution.score;
        });
        this.state.COPY_RELATES_TO_PASTE = total / this.state.COPY_PASTE_CONTRIBUTIONS.length;
      }
    }
    recalculateAIScore() {
      if (this.state.COPY_PASTE_CONTRIBUTIONS.length === 0) {
        this.state.CONTENT_CONTAINS_AI_SIGNATURES = 0;
      } else {
        let total = 0;
        const currentContent = this.getContentFromHTMLElement();
        this.state.COPY_PASTE_CONTRIBUTIONS.forEach((contribution) => {
          const tokenIncludesScoreValue = tokenIncludesScore(simpleTokenizer(currentContent), simpleTokenizer(contribution.content), 0.7);
          total += tokenIncludesScoreValue * contribution.aiScore;
        });
        this.state.CONTENT_CONTAINS_AI_SIGNATURES = total / this.state.COPY_PASTE_CONTRIBUTIONS.length;
      }
    }
    recalculateUnmodifiedPastes() {
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
          contentWorking = contentWorking.replace(contribution.content, "");
        }
      });
      const unmodifiedPastesRatio = unmodifiedPastes / totalPastes;
      const remainingCharacters = contentWorking.length;
      const totalCharacters = this.getContentFromHTMLElement().length;
      const remainingCharactersRatio = totalCharacters > 0 ? remainingCharacters / totalCharacters : 0;
      const finalUnmodifiedPastesScore = (unmodifiedPastesRatio + (1 - remainingCharactersRatio)) / 2;
      this.state.UNMODIFIED_PASTES = finalUnmodifiedPastesScore;
    }
    recalculateKeepsSwitchingTabsAndCopyPasting() {
      let switchingTabAndCopyPastingScore = 0;
      let totalPatterns = 0;
      const tabFocusHistoryWithCurrent = [...this.watchdog.tabFocusWatchInfoHistory, this.watchdog.activeTabFocusInfo];
      if (tabFocusHistoryWithCurrent.length < 2) {
        this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING = 0;
        return;
      }
      const currentContent = this.getContentFromHTMLElement();
      const currentContentTokens = simpleTokenizer(currentContent);
      for (let i = 1; i < tabFocusHistoryWithCurrent.length; i++) {
        const current = tabFocusHistoryWithCurrent[i];
        const next = tabFocusHistoryWithCurrent[i + 1];
        const endTime = next && next.focused_out ? next.focused_out : /* @__PURE__ */ new Date();
        const startTime = current.focused_out ? current.focused_out : current.focused_in;
        const pastesInBetween = this.state.COPY_PASTE_CONTRIBUTIONS.filter((contribution) => {
          return contribution.timestamp >= startTime && contribution.timestamp <= endTime;
        });
        if (pastesInBetween.length > 0) {
          totalPatterns++;
          let maxScoreOfAPaste = 0;
          pastesInBetween.forEach((contribution) => {
            let actualScore = 0;
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
    getCurrentAISignatureScore() {
      return findAISignatures(this.getContentFromHTMLElement(), 1);
    }
    getContentFromHTMLElement() {
      if (this.element.tagName.toLowerCase() === "textarea" || this.element.tagName.toLowerCase() === "input" && this.element.type === "text") {
        return this.element.value;
      } else if (this.element.isContentEditable) {
        return this.element.innerText;
      }
      return "";
    }
    getLastAnalysis() {
      const WEIGHTED = {
        COPY_RELATES_TO_PASTE: this.state.COPY_RELATES_TO_PASTE * this.watchdog.config.weights.reasons.COPY_RELATES_TO_PASTE,
        CONTENT_CONTAINS_AI_SIGNATURES: this.state.CONTENT_CONTAINS_AI_SIGNATURES * this.watchdog.config.weights.reasons.CONTENT_CONTAINS_AI_SIGNATURES,
        UNMODIFIED_PASTES: this.state.UNMODIFIED_PASTES * this.watchdog.config.weights.reasons.UNMODIFIED_PASTES,
        KEEPS_SWITCHING_TABS_AND_COPY_PASTING: this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING * this.watchdog.config.weights.reasons.KEEPS_SWITCHING_TABS_AND_COPY_PASTING
      };
      return {
        raw: {
          COPY_RELATES_TO_PASTE: this.state.COPY_RELATES_TO_PASTE,
          CONTENT_CONTAINS_AI_SIGNATURES: this.state.CONTENT_CONTAINS_AI_SIGNATURES,
          UNMODIFIED_PASTES: this.state.UNMODIFIED_PASTES,
          KEEPS_SWITCHING_TABS_AND_COPY_PASTING: this.state.KEEPS_SWITCHING_TABS_AND_COPY_PASTING
        },
        weighted: WEIGHTED,
        confidence: WEIGHTED.COPY_RELATES_TO_PASTE + WEIGHTED.CONTENT_CONTAINS_AI_SIGNATURES + WEIGHTED.UNMODIFIED_PASTES + WEIGHTED.KEEPS_SWITCHING_TABS_AND_COPY_PASTING
      };
    }
  };
  var Watchdog = class {
    /**
     * Constructor for the Watchdog class
     */
    constructor() {
      /**
       * Indicates whether the Watchdog is currently monitoring
       */
      this.isMonitoring = false;
      /**
       * Array of WatchdogHandle instances being monitored these
       * represent the monitored input elements or textareas
       */
      this.handles = [];
      /**
       * User ID being monitored
       */
      this.userId = null;
      /**
       * Tab focus watch info history and active tab focus info
       * keeping track of when the tab was focused and unfocused
       * does not include the current active tab focus info
       */
      this.tabFocusWatchInfoHistory = [];
      /**
       * Active tab focus info representing the current tab focus state
       */
      this.activeTabFocusInfo = null;
      /**
       * Last copied info event
       */
      this.lastCopiedInfo = null;
      /**
       * History of last 10 copied info events, it includes the lastCopiedInfo as the last element
       */
      this.copyInfo10History = [];
      this.config = DEFAULT_CONFIG;
      this.factors = DEFAULT_FACTORS;
      this.userId = null;
      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
      this.handleCopy = this.handleCopy.bind(this);
    }
    /**
     * query an element to monitor, use a CSS selector to pick this element or provide the element directly
     * @param selector 
     * @returns 
     */
    query(selector) {
      const element = typeof selector === "string" ? document.querySelectorAll(selector) : [selector];
      if (element.length !== 1) {
        throw new Error(`Expected one element for selector "${selector}", but found ${element.length}.`);
      }
      const handle = new WatchdogHandle(element[0], this);
      this.handles.push(handle);
      return handle;
    }
    /**
     * Query all elements matching the selector to monitor, use a CSS selector to pick these elements
     * otherwise provide an array of elements directly
     * @param selector 
     */
    queryAll(selector) {
      const elements = typeof selector === "string" ? document.querySelectorAll(selector) : selector;
      elements.forEach((el) => {
        const handle = new WatchdogHandle(el, this);
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
    initialize(userId, config, factors) {
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
      this.isMonitoring = false;
      this.handles.forEach((handle) => handle.stop());
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      document.removeEventListener("copy", this.handleCopy);
    }
    /**
     * Change the user being monitored, stops and restarts monitoring for the new user
     * 
     * @param userId 
     */
    changeUser(userId) {
      this.userId = userId;
      this.stop();
      this.handles.forEach((handle) => handle.loadState());
      this.beginMonitoring();
    }
    /**
     * Begin monitoring for copy-paste and tab switching events
     */
    beginMonitoring() {
      this.isMonitoring = true;
      this.activeTabFocusInfo = {
        focused_in: /* @__PURE__ */ new Date(),
        gap_ms: 0,
        is_focused: true
      };
      this.tabFocusWatchInfoHistory = [];
      this.lastCopiedInfo = null;
      this.copyInfo10History = [];
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      document.addEventListener("copy", this.handleCopy);
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
        this.activeTabFocusInfo.focused_out = /* @__PURE__ */ new Date();
        this.activeTabFocusInfo.duration_ms = this.activeTabFocusInfo.focused_out.getTime() - this.activeTabFocusInfo.focused_in.getTime();
        this.activeTabFocusInfo.is_focused = false;
        this.tabFocusWatchInfoHistory.push(this.activeTabFocusInfo);
        this.activeTabFocusInfo = null;
      } else {
        const lastFocusInfo = this.tabFocusWatchInfoHistory.length > 0 ? this.tabFocusWatchInfoHistory[this.tabFocusWatchInfoHistory.length - 1] : null;
        const gap_ms = lastFocusInfo && lastFocusInfo.focused_out ? (/* @__PURE__ */ new Date()).getTime() - lastFocusInfo.focused_out.getTime() : 0;
        this.activeTabFocusInfo = {
          focused_in: /* @__PURE__ */ new Date(),
          gap_ms,
          is_focused: true
        };
      }
    }
    /**
     * Handle copy events to track copied content
     */
    handleCopy(event) {
      const clipboardData = event.clipboardData;
      if (clipboardData) {
        const content = clipboardData.getData("text/plain");
        const size = content.length;
        if (size < this.config.copy_size_threshold) {
          return;
        }
        this.lastCopiedInfo = {
          timestamp: /* @__PURE__ */ new Date(),
          content,
          tokens: simpleTokenizer(content),
          size
        };
        this.copyInfo10History.push(this.lastCopiedInfo);
        if (this.copyInfo10History.length > 10) {
          this.copyInfo10History.shift();
        }
      }
    }
  };
  var watchdog = new Watchdog();
  var watchdog_default = watchdog;

  // js/index.ts
  var scDetect = {
    query: watchdog_default.query,
    initialize: watchdog_default.initialize,
    stop: watchdog_default.stop,
    queryAll: watchdog_default.queryAll,
    version: "1.0.0"
  };
  var index_default = scDetect;
})();
//# sourceMappingURL=sc-detect.js.map
