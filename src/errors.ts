function Err(name: string) {
  return class extends Error {
    private code: string;
    constructor(...args: any[]) {
      super(...args);
      this.code = name;
      if (this.message) {
        this.message = name + ": " + this.message;
      } else {
        this.message = name;
      }
    }
  };
}

export const EEXIST = Err("EEXIST");
export const ENOENT = Err("ENOENT");
export const ENOTDIR = Err("ENOTDIR");
export const ENOTEMPTY = Err("ENOTEMPTY");
export const ETIMEDOUT = Err("ETIMEDOUT");
