declare module "busboy" {
  import { Writable } from "stream";

  interface FileInfo { filename: string; encoding: string; mimeType: string }
  interface FieldInfo { nameTruncated: boolean; valueTruncated: boolean; encoding: string; mimeType: string }
  interface BusboyConfig { headers: Record<string, string | string[] | undefined>; limits?: { fileSize?: number } }

  interface Busboy extends Writable {
    on(event: "file", listener: (fieldname: string, stream: NodeJS.ReadableStream, info: FileInfo) => void): this;
    on(event: "field", listener: (name: string, val: string, info: FieldInfo) => void): this;
    on(event: "finish", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  function busboy(config: BusboyConfig): Busboy;
  export default busboy;
}
