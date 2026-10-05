export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function objectBody(value, allowed) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ApiError(400, 'invalid-body', '请求必须是 JSON 对象');
  }
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, 'unknown-field', '请求包含不支持的字段');
  }
}
