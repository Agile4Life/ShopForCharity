export class ApiException extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiException';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static missing() {
    return new ApiException(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu.');
  }

  static check(condition, status, code, message, details = []) {
    if (!condition) {
      throw new ApiException(status, code, message, details);
    }
  }

  static version(actual, expected) {
    if (BigInt(actual) !== BigInt(expected)) {
      throw new ApiException(
        409,
        'VERSION_CONFLICT',
        'Dữ liệu đã thay đổi. Vui lòng tải lại.',
        { version: Number(actual) }
      );
    }
  }
}
