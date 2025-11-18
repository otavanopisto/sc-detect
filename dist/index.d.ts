import watchdog from './watchdog';
declare const scDetect: {
    query: typeof watchdog.query;
    initialize: typeof watchdog.initialize;
    stop: typeof watchdog.stop;
    queryAll: typeof watchdog.queryAll;
    version: string;
};
export default scDetect;
