package expo.modules.nowplayingwidget

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken

/**
 * Handles widget transport taps. Each tap connects an in-process Media3
 * [MediaController] to RNQP's `PlaybackService` (which `onConnect` accepts for
 * in-app controllers with the default command set), issues the command, then
 * re-reads the live timeline and re-publishes a [WidgetSnapshot] so the widget
 * updates even when the RN JS process is dead. The service is the single source
 * of truth, so this works headless while playback (its foreground service) is
 * alive.
 */
class WidgetControlReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action !in ACTIONS) return
    val index = intent.getIntExtra(EXTRA_INDEX, -1)

    val appContext = context.applicationContext
    val pending = goAsync()
    val token = SessionToken(appContext, ComponentName(appContext.packageName, PLAYBACK_SERVICE_CLASS))
    val future = MediaController.Builder(appContext, token).buildAsync()
    future.addListener({
      val controller = try {
        future.get()
      } catch (_: Throwable) {
        null
      }
      if (controller != null) {
        try {
          // Capture BEFORE the command — Media3 flips isPlaying asynchronously,
          // so the optimistic play-state must be derived from the prior value.
          val wasPlaying = controller.isPlaying
          applyCommand(controller, action, index, wasPlaying)
          val expectedPlaying = when (action) {
            ACTION_PLAY_PAUSE -> !wasPlaying
            ACTION_SKIP -> true
            else -> wasPlaying
          }
          publishFromController(appContext, controller, expectedPlaying)
        } catch (_: Throwable) {
          // Best-effort: a mid-command session teardown must not crash the receiver.
        } finally {
          controller.release()
        }
      }
      pending.finish()
    }, ContextCompat.getMainExecutor(appContext))
  }

  /** Must run on the controller's application thread (the main executor above). */
  private fun applyCommand(controller: MediaController, action: String, index: Int, wasPlaying: Boolean) {
    when (action) {
      ACTION_PLAY_PAUSE -> if (wasPlaying) controller.pause() else controller.play()
      ACTION_NEXT -> controller.seekToNextMediaItem()
      ACTION_PREV -> controller.seekToPreviousMediaItem()
      ACTION_SKIP -> if (index in 0 until controller.mediaItemCount) {
        controller.seekTo(index, 0L)
        if (!wasPlaying) controller.play()
      }
    }
  }

  /**
   * Snapshot the live timeline after the command. `isPlaying` lags a play/pause
   * by a frame, so the expected state is passed in (derived pre-command); queue +
   * index are synchronous after a seek.
   */
  private fun publishFromController(context: Context, controller: MediaController, expectedPlaying: Boolean) {
    val count = controller.mediaItemCount
    val tracks = ArrayList<WidgetTrack>(count)
    for (i in 0 until count) {
      val item: MediaItem = controller.getMediaItemAt(i)
      val meta = item.mediaMetadata
      tracks.add(
        WidgetTrack(
          id = item.mediaId,
          title = meta.title?.toString() ?: "",
          artist = meta.artist?.toString() ?: "",
          artUri = meta.artworkUri?.toString(),
        ),
      )
    }
    val snapshot = WidgetSnapshot(
      hasSession = count > 0,
      isPlaying = expectedPlaying,
      currentIndex = controller.currentMediaItemIndex,
      tracks = tracks,
    )
    WidgetSnapshotStore.save(context, snapshot)
    NowPlayingWidgetProvider.refreshAll(context)
  }

  companion object {
    const val ACTION_PLAY_PAUSE = "expo.modules.nowplayingwidget.PLAY_PAUSE"
    const val ACTION_NEXT = "expo.modules.nowplayingwidget.NEXT"
    const val ACTION_PREV = "expo.modules.nowplayingwidget.PREV"
    const val ACTION_SKIP = "expo.modules.nowplayingwidget.SKIP"
    const val EXTRA_INDEX = "index"

    private val ACTIONS = setOf(ACTION_PLAY_PAUSE, ACTION_NEXT, ACTION_PREV, ACTION_SKIP)
    private const val PLAYBACK_SERVICE_CLASS = "com.margelo.nitro.queueplayer.PlaybackService"
    /** The app's deep-link scheme (see `app.json` → `scheme`). */
    private const val APP_SCHEME = "substreamer"

    /** A fixed, distinct request code per action so FLAG_UPDATE_CURRENT replaces
     *  rather than multiplies the PendingIntent slots. */
    private fun requestCode(action: String): Int = when (action) {
      ACTION_PLAY_PAUSE -> 1
      ACTION_NEXT -> 2
      ACTION_PREV -> 3
      ACTION_SKIP -> 4
      else -> 0
    }

    /** Immutable PendingIntent for a fixed transport button. */
    fun pending(context: Context, action: String): PendingIntent {
      val intent = Intent(context, WidgetControlReceiver::class.java).setAction(action)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getBroadcast(context, requestCode(action), intent, flags)
    }

    /** Opens the app on the full-screen player (the current song). Uses the
     *  `substreamer://player` deep link the app registers via its scheme;
     *  SINGLE_TOP routes through onNewIntent when the app is already running so
     *  Expo Router navigates rather than cold-restarting. */
    fun openPlayer(context: Context): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$APP_SCHEME://player")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getActivity(context, 5, intent, flags)
    }

    /** Mutable template for the queue ListView — rows supply the track index via
     *  a fill-in intent, which requires a mutable PendingIntent on API 31+. */
    fun skipTemplate(context: Context): PendingIntent {
      val intent = Intent(context, WidgetControlReceiver::class.java).setAction(ACTION_SKIP)
      val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or mutable
      return PendingIntent.getBroadcast(context, requestCode(ACTION_SKIP), intent, flags)
    }
  }
}
