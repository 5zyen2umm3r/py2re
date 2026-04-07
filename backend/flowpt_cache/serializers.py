from rest_framework import serializers
from .models import CachedEntity, EntityDiff, EntityHistory, Snapshot


class CachedEntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = CachedEntity
        fields = ["id", "entity_type", "flowpt_id", "data", "synced_at"]


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
