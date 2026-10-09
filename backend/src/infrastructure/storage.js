import { config } from '../config.js';
import { ApiException } from '../common/api-exception.js';

export class SupabaseStorage {
  constructor(base = config.supabaseUrl, key = config.supabaseStorageKey) {
    this.base = (base || '').replace(/\/+$/, '');
    this.key = key || '';
  }

  async call(method, path, body, contentType) {
    ApiException.check(
      Boolean(this.key),
      503,
      'STORAGE_UNAVAILABLE',
      'Chưa cấu hình Storage.'
    );

    const headers = {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
    };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${this.base}/storage/v1/${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new ApiException(503, 'STORAGE_UNAVAILABLE', 'Không thể xử lý ảnh.');
      }
      return await res.text();
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throw new ApiException(503, 'STORAGE_UNAVAILABLE', 'Không thể xử lý ảnh.');
    }
  }

  async upload(bucket, path, buffer, mime) {
    await this.call('POST', `object/${bucket}/${path}`, buffer, mime);
  }

  async delete(bucket, path) {
    try {
      await this.call(
        'DELETE',
        `object/${bucket}`,
        JSON.stringify({ prefixes: [path] }),
        'application/json'
      );
    } catch (err) {
      console.warn('Storage delete warning', err.message);
    }
  }

  async signed(bucket, path, seconds) {
    const raw = await this.call(
      'POST',
      `object/sign/${bucket}/${path}`,
      JSON.stringify({ expiresIn: seconds }),
      'application/json'
    );
    try {
      const data = JSON.parse(raw);
      const url = data.signedURL || data.signedUrl;
      ApiException.check(
        url && url.startsWith('/object/sign/'),
        503,
        'STORAGE_UNAVAILABLE',
        'Không thể cấp quyền xem ảnh.'
      );
      return `${this.base}/storage/v1${url}`;
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throw new ApiException(503, 'STORAGE_UNAVAILABLE', 'Không thể cấp quyền xem ảnh.');
    }
  }

  publicUrl(bucket, path) {
    return `${this.base}/storage/v1/object/public/${bucket}/${path}`;
  }
}

let defaultStorage = null;
export function getStorage() {
  if (!defaultStorage) {
    defaultStorage = new SupabaseStorage();
  }
  return defaultStorage;
}
