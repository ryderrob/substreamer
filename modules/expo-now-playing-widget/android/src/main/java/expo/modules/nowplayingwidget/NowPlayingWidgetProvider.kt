package expo.modules.nowplayingwidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import androidx.core.widget.RemoteViewsCompat
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

  companion object {
    private val renderExecutor = Executors.newSingleThreadExecutor()

    /** Re-render every widget instance from the stored snapshot. Each widget gets
     *  one full update carrying the header and the queue rows inline, so the host
     *  rebinds its list in place. Safe to call from any thread — the heavy work is
     *  posted to [renderExecutor]. */
    fun refreshAll(context: Context) {
      val appContext = context.applicationContext
      renderExecutor.execute {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, NowPlayingWidgetProvider::class.java),
        )
        if (ids.isEmpty()) return@execute
        val snapshot = WidgetSnapshotStore.load(appContext)

        for (id in ids) {
          val views = WidgetRenderer.buildRootViews(appContext, snapshot)
          RemoteViewsCompat.setRemoteAdapter(
            appContext,
            views,
            id,
            R.id.nppw_queue_list,
            WidgetRenderer.buildQueueItems(appContext, snapshot),
          )
          views.setEmptyView(R.id.nppw_queue_list, R.id.nppw_empty)
          views.setPendingIntentTemplate(
            R.id.nppw_queue_list,
            WidgetControlReceiver.skipTemplate(appContext),
          )
          manager.updateAppWidget(id, views)
        }
      }
    }
  }
}
