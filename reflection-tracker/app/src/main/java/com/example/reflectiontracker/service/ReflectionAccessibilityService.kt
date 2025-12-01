package com.example.reflectiontracker.service

import android.accessibilityservice.AccessibilityService
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.util.Patterns
import androidx.core.app.NotificationCompat
import com.example.reflectiontracker.MainActivity
import com.example.reflectiontracker.R
import com.example.reflectiontracker.data.BrowsingDatabase
import com.example.reflectiontracker.data.BrowsingEvent
import com.example.reflectiontracker.data.BrowsingEventRepository
import java.util.ArrayDeque
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ReflectionAccessibilityService : AccessibilityService() {
    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    private val repository by lazy {
        BrowsingEventRepository(
            BrowsingDatabase.getInstance(applicationContext).browsingEventDao()
        )
    }

    private var lastUrl: String? = null
    private var lastTimestamp: Long = 0

    override fun onServiceConnected() {
        super.onServiceConnected()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.packageName != CHROME_PACKAGE) return
        val root = rootInActiveWindow ?: return
        val url = extractUrl(root)?.takeIf { it.isNotBlank() } ?: return
        if (!looksLikeUrl(url)) return

        val now = System.currentTimeMillis()
        if (url == lastUrl && now - lastTimestamp < DEDUP_WINDOW_MS) {
            return
        }

        lastUrl = url
        lastTimestamp = now

        serviceScope.launch {
            repository.addEvent(
                BrowsingEvent(
                    url = url,
                    packageName = event.packageName?.toString().orEmpty(),
                    timestamp = now
                )
            )
        }
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        super.onDestroy()
        stopForeground(STOP_FOREGROUND_REMOVE)
        serviceScope.cancel()
    }

    private fun extractUrl(root: AccessibilityNodeInfo): String? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(AccessibilityNodeInfo.obtain(root))
        var result: String? = null

        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            if (node.viewIdResourceName == URL_BAR_ID &&
                node.className == URL_BAR_CLASS &&
                !node.text.isNullOrBlank()
            ) {
                result = node.text?.toString()
                node.recycle()
                recycleQueue(queue)
                break
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    queue.add(child)
                }
            }
            node.recycle()
        }

        root.recycle()
        return result?.trim()
    }

    private fun looksLikeUrl(text: String): Boolean {
        return Patterns.WEB_URL.matcher(text).matches() || text.startsWith("chrome://")
    }

    private fun buildNotification(): Notification {
        createChannel()
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = getString(R.string.notification_channel_description)
                setShowBadge(false)
            }
            manager?.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val CHANNEL_ID = "reflection_tracker_channel"
        private const val NOTIFICATION_ID = 42
        private const val URL_BAR_ID = "com.android.chrome:id/url_bar"
        private const val URL_BAR_CLASS = "android.widget.EditText"
        private const val CHROME_PACKAGE = "com.android.chrome"
        private const val DEDUP_WINDOW_MS = 3_000
    }

    private fun recycleQueue(queue: ArrayDeque<AccessibilityNodeInfo>) {
        while (queue.isNotEmpty()) {
            queue.removeFirst().recycle()
        }
    }
}
