import watchdog from './watchdog';

const scDetect: {
    query: typeof watchdog.query;
    initialize: typeof watchdog.initialize;
    stop: typeof watchdog.stop;
    queryAll: typeof watchdog.queryAll;
    version: string;
} = {
    query: watchdog.query,
    initialize: watchdog.initialize,
    stop: watchdog.stop,
    queryAll: watchdog.queryAll,
    version: '1.0.0',
}

if (typeof window !== 'undefined') {
    (window as any).scDetect = scDetect;
}

export default scDetect;