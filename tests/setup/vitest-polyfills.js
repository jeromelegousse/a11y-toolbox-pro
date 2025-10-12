if (typeof ArrayBuffer !== 'undefined') {
  const descriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
  if (!descriptor) {
    Object.defineProperty(ArrayBuffer.prototype, 'resizable', {
      configurable: true,
      get() {
        return false;
      }
    });
  }
}

if (typeof SharedArrayBuffer === 'undefined') {
  class SharedArrayBufferMock {}
  Object.defineProperty(SharedArrayBufferMock.prototype, 'growable', {
    configurable: true,
    get() {
      return false;
    }
  });
  globalThis.SharedArrayBuffer = SharedArrayBufferMock;
} else {
  const descriptor = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable');
  if (!descriptor) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'growable', {
      configurable: true,
      get() {
        return false;
      }
    });
  }
}
