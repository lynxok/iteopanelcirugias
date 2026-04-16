/**
 * Utility for generating UUIDs.
 * Falls back to a random number based generator if crypto.randomUUID is not available
 * (e.g. in non-secure contexts like HTTP).
 */
export const generateUUID = (): string => {
    // 1. Try modern crypto API
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (e) {
            console.warn('crypto.randomUUID failed, falling back to manual generation', e);
        }
    }

    // 2. Fallback for insecure contexts (HTTP) or older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
