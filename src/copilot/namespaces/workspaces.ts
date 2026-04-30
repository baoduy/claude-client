import type {
  GhCopilotSession,
  WorkspacesGetWorkspaceResult,
  WorkspacesListFilesResult,
  WorkspacesReadFileRequest,
  WorkspacesReadFileResult,
  WorkspacesCreateFileRequest,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.workspaces` (`@github/copilot-sdk`).
 *
 * Workspace inspection and file I/O.
 */
export class CopilotWorkspacesApi {
  private readonly _resolveGetWorkspace: () => GhCopilotSession;
  private readonly _resolveListFiles: () => GhCopilotSession;
  private readonly _resolveReadFile: () => GhCopilotSession;
  private readonly _resolveCreateFile: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveGetWorkspace = makeSessionResolver(getter, 'workspaces.getWorkspace');
    this._resolveListFiles = makeSessionResolver(getter, 'workspaces.listFiles');
    this._resolveReadFile = makeSessionResolver(getter, 'workspaces.readFile');
    this._resolveCreateFile = makeSessionResolver(getter, 'workspaces.createFile');
  }

  /** Get information about the current workspace. */
  async getWorkspace(): Promise<WorkspacesGetWorkspaceResult> {
    const session = this._resolveGetWorkspace();
    return callRpc('workspaces', 'getWorkspace', false, () => session.rpc.workspaces.getWorkspace());
  }

  /** List files in the workspace. */
  async listFiles(): Promise<WorkspacesListFilesResult> {
    const session = this._resolveListFiles();
    return callRpc('workspaces', 'listFiles', false, () => session.rpc.workspaces.listFiles());
  }

  /** Read a file from the workspace. */
  async readFile(params: WorkspacesReadFileRequest): Promise<WorkspacesReadFileResult> {
    const session = this._resolveReadFile();
    return callRpc('workspaces', 'readFile', false, () => session.rpc.workspaces.readFile(params));
  }

  /** Create a file in the workspace. */
  async createFile(params: WorkspacesCreateFileRequest): Promise<void> {
    const session = this._resolveCreateFile();
    return callRpc('workspaces', 'createFile', false, () => session.rpc.workspaces.createFile(params));
  }
}
