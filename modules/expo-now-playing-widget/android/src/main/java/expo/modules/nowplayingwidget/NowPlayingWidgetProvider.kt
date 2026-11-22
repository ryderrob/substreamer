package expo.modules.nowplayingwidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import java.util.concurrent.Executors

/**
 * Home-screen widget: now-playing header + scrollable queue. State comes from the
 * persisted [WidgetSnapshot] (pushed by JS, or by [WidgetControlReceiver] after a
 * tap); taps are handled by [WidgetControlReceiver]. Rendering runs on a single
 * background thread because it decodes artwork.
 */
class NowPlayingWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    refreshAll(context)
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      lastQueueSig.remove(id)
      lastIndex.remove(id)
    }
  }

  companion object {
    private val renderExecutor = Executors.newSingleThreadExecutor()

    // Per-widget render memo (accessed only on [renderExecutor], so no locking).
    // Drives the full-vs-incremental update decision that keeps the queue list
    // from flickering: the RemoteAdapter is set once, then only the header is
    // updated incrementally and the list is told to reload solely when its
    // contents (queue identity) or the highlighted row (index) actually change.
    private val lastQueueSig = HashMap<Int, String>()
    private val lastIndex = HashMap<Int, Int>()

    /** Queue identity: order-sensitive join of track ids. A change here means the
     *  list rows differ (added/removed/reordered); a stable value means only the
     *  header and/or highlight moved. */
    private fun queueSignature(snapshot: WidgetSnapshot): String =
      snapshot.tracks.joinToString("") { it.id }

    /** Re-render every widget instance from the stored snapshot. Safe to call
     *  from any thread — the heavy work is posted to [renderExecutor]. */
    fun refreshAll(context: Context) {
      val appContext = context.applicationContext
      renderExecutor.execute {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, NowPlayingWidgetProvider::class.java),
        )
        if (ids.isEmpty()) return@execute
        val snapshot = WidgetSnapshotStore.load(appContext)
        val queueSig = queueSignature(snapshot)
        val notifyIds = ArrayList<Int>(ids.size)

        for (id in ids) {
          // Header actions only — buildRootViews touches no list views, so this
          // doubles as the incremental (header) payload.
          val views = WidgetRenderer.buildRootViews(appContext, snapshot)

          // Full update (sets the RemoteAdapter) only the first time we render a
          // given id this process lifetime — on first bind, or after a process
          // restart. Re-setting the adapter is what recreates the ListView and
          // causes the flicker, so afterwards we never do it again.
          if (id !in lastQueueSig) {
            val serviceIntent = Intent(appContext, QueueWidgetService::class.java).apply {
              putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
              // Unique data per widget id so the host keeps a distinct factory.
              data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.nppw_queue_list, serviceIntent)
            views.setEmptyView(R.id.nppw_queue_list, R.id.nppw_empty)
            views.setPendingIntentTemplate(
              R.id.nppw_queue_list,
              WidgetControlReceiver.skipTemplate(appContext),
            )
            manager.updateAppWidget(id, views)
            notifyIds.add(id)
          } else {
            // Incremental: apply the header actions over the existing views; the
            // list is left completely untouched (no reload = no flicker).
            manager.partiallyUpdateAppWidget(id, views)
            if (lastQueueSig[id] != queueSig || lastIndex[id] != snapshot.currentIndex) {
              notifyIds.add(id)
            }
          }
          lastQueueSig[id] = queueSig
          lastIndex[id] = snapshot.currentIndex
        }

        // Reload the list only where its rows or the highlighted row changed.
        if (notifyIds.isNotEmpty()) {
          manager.notifyAppWidgetViewDataChanged(notifyIds.toIntArray(), R.id.nppw_queue_list)
        }
      }
    }
  }
}
