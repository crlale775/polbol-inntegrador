/** Memory only: catalogues expire, documents stay fresh, mutations invalidate. */
export function createGetCache(load, { now = Date.now, ttlFor = () => 0 } = {}) {
    const values = new Map();
    const pending = new Map();
    let generation = 0;
    const copy = (value) => value == null ? value : structuredClone(value);
    return {
        async get(path) {
            const stored = values.get(path);
            if (stored && stored.expires > now()) return copy(stored.data);
            if (pending.has(path)) return copy(await pending.get(path));
            const current = generation;
            // A loader that fetches several paths at once (catalogue bundle) can
            // store the extra ones, only if no mutation happened meanwhile.
            const prime = (otherPath, data) => {
                const ttl = ttlFor(otherPath);
                if (ttl > 0 && generation === current) values.set(otherPath, { data: copy(data), expires: now() + ttl });
            };
            const operation = Promise.resolve().then(() => load(path, { prime })).then((data) => {
                const ttl = ttlFor(path);
                if (ttl > 0 && generation === current) values.set(path, { data: copy(data), expires: now() + ttl });
                return data;
            });
            pending.set(path, operation);
            // Keep large uncached document lists zero-copy for the first reader.
            // Concurrent readers and reusable catalogue entries get their own copy.
            try { return await operation; }
            finally { if (pending.get(path) === operation) pending.delete(path); }
        },
        invalidate() {
            generation++;
            values.clear();
            pending.clear();
        },
    };
}
