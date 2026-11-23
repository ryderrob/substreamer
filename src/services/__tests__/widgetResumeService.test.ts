jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { currentState: 'background' },
}));

const mockConsume = jest.fn();
jest.mock('expo-now-playing-widget', () => ({
  consumeWidgetResumeRequest: () => mockConsume(),
}));

const mockEnsureReady = jest.fn();
jest.mock('../headlessMediaService', () => ({
  ensureHeadlessDataReady: () => mockEnsureReady(),
}));

const mockResume = jest.fn();
jest.mock('../playerService', () => ({
  resumeFromWidget: (...args: unknown[]) => mockResume(...args),
}));

import { maybeResumeFromWidget } from '../widgetResumeService';

const mockRN = jest.requireMock('react-native') as {
  Platform: { OS: string };
  AppState: { currentState: string };
};

const NOW = 1_700_000_000_000;
const fresh = (overrides: Record<string, unknown> = {}) => ({
  kind: 'play',
  index: null,
  requestedAt: NOW - 1000,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(console, 'warn').mockImplementation();
  mockRN.Platform.OS = 'android';
  mockRN.AppState.currentState = 'background';
  mockEnsureReady.mockResolvedValue(undefined);
  mockResume.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('maybeResumeFromWidget', () => {
  it('does nothing when no request is pending', async () => {
    mockConsume.mockReturnValue(null);
    await maybeResumeFromWidget();
    expect(mockEnsureReady).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('consumes and ignores a stale request', async () => {
    mockConsume.mockReturnValue(fresh({ requestedAt: NOW - 30_001 }));
    await maybeResumeFromWidget();
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('consumes and ignores a request when the UI is active', async () => {
    mockRN.AppState.currentState = 'active';
    mockConsume.mockReturnValue(fresh());
    await maybeResumeFromWidget();
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockEnsureReady).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('awaits headless readiness, then resumes with the request', async () => {
    const order: string[] = [];
    mockEnsureReady.mockImplementation(async () => {
      order.push('ready');
    });
    mockResume.mockImplementation(async () => {
      order.push('resume');
    });
    const request = fresh({ kind: 'skip', index: 4 });
    mockConsume.mockReturnValue(request);

    await maybeResumeFromWidget();

    expect(order).toEqual(['ready', 'resume']);
    expect(mockResume).toHaveBeenCalledWith(request);
  });

  it('swallows and logs a resume failure', async () => {
    mockConsume.mockReturnValue(fresh());
    mockResume.mockRejectedValue(new Error('boom'));
    await expect(maybeResumeFromWidget()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('[widgetResume] resume failed:', expect.any(String));
  });

  it('is a no-op off Android and leaves the request alone', async () => {
    mockRN.Platform.OS = 'ios';
    mockConsume.mockReturnValue(fresh());
    await maybeResumeFromWidget();
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });
});
