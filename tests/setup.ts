import 'fake-indexeddb/auto';

// Global Chrome API mock for tests when running outside the browser
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    sendMessage: () => Promise.resolve(),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
    getURL: (path: string) => `chrome-extension://mock-id/${path}`,
  },
  tabs: {
    query: () => Promise.resolve([]),
    sendMessage: () => Promise.resolve(),
    create: () => Promise.resolve({}),
  },
  downloads: {
    download: () => Promise.resolve(1),
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
  },
};
