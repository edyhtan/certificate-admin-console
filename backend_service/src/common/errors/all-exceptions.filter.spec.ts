import { Logger, type ArgumentsHost } from '@nestjs/common';
import { NotFoundError } from './app-error.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function hostWith(res: Record<string, unknown>): ArgumentsHost {
  const req = { method: 'GET', originalUrl: '/api/thing' };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
}

function fakeResponse(headersSent = false) {
  const res = {
    headersSent,
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the contract error shape and status', () => {
    const res = fakeResponse();
    filter.catch(new NotFoundError('Certificate not found'), hostWith(res));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'not_found',
      message: 'Certificate not found',
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs unexpected errors with the request line and answers 500', () => {
    const res = fakeResponse();
    const boom = new Error('boom');
    filter.catch(boom, hostWith(res));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'internal_error',
      message: 'Something went wrong',
    });
    expect(logError).toHaveBeenCalledWith('GET /api/thing failed', boom.stack);
  });

  it('only ends a response that has already started streaming', () => {
    const res = fakeResponse(true);
    filter.catch(new Error('mid-stream'), hostWith(res));
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
