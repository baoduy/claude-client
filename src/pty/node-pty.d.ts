// Ambient declaration so TypeScript can resolve the optional peer dep
// `node-pty` without it being installed at typecheck time. The factory
// only depends on `spawn`; the precise type lives in `client.ts`
// (`PtyModuleLike`) and is what we actually rely on.
declare module 'node-pty';
