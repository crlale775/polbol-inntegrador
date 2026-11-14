import { describe, expect, it, vi } from 'vitest';
import { createGetCache } from '../../resources/js/lib/getCache';

describe('GET cache freshness and account separation', () => {
    it('deduplicates concurrent loads and isolates mutable results', async () => {
        const load = vi.fn(async () => [{ nombre: 'Original' }]);
        const cache = createGetCache(load, { ttlFor: () => 60000 });
        const [first, second] = await Promise.all([cache.get('/grados'), cache.get('/grados')]);
        first[0].nombre = 'Changed';
        expect(second[0].nombre).toBe('Original');
        expect((await cache.get('/grados'))[0].nombre).toBe('Original');
        expect(load).toHaveBeenCalledTimes(1);
    });
    it('expires catalogues and always refreshes documents after the current load', async () => {
        let time = 0;
        const load = vi.fn(async () => []);
        const cache = createGetCache(load, { now: () => time, ttlFor: (path) => path === '/grados' ? 100 : 0 });
        await cache.get('/grados');
        time = 101;
        await cache.get('/grados');
        await cache.get('/documentos');
        await cache.get('/documentos');
        expect(load).toHaveBeenCalledTimes(4);
    });
    it('never repopulates another session with a response started before invalidation', async () => {
        let resolveOld;
        const load = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
            .mockResolvedValue({ account: 'new' });
        const cache = createGetCache(load, { ttlFor: () => 60000 });
        const old = cache.get('/grados');
        await Promise.resolve();
        cache.invalidate();
        expect(await cache.get('/grados')).toEqual({ account: 'new' });
        resolveOld({ account: 'old' });
        await old;
        expect(await cache.get('/grados')).toEqual({ account: 'new' });
        expect(load).toHaveBeenCalledTimes(2);
    });
    it('stores catalogues delivered together by one loader call', async () => {
        const load = vi.fn(async (path, { prime }) => {
            prime('/epis', [{ id_epi: 1 }]);
            return [{ id_grado: 1 }];
        });
        const cache = createGetCache(load, { ttlFor: () => 60000 });
        expect(await cache.get('/grados')).toEqual([{ id_grado: 1 }]);
        expect(await cache.get('/epis')).toEqual([{ id_epi: 1 }]);
        expect(load).toHaveBeenCalledTimes(1);
    });
    it('retries failures instead of retaining a rejected request', async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
        const cache = createGetCache(load);
        await expect(cache.get('/grados')).rejects.toThrow('offline');
        expect(await cache.get('/grados')).toEqual([]);
    });
});
