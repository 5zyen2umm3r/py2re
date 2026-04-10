from django.contrib import admin
from .models import CachedEntity, EntityHistory, EntityDiff, Snapshot, CachedProject, SyncState 

@admin.register(CachedEntity)
class CachedEntityAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "flowpt_id"]
    list_filter = ["entity_type", "project"]

@admin.register(EntityDiff)
class EntityDiffAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "action", "flowpt_id", "patch"]

@admin.register(SyncState)
class SyncStateAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "last_synced_at"]

admin.site.register(EntityHistory)
admin.site.register(Snapshot)

admin.site.register(CachedProject)