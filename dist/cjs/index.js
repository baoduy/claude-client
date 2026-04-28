"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotClient = exports.ClaudeClient = exports.copilot = exports.claude = void 0;
// Namespace exports for convenient subpath access
exports.claude = __importStar(require("./claude/index.js"));
exports.copilot = __importStar(require("./copilot/index.js"));
// Re-export claude utilities at top level for backward compatibility
__exportStar(require("./claude/index.js"), exports);
// Re-export turn-handle (shared between Claude and Copilot)
__exportStar(require("./turn-handle.js"), exports);
// Re-export both clients at the top level for convenience:
var index_js_1 = require("./claude/index.js");
Object.defineProperty(exports, "ClaudeClient", { enumerable: true, get: function () { return index_js_1.ClaudeClient; } });
var index_js_2 = require("./copilot/index.js");
Object.defineProperty(exports, "CopilotClient", { enumerable: true, get: function () { return index_js_2.CopilotClient; } });
