"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotPermissionDeniedError = exports.CopilotInterruptedError = exports.CopilotTurnError = exports.CopilotFeatureUnsupportedError = exports.CopilotLaunchError = exports.CopilotAuthError = exports.CopilotError = void 0;
class CopilotError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CopilotError';
    }
}
exports.CopilotError = CopilotError;
class CopilotAuthError extends CopilotError {
    constructor(message) {
        super(message);
        this.name = 'CopilotAuthError';
    }
}
exports.CopilotAuthError = CopilotAuthError;
class CopilotLaunchError extends CopilotError {
    constructor(message) {
        super(message);
        this.name = 'CopilotLaunchError';
    }
}
exports.CopilotLaunchError = CopilotLaunchError;
class CopilotFeatureUnsupportedError extends CopilotError {
    feature;
    constructor(featureOrMessage, message) {
        // If only one argument is provided, treat it as the message
        if (message === undefined) {
            super(featureOrMessage);
            this.feature = featureOrMessage;
        }
        else {
            // If two arguments are provided, first is feature, second is message
            super(message);
            this.feature = featureOrMessage;
        }
        this.name = 'CopilotFeatureUnsupportedError';
    }
}
exports.CopilotFeatureUnsupportedError = CopilotFeatureUnsupportedError;
class CopilotTurnError extends CopilotError {
    constructor(message) {
        super(message);
        this.name = 'CopilotTurnError';
    }
}
exports.CopilotTurnError = CopilotTurnError;
class CopilotInterruptedError extends CopilotError {
    constructor(message = 'Turn interrupted') {
        super(message);
        this.name = 'CopilotInterruptedError';
    }
}
exports.CopilotInterruptedError = CopilotInterruptedError;
class CopilotPermissionDeniedError extends CopilotError {
    constructor(message) {
        super(message);
        this.name = 'CopilotPermissionDeniedError';
    }
}
exports.CopilotPermissionDeniedError = CopilotPermissionDeniedError;
