export declare class CopilotError extends Error {
    constructor(message: string);
}
export declare class CopilotAuthError extends CopilotError {
    constructor(message: string);
}
export declare class CopilotLaunchError extends CopilotError {
    constructor(message: string);
}
export declare class CopilotFeatureUnsupportedError extends CopilotError {
    readonly feature: string;
    constructor(featureOrMessage: string, message?: string);
}
export declare class CopilotTurnError extends CopilotError {
    constructor(message: string);
}
export declare class CopilotInterruptedError extends CopilotError {
    constructor(message?: string);
}
export declare class CopilotPermissionDeniedError extends CopilotError {
    constructor(message: string);
}
