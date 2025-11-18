package com.example.reflectiontracker.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface BrowsingEventDao {
    @Query("SELECT * FROM browsing_events ORDER BY timestamp DESC")
    fun observeEvents(): Flow<List<BrowsingEvent>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(event: BrowsingEvent)

    @Query("DELETE FROM browsing_events")
    suspend fun clearAll()
}
