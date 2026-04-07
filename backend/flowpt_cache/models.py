from django.db import models
import json


class CachedEntity(models.Model):
    """Flow PTエンティティのキャッシュ（全エンティティ共通）"""
    entity_type = models.CharField(max_length=64, db_index=True)
    flowpt_id = models.IntegerField(db_index=True)
    data = models.JSONField()
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("entity_type", "flowpt_id")
        indexes = [models.Index(fields=["entity_type", "flowpt_id"])]

    def __str__(self):
        return f"{self.entity_type}:{self.flowpt_id}"


class EntityHistory(models.Model):
    """FlowPT同期時の差分履歴（世代管理）"""
    entity_type = models.CharField(max_length=64, db_index=True)
    flowpt_id = models.IntegerField(db_index=True)
    generation = models.PositiveIntegerField()
    before = models.JSONField(null=True)
    after = models.JSONField(null=True)
    action = models.CharField(max_length=16)  # created / updated / deleted
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["entity_type", "flowpt_id", "generation"])]


class EntityDiff(models.Model):
    """REST API経由の変更差分（未コミット）"""
    entity_type = models.CharField(max_length=64, db_index=True)
    flowpt_id = models.IntegerField(null=True, blank=True, db_index=True)  # nullは新規
    patch = models.JSONField()  # 変更フィールドのみ
    action = models.CharField(max_length=16)  # create / update / delete
    created_at = models.DateTimeField(auto_now_add=True)
    snapshot = models.ForeignKey(
        "Snapshot", null=True, blank=True, on_delete=models.SET_NULL, related_name="diffs"
    )

    class Meta:
        ordering = ["created_at"]


class Snapshot(models.Model):
    """任意時点の変更状態スナップショット"""
    name = models.CharField(max_length=256)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
