// class used to communicate with IndexedDB worker and creates the worker too

function cheapUUID(): string {
    return 'xxxxxxxxxx'.replace(/x/g, () =>
        ((Math.random() * 16) | 0).toString(16)
    );
}

export class IDBWorkerClient {
    private worker: Worker;
    private awaitingPromises: Map<
        string,
        { resolve: (value: any) => void; reject: (reason?: any) => void }
    >;
    constructor() {
        this.worker = new Worker('idb.worker.js', { type: 'module' });
        this.worker.addEventListener('error', this.onError);
        this.worker.addEventListener('message', this.onMessage);

        this.awaitingPromises = new Map();
    }
    private onError(event: ErrorEvent) {
        console.error('IDB Worker Error:', event.message);
    }
    private onMessage(event: MessageEvent) {
        const { id, result, error, status } = event.data;
        const promiseHandlers = this.awaitingPromises.get(id);

        if (promiseHandlers) {
            if (status === 'error') {
                promiseHandlers.reject(new Error(error));
            } else if (status === 'success') {
                promiseHandlers.resolve(result);
            } else {
                promiseHandlers.reject(new Error('Unknown status: ' + status));
            }
            this.awaitingPromises.delete(id);
        } else {
            console.warn('No promise handlers found for ID:', id);
        }
    }
    async getItem<T>(key: string): Promise<T | null> {
        const id = cheapUUID();
        return new Promise<T | null>((resolve, reject) => {
            this.awaitingPromises.set(id, { resolve, reject });
            this.worker.postMessage({ action: 'get', key, id });
        });
    }
    async setItem(key: string, value: any): Promise<void> {
        const id = cheapUUID();
        return new Promise<void>((resolve, reject) => {
            this.awaitingPromises.set(id, { resolve, reject });
            this.worker.postMessage({ action: 'set', key, value, id });
        });
    }
}