/**
 * Media storage provider — the ONE job: put bytes somewhere and return a stable
 * reference (public_id + url + dimensions). Like the search provider, this keeps
 * the storage engine (Cloudinary today) swappable: the media SERVICE owns
 * validation, the DB row, usage checks and policy; the provider only moves bytes.
 */
export interface UploadResult {
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export interface MediaProvider {
  readonly name: string;
  upload(bytes: Buffer, opts: { filename?: string; folder?: string }): Promise<UploadResult>;
  destroy(publicId: string): Promise<void>;
}
