import test, { mock } from 'node:test';
import assert from 'node:assert';

// Mock modules BEFORE importing the module under test
mock.module('sonner', {
  namedExports: {
    toast: {
      error: mock.fn(),
    },
  },
});

mock.module(import.meta.resolve('./firebase.ts'), {
  namedExports: {
    auth: {
      currentUser: {
        uid: 'test-uid',
        email: 'test@example.com',
        emailVerified: true,
        isAnonymous: false,
        tenantId: 'test-tenant',
        providerData: [
          { providerId: 'password', email: 'test@example.com' }
        ]
      }
    }
  }
});

// Use dynamic import to ensure mocks are applied
const { handleFirestoreError, OperationType } = await import('./firestore-error.ts');
const { toast } = await import('sonner');

test('handleFirestoreError - Permission Denied', () => {
  const toastErrorMock = (toast.error as any);
  toastErrorMock.mock.resetCalls();

  const error = new Error('Missing or insufficient permissions');

  assert.throws(() => {
    handleFirestoreError(error, OperationType.CREATE, 'users/123');
  }, (err: any) => {
    return err.message.includes('Missing or insufficient permissions');
  });

  assert.strictEqual(toastErrorMock.mock.callCount(), 1);
  assert.strictEqual(toastErrorMock.mock.calls[0].arguments[0], 'Permission denied. You do not have access to perform this action.');
});

test('handleFirestoreError - Network Error', () => {
  const toastErrorMock = (toast.error as any);
  toastErrorMock.mock.resetCalls();

  const error = 'failed to fetch';

  assert.throws(() => {
    handleFirestoreError(error, OperationType.UPDATE, 'posts/456');
  }, (err: any) => {
    return err.message.includes('failed to fetch');
  });

  assert.strictEqual(toastErrorMock.mock.callCount(), 1);
  assert.strictEqual(toastErrorMock.mock.calls[0].arguments[0], 'Network error. Please check your internet connection.');
});

test('handleFirestoreError - Generic Error', () => {
  const toastErrorMock = (toast.error as any);
  toastErrorMock.mock.resetCalls();

  const error = new Error('Some random firestore error');

  assert.throws(() => {
    handleFirestoreError(error, OperationType.DELETE, 'posts/456');
  }, (err: any) => {
    return err.message.includes('Some random firestore error');
  });

  assert.strictEqual(toastErrorMock.mock.callCount(), 1);
  assert.strictEqual(toastErrorMock.mock.calls[0].arguments[0], 'An error occurred while accessing the database.');
});

test('handleFirestoreError - Does not throw for GET/LIST', () => {
  const toastErrorMock = (toast.error as any);
  toastErrorMock.mock.resetCalls();

  const error = new Error('Read error');

  // Should not throw
  handleFirestoreError(error, OperationType.GET, 'items');
  handleFirestoreError(error, OperationType.LIST, 'items');

  assert.strictEqual(toastErrorMock.mock.callCount(), 2);
});

test('handleFirestoreError - console.error logging', () => {
  const consoleSpy = mock.method(console, 'error', () => {});

  const error = new Error('Log this error');
  handleFirestoreError(error, OperationType.GET, 'log/path');

  assert.strictEqual(consoleSpy.mock.callCount(), 1);
  const logArg = consoleSpy.mock.calls[0].arguments[1];
  const parsedLog = JSON.parse(logArg);

  assert.strictEqual(parsedLog.error, 'Log this error');
  assert.strictEqual(parsedLog.operationType, 'get');
  assert.strictEqual(parsedLog.path, 'log/path');
  assert.strictEqual(parsedLog.authInfo.userId, 'test-uid');

  consoleSpy.mock.restore();
});
