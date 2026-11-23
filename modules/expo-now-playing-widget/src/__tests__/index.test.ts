import ExpoNowPlayingWidgetModule from '../ExpoNowPlayingWidgetModule';
import {
  setWidgetSnapshot,
  clearWidget,
  consumeWidgetResumeRequest,
  type WidgetSnapshot,
} from '../index';

const mockModule = jest.mocked(ExpoNowPlayingWidgetModule);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setWidgetSnapshot', () => {
  it('serializes the snapshot to JSON and delegates to native', () => {
    const snapshot: WidgetSnapshot = {
      hasSession: true,
      isPlaying: true,
      currentIndex: 1,
      offset: 0,
      tracks: [
        { id: 'a', title: 'A', artist: 'x', artUri: null },
        { id: 'b', title: 'B', artist: 'y', artUri: 'https://art/b' },
      ],
    };

    setWidgetSnapshot(snapshot);

    expect(mockModule.setSnapshot).toHaveBeenCalledTimes(1);
    expect(mockModule.setSnapshot).toHaveBeenCalledWith(JSON.stringify(snapshot));
  });

  it('handles the empty-session snapshot', () => {
    const snapshot: WidgetSnapshot = {
      hasSession: false,
      isPlaying: false,
      currentIndex: -1,
      offset: 0,
      tracks: [],
    };

    setWidgetSnapshot(snapshot);

    expect(mockModule.setSnapshot).toHaveBeenCalledWith(JSON.stringify(snapshot));
  });
});

describe('consumeWidgetResumeRequest', () => {
  const consume = (json: string | null) => {
    mockModule.consumeResumeRequest.mockReturnValueOnce(json);
    return consumeWidgetResumeRequest();
  };

  it('parses a play request', () => {
    expect(consume('{"kind":"play","index":null,"requestedAt":1000}')).toEqual({
      kind: 'play',
      index: null,
      requestedAt: 1000,
    });
  });

  it('parses a skip request with its index', () => {
    expect(consume('{"kind":"skip","index":7,"requestedAt":2000}')).toEqual({
      kind: 'skip',
      index: 7,
      requestedAt: 2000,
    });
  });

  it('returns null when nothing is pending', () => {
    expect(consume(null)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(consume('{not json')).toBeNull();
  });

  it('returns null for missing or invalid fields', () => {
    expect(consume('null')).toBeNull();
    expect(consume('{"kind":"play","index":null}')).toBeNull();
    expect(consume('{"kind":"stop","index":null,"requestedAt":1}')).toBeNull();
    expect(consume('{"index":1,"requestedAt":1}')).toBeNull();
    expect(consume('{"kind":"skip","index":null,"requestedAt":1}')).toBeNull();
  });

  it('returns null from the default mock', () => {
    expect(consumeWidgetResumeRequest()).toBeNull();
  });
});

describe('clearWidget', () => {
  it('delegates to native clear', () => {
    clearWidget();

    expect(mockModule.clear).toHaveBeenCalledTimes(1);
  });
});
