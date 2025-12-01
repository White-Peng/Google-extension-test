package com.example.reflectiontracker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.reflectiontracker.data.BrowsingEvent
import com.example.reflectiontracker.service.ReflectionAccessibilityService
import com.example.reflectiontracker.ui.BrowsingEventsViewModel
import com.example.reflectiontracker.ui.theme.ReflectionTrackerTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val viewModel: BrowsingEventsViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ReflectionTrackerTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ReflectionTrackerScreen(viewModel = viewModel)
                }
            }
        }
    }
}

@Composable
fun ReflectionTrackerScreen(viewModel: BrowsingEventsViewModel) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val events by viewModel.events.collectAsStateWithLifecycle()

    var notificationsGranted by remember { mutableStateOf(isNotificationGranted(context)) }
    var serviceEnabled by remember { mutableStateOf(isAccessibilityServiceEnabled(context)) }

    val permissionLauncher = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            notificationsGranted = granted
        }
    } else {
        null
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                serviceEnabled = isAccessibilityServiceEnabled(context)
                notificationsGranted = isNotificationGranted(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(text = "实时浏览记录 & 反思触发", style = MaterialTheme.typography.headlineSmall)
        Text(
            text = if (serviceEnabled) "无障碍服务已开启" else "无障碍服务未开启",
            style = MaterialTheme.typography.bodyMedium
        )
        Button(onClick = { openAccessibilitySettings(context) }) {
            Text(text = context.getString(R.string.open_accessibility_settings))
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsGranted) {
            Button(onClick = { permissionLauncher?.launch(Manifest.permission.POST_NOTIFICATIONS) }) {
                Text(text = context.getString(R.string.grant_notification_permission))
            }
        }

        Divider()

        Text(text = context.getString(R.string.events_today), style = MaterialTheme.typography.titleMedium)

        if (events.isEmpty()) {
            Text(text = context.getString(R.string.no_data))
        } else {
            BrowsingEventList(events = events)
            Button(onClick = { viewModel.clear() }) {
                Text(text = "清空本地记录")
            }
        }
    }
}

@Composable
fun BrowsingEventList(events: List<BrowsingEvent>) {
    val formatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
    LazyColumn(modifier = Modifier.fillMaxWidth()) {
        items(events) { event ->
            BrowsingEventRow(event = event, formatter = formatter)
        }
    }
}

@Composable
fun BrowsingEventRow(event: BrowsingEvent, formatter: SimpleDateFormat) {
    Column(modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 8.dp)) {
        Text(text = event.url, style = MaterialTheme.typography.bodyMedium)
        Text(
            text = formatter.format(Date(event.timestamp)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun openAccessibilitySettings(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    )
}

private fun isAccessibilityServiceEnabled(context: Context): Boolean {
    val expectedComponent = ComponentName(
        context,
        ReflectionAccessibilityService::class.java
    )
    val enabledServices = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabledServices.split(":").any {
        ComponentName.unflattenFromString(it)?.equals(expectedComponent) == true
    }
}

private fun isNotificationGranted(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
}
