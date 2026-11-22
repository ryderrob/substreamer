import ExpoNowPlayingWidgetModule from '../ExpoNowPlayingWidgetModule';
import { setWidgetSnapshot, clearWidget, type WidgetSnapshot } from '../index';

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
      tracks: [],
    };

    setWidgetSnapshot(snapshot);

    expect(mockModule.setSnapshot).toHaveBeenCalledWith(JSON.stringify(snapshot));
  });
});

describe('clearWidget', () => {
  it('delegates to native clear', () => {
    clearWidget();

    expect(mockModule.clear).toHaveBeenCalledTimes(1);
  });
});
