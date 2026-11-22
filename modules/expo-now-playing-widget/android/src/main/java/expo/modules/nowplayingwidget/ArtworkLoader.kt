package expo.modules.nowplayingwidget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads + downsamples cover-art bitmaps for the widget from an `http(s)://`,
 * `content://`, or `file://` URI. Process-wide LRU keyed by URI string so
 * play/pause and re-renders don't refetch, and a scrolling queue re-reads
 * already-decoded thumbnails. All calls happen off the main thread (the list
 * factory's binder thread, or the widget refresh executor).
 */
object ArtworkLoader {
  // ~6MB of decoded thumbnails is ample for a visible queue + header.
  private val cache = object : LruCache<String, Bitmap>(6 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
  }

  private const val CONNECT_TIMEOUT_MS = 8_000
  private const val READ_TIMEOUT_MS = 10_000

  fun load(context: Context, uri: String?, targetPx: Int): Bitmap? {
    if (uri.isNullOrBlank()) return null
    cache.get(uri)?.let { return it }
    val bitmap = try {
      decode(context, uri, targetPx)
    } catch (_: Throwable) {
      null
    }
    if (bitmap != null) cache.put(uri, bitmap)
    return bitmap
  }

  private fun decode(context: Context, uriStr: String, targetPx: Int): Bitmap? {
    // Pass 1: bounds only, to compute an inSampleSize.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openStream(context, uriStr)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    val opts = BitmapFactory.Options().apply {
      inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, targetPx)
    }
    return openStream(context, uriStr)?.use { BitmapFactory.decodeStream(it, null, opts) }
  }

  private fun sampleSize(width: Int, height: Int, targetPx: Int): Int {
    var sample = 1
    var w = width
    var h = height
    while (w / 2 >= targetPx && h / 2 >= targetPx) {
      w /= 2
      h /= 2
      sample *= 2
    }
    return sample
  }

  private fun openStream(context: Context, uriStr: String): InputStream? {
    val uri = Uri.parse(uriStr)
    return when (uri.scheme?.lowercase()) {
      "http", "https" -> {
        val conn = (URL(uriStr).openConnection() as HttpURLConnection).apply {
          connectTimeout = CONNECT_TIMEOUT_MS
          readTimeout = READ_TIMEOUT_MS
          instanceFollowRedirects = true
        }
        conn.inputStream
      }
      "content" -> context.contentResolver.openInputStream(uri)
      "file" -> uri.path?.let { File(it).inputStream() }
      else -> null
    }
  }
}
