import { promisify } from "es6-promisify";
import { CallbackFsClient, PromiseFsClient } from "isomorphic-git";
import { FileStat, FileType, Uri } from "vscode";
import { ENOENT } from "./errors";

interface Stats {
  type: "file" | "dir" | "symlink";
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: 1;
  gid: 1;
  dev: 1;
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}

interface StatOpts {
  bigint: false;
}

export class FileSystem implements CallbackFsClient, PromiseFsClient {
  private api: any;
  private textEncoder = new TextEncoder();
  private textDecoder = new TextDecoder();
  public promises: {
    mkdir: (filePath: string /* opts: { mode: number }*/) => Promise<void>;
    readdir: (filePath: string /*opts: any*/) => Promise<string[]>;
    writeFile: (
      filePath: string,
      data: Uint8Array | string,
      opts: any
    ) => Promise<void>;
    readFile: (
      filePath: string,
      opts: { encoding: string } | string
    ) => Promise<string | Uint8Array>;
    unlink: (filePath: string /*opts: any*/) => Promise<void>;
    rmdir: (dirPath: string, opts: any) => Promise<void>;
    rename: (oldFilePath: string, newFilePath: string) => Promise<void>;
    stat: (filePath: string /*opts: any*/) => Promise<Stats>;
    lstat: (filePath: string /*, opts: any*/) => Promise<Stats>;
    symlink: (target: string, filePath: string) => Promise<void>;
    readlink: (filePath: string, opts: any) => Promise<string>;
    backFile: (filePath: string, opts: any) => Promise<void>;
    du: (filePath: string) => Promise<number>;
  };
  constructor(api: any) {
    this.api = api;
    const self = this;
    this.promises = {
      mkdir: promisify(this.mkdir.bind(self)),
      readdir: promisify(this.readdir.bind(self)),
      writeFile: promisify(this.writeFile.bind(self)),
      readFile: promisify(this.readFile.bind(self)),
      unlink: promisify(this.unlink.bind(self)),
      rmdir: promisify(this.rmdir.bind(self)),
      rename: promisify(this.rename.bind(self)),
      stat: promisify(this.stat.bind(self)),
      lstat: promisify(this.lstat.bind(self)),
      symlink: promisify(this.symlink.bind(self)),
      readlink: promisify(this.readlink.bind(self)),
      backFile: promisify(this.backFile.bind(self)),
      du: promisify(this.du.bind(self)),
    };
  }

  private constructVSCodeUriFromPath(filePath: string) {
    if (filePath.startsWith(this.api.nativeFSPrefix)) {
      return Uri.parse(`nativefs:${filePath.replace(/\/+/g, "/")}`);
    } else {
      return Uri.parse(`memfs:${filePath}`, true);
    }
  }

  public mkdir(
    filePath: string,
    // opts: { mode: number },
    callback: (error?: Error) => void
  ) {
    this.api
      .createDirectory(this.constructVSCodeUriFromPath(filePath))
      .then(() => {
        callback();
      })
      .catch((error: Error) => {
        callback(error);
      });
  }

  public readdir(
    filePath: string,
    // opts: any,
    callback: (error: Error | undefined, files: string[]) => void
  ) {
    this.api
      .readDirectory(this.constructVSCodeUriFromPath(filePath))
      .then((result: [string, FileType][]) => {
        return callback(
          undefined,
          result.map(([file]) => file)
        );
      })
      .catch((error: Error) => {
        return callback(error, []);
      });
  }

  public writeFile(
    filePath: string,
    data: Uint8Array | string,
    opts: any,
    callback: (error?: Error) => void
  ) {
    let content: Uint8Array;
    if (typeof data === "string") {
      content = this.textEncoder.encode(data);
    } else {
      content = data;
    }
    this.api
      .writeFile(this.constructVSCodeUriFromPath(filePath), content, {
        create: true,
        overwrite: true,
      })
      .then(() => {
        callback();
      })
      .catch((error: Error) => {
        callback(error);
      });
  }

  public readFile(
    filePath: string,
    opts: { encoding: string } | string,
    callback: (error: Error | undefined, data: string | Uint8Array) => void
  ) {
    this.api
      .readFile(this.constructVSCodeUriFromPath(filePath))
      .then((data: Uint8Array) => {
        if (
          opts === "utf8" ||
          (typeof opts === "object" && opts?.encoding === "utf8")
        ) {
          return callback(undefined, this.textDecoder.decode(data));
        } else {
          return callback(undefined, data);
        }
      })
      .catch((error: Error) => {
        callback(error, "");
      });
  }

  public unlink(
    filePath: string,
    // opts: any,
    callback: (error?: Error) => void
  ) {
    this.api
      .delete(this.constructVSCodeUriFromPath(filePath), {
        recursive: true,
      })
      .then(() => {
        callback();
      })
      .catch((error: Error) => {
        callback(error);
      });
  }

  public rmdir = this.unlink;

  public rename(
    oldFilePath: string,
    newFilePath: string,
    callback: (error?: Error) => void
  ) {
    this.api
      .rename(
        this.constructVSCodeUriFromPath(oldFilePath),
        this.constructVSCodeUriFromPath(newFilePath),
        { overwrite: true }
      )
      .then(() => {
        callback();
      })
      .catch((error: Error) => {
        callback(error);
      });
  }
  public stat(
    filePath: string,
    // opts: StatOpts,
    callback: (error: Error | undefined, stats: Stats) => void
  ) {
    this.api
      .stat(this.constructVSCodeUriFromPath(filePath))
      .then((stats: FileStat) => {
        const newStats: Stats = {
          type:
            stats.type === FileType.Directory
              ? "dir"
              : stats.type === FileType.SymbolicLink
              ? "symlink"
              : "file",
          mode: 0, // TODO: we are unable to get mode for now.
          size: stats.size,
          ino: 0,
          mtimeMs: stats.mtime,
          ctimeMs: stats.ctime,
          uid: 1,
          gid: 1,
          dev: 1,
          isFile: () => stats.type === FileType.File,
          isDirectory: () => stats.type === FileType.Directory,
          isSymbolicLink: () => stats.type === FileType.SymbolicLink,
        };
        callback(undefined, newStats);
      })
      .catch((error: Error) => {
        callback(new ENOENT(error.message), undefined as any);
      });
  }

  /*
  public lstat(
    filePath: string,
    opts: any,
    callback: (error: Error | undefined, stats: Stats) => void
  ) {
    return callback(
      new Error(`vscode-isomorphic-git: lstat not implemented`),
      undefined as any
    );
  }
  */
  public lstat = this.stat;

  public symlink(
    target: string,
    filePath: string,
    callback: (error?: Error) => void
  ) {
    return callback(
      new Error(`vscode-isomorphis-git: symlink not implemented`)
    );
  }

  public readlink(
    filePath: string,
    opts: any,
    callback: (error: Error | undefined, linkString: string) => void
  ) {
    return callback(
      new Error(`vscode-isomorphis-git: readlink not implemented`),
      ""
    );
  }

  public backFile(
    filePath: string,
    opts: any,
    callback: (error?: Error) => void
  ) {
    return callback(
      new Error(`vscode-isomorphic-git: backFile not implemented`)
    );
  }

  public du(
    filePath: string,
    callback: (error: Error | undefined, size: number) => void
  ) {
    return callback(new Error(`vscode-isomorphis-git: du not implemented`), 0);
  }
}
