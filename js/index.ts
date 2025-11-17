import watchdog from './watchdog';

const scDetect = {
    query: watchdog.query,
    initialize: watchdog.initialize,
    stop: watchdog.stop,
    queryAll: watchdog.queryAll,
    version: '1.0.0',
}

export default scDetect;