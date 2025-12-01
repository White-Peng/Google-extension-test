package com.example.reflectiontracker.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [BrowsingEvent::class],
    version = 1,
    exportSchema = false
)
abstract class BrowsingDatabase : RoomDatabase() {
    abstract fun browsingEventDao(): BrowsingEventDao

    companion object {
        @Volatile
        private var Instance: BrowsingDatabase? = null

        fun getInstance(context: Context): BrowsingDatabase {
            return Instance ?: synchronized(this) {
                Instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    BrowsingDatabase::class.java,
                    "browsing_events.db"
                ).build().also { Instance = it }
            }
        }
    }
}
