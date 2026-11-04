export const unavailable = (message = 'IndexedDB storage is unavailable') =>
  Object.assign(new Error(message), { code: 'STORAGE_UNAVAILABLE' });
export const storageFailure = (error) =>
  Object.assign(unavailable(error?.message), { name: error?.name || 'Error' });
