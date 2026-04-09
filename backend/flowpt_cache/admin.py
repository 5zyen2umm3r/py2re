from django.contrib import admin
from .models import CachedEntity, EntityHistory, EntityDiff, Snapshot

@admin.register(CachedEntity)
class CachedEntityAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "flowpt_id"]
    list_filter = ["entity_type", "project"]
@admin.register(EntityDiff)
class CachedEntityAdmin(admin.ModelAdmin):
    list_display = ["id", "entity_type", "flowpt_id", "patch"]

# Register your models here.
admin.site.register(EntityHistory)
admin.site.register(Snapshot)

