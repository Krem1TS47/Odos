import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// Global mock for chrome extension APIs in unit tests
const storageMock: Record<string, any> = {};

(globalThis as any).chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn((keys: any, cb?: any) => {
        const res: Record<string, any> = {};
        if (typeof keys === 'string') {
          res[keys] = storageMock[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach((k: string) => (res[k] = storageMock[k]));
        }
        if (cb) cb(res);
        return Promise.resolve(res);
      }),
      set: vi.fn((items: any, cb?: any) => {
        Object.assign(storageMock, items);
        if (cb) cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any, cb?: any) => {
        if (typeof keys === 'string') delete storageMock[keys];
        if (Array.isArray(keys)) keys.forEach((k: string) => delete storageMock[k]);
        if (cb) cb();
        return Promise.resolve();
      }),
      clear: vi.fn((cb?: any) => {
        Object.keys(storageMock).forEach((k: string) => delete storageMock[k]);
        if (cb) cb();
        return Promise.resolve();
      })
    }
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn()
    }
  },
  notifications: {
    create: vi.fn()
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn()
  }
};
