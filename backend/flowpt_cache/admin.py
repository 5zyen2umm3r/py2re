from django.contrib import admin
from .models import CachedEntity, EntityHistory, EntityDiff, Snapshot, CachedProject

@admin.register(CachedEntity)
class CachedEntityAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "flowpt_id"]
    list_filter = ["entity_type", "project"]
@admin.register(EntityDiff)
class EntityDiffAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "action", "flowpt_id", "patch"]

# Register your models here.
admin.site.register(EntityHistory)
admin.site.register(Snapshot)

admin.site.register(CachedProject)