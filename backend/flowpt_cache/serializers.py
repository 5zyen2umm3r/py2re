from rest_framework import serializers
from .models import CachedEntity, CachedProject, EntityDiff, EntityHistory, Snapshot, SyncState


class CachedProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = CachedProject
        fields = ["id", "flowpt_id", "data", "synced_at"]


class CachedEntitySerializer(serializers.ModelSerializer):
    # CachedProject の flowpt_id を project_id として公開
    project_id = serializers.IntegerField(source="project.flowpt_id", read_only=True, allow_null=True)

    class Meta:
        model = CachedEntity
        fields = ["id", "entity_type", "flowpt_id", "project_id", "data", "synced_at"]


class SyncStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncState
        fields = ["entity_type", "last_synced_at"]


class EntityDiffSerializer(serializers.ModelSerializer):
    class Meta:
        model = EntityDiff
        fields = ["id", "entity_type", "flowpt_id", "patch", "action", "created_at", "snapshot"]


class EntityHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EntityHistory
        fields = ["id", "entity_type", "flowpt_id", "generation", "before", "after", "action", "created_at"]


class SnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Snapshot
        fields = ["id", "name", "description", "created_at"]
