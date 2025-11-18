package com.example.reflectiontracker.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.reflectiontracker.data.BrowsingDatabase
import com.example.reflectiontracker.data.BrowsingEvent
import com.example.reflectiontracker.data.BrowsingEventRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class BrowsingEventsViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = BrowsingEventRepository(
        BrowsingDatabase.getInstance(application).browsingEventDao()
    )

    val events: StateFlow<List<BrowsingEvent>> = repository.observeEvents()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun clear() {
        viewModelScope.launch {
            repository.clearAll()
        }
    }
}
