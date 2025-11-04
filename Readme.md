#SC-Detect

A simple Javascript Library to detect potential cheating in educational applications that uses simple heuristics to detect it.

It merely looks for non-standard or uncommon patterns that are unlikely to have come from legitimate user activity and provides a confidence score.

## usage

Add the script to your codebase.

`<script type="application/javascript" src="sc-detect.min.js"/>`

Initialize the analysis for the field

`scDetect.query(htmlInputElement).initialize({lastAnalysis: lastAnalysis})`

Initialize the analysis for the field using indexedDB, requires a unique identifier in the field; if the analysis is not provided from server side then it is session specific, and it will not keep track sessions outside the browser used or if incognito is used.

`scDetect.query(htmlInputElement).initialize({indexedDBId: [uuid]]})`

Request the data later by using the function, the object must be an input field

`scDetect.query(htmlInputElement).getLastAnalysis()`

## Initial Setup

Before SC detect starts inspecting it needs to be initialized

```javascript
scDetect.initialize({
    config?: [configuration],
    factors?: [factors]
})
```

You can also stop it by doing

```javascript
scDetect.stop()
```

Setup factors on the fly by doing

```javascript
scDetect.setFactors([factors])
```

## Analysis Object Shape

 - a.reasons, an array with the main reasons that specificies why they think this may have been a case of cheating.
 - a.confidence, a floating point number from 0 to 1 with the confidence score, in practise it doesn't go over 0.7
 - a.analysis an object that specifies what data was analyzed to build the heuristic

## List of Reasons

 - KEEPS_SWITCHING_TABS_AND_COPY_PASTING (weight 0.3)
 - COPY_RELATES_TO_PASTE (weight 0.3)
 - CONTENT_CONTAINS_AI_SIGNATURES (weight 0.2)
 - UNMODIFIED_PASTES (weight 0.1)

KEEPS_SWITCHING_TABS_AND_COPY_PASTING has a timing factor, but UNMODIFIED_PASTES does not, so it may be triggered by users who use a translator, it is recommended that you may want to change the weights of UNMODIFIED_PASTES if you know the user does not speak the target language, or use the default factor.

## Recommended Displays

 - >0.6 = This answer is highly suspicious
 - 0.3-0.6 = This answer should be reviewed carefully
 - 0.1-0.3 = This answer is slightly supicious
 - <0.1 = Do not display anything

## Configuration object

```js
{
    weights: {
        reasons: {
            [reason]: [float],
        },
    },
    paste_size_threshold: 200,
    copy_size_threshold: 50,
    statistics: {
        average_human_typing_speed_wpm: [int],
        average_human_typing_speed_lpm: [int],
        fast_human_typing_speed_wpm: [int],
        fast_human_typing_speed_lpm: [int],
        average_human_reading_speed_wpm: [int],
        fast_human_reading_speed_wpm: [int],
    }
}
```

## Factors config

Adding these during setup may improve accuracy

```
{
    deadline: [int], // number of seconds before the deadline of this task
    caught_rate: [float 0 to 1], // percentage of times of all answers the student is actually known of cheating
    non_native_language: [boolean], // whether the student does not speak the language natively
}
```