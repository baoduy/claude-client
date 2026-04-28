export class CopilotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotError';
  }
}

export class CopilotAuthError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotAuthError';
  }
}

export class CopilotLaunchError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotLaunchError';
  }
}

export class CopilotFeatureUnsupportedError extends CopilotError {
  readonly feature: string;
  constructor(featureOrMessage: string, message?: string) {
    // If only one argument is provided, treat it as the message
    if (message === undefined) {
      super(featureOrMessage);
      this.feature = featureOrMessage;
    } else {
      // If two arguments are provided, first is feature, second is message
      super(message);
      this.feature = featureOrMessage;
    }
    this.name = 'CopilotFeatureUnsupportedError';
  }
}

export class CopilotTurnError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotTurnError';
  }
}

export class CopilotInterruptedError extends CopilotError {
  constructor(message: string = 'Turn interrupted') {
    super(message);
    this.name = 'CopilotInterruptedError';
  }
}

export class CopilotPermissionDeniedError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotPermissionDeniedError';
  }
}
