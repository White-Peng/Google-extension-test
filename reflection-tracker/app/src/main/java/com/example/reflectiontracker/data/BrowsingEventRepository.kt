package com.example.reflectiontracker.data

import kotlinx.coroutines.flow.Flow

class BrowsingEventRepository(private val dao: BrowsingEventDao) {
    fun observeEvents(): Flow<List<BrowsingEvent>> = dao.observeEvents()

    suspend fun addEvent(event: BrowsingEvent) {
        dao.insert(event)
    }

    suspend fun clearAll() {
        dao.clearAll()
    }
}
