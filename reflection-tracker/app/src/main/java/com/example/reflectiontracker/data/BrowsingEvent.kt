package com.example.reflectiontracker.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "browsing_events")
data class BrowsingEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val url: String,
    val packageName: String,
    val timestamp: Long
)
