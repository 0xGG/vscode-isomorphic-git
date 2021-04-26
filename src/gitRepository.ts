import * as git from "isomorphic-git";
import * as path from "path";
import * as vscode from "vscode";
import { FileSystem } from "./fs";

export const GIT_SCHEME = "git";

export class GitRepository implements vscode.QuickDiffProvider {
  constructor(
    private readonly workspaceFolderUri: vscode.Uri,
    private readonly fs: FileSystem
  ) {}

  provideOriginalResource(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Uri> {
    // convert the local file uri to git:file.ext
    const relativePath = vscode.workspace.asRelativePath(uri.fsPath);
    return vscode.Uri.parse(`${GIT_SCHEME}:${relativePath}`);
  }

  /**
   *
   * @returns array of uri, whether the file is deleted, whether the file is staged
   */
  async provideSourceControlledResources(): Promise<
    [vscode.Uri, boolean, boolean][]
  > {
    let status: [string, number, number, number][] = [];
    try {
      // https://isomorphic-git.org/docs/en/statusMatrix
      status = await git.statusMatrix({
        fs: this.fs,
        dir: this.workspaceFolderUri.path,
      });
    } catch (error) {
      console.error("Failed to get statusMatrix: ", error);
    }

    return status
      .filter(([filePath, s1, s2, s3]) => {
        return s1 === 0 || s2 !== 1;
      })
      .map(([filePath, s1, s2, s3]) => {
        return [
          vscode.Uri.parse(
            `${this.workspaceFolderUri.scheme}:${path.join(
              this.workspaceFolderUri.path,
              filePath
            )}`
          ),
          s1 === 1 && s2 === 0,
          s3 === 2 || s3 === 3 || (s2 === 0 && s3 === 0),
        ];
      });
  }
}
