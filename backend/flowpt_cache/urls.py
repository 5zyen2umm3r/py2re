from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EntityViewSet, EntityHistoryViewSet, SnapshotViewSet

router = DefaultRouter()
router.register(r"history", EntityHistoryViewSet, basename="history")
router.register(r"snapshots", SnapshotViewSet, basename="snapshot")

# 汎用エンティティルート: /api/entities/<entity_type>/
entity_list = EntityViewSet.as_view({"get": "list", "post": "create"})
entity_detail = EntityViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})
entity_sync = EntityViewSet.as_view({"post": "sync"})
entity_commit = EntityViewSet.as_view({"post": "commit"})

urlpatterns = [
    path("", include(router.urls)),
    path("entities/<str:entity_type>/", entity_list, name="entity-list"),
    path("entities/<str:entity_type>/<int:pk>/", entity_detail, name="entity-detail"),
    path("entities/<str:entity_type>/sync/", entity_sync, name="entity-sync"),
    path("entities/<str:entity_type>/commit/", entity_commit, name="entity-commit"),
    path("entities/all/sync/", entity_sync, {"entity_type": "all"}, name="entity-sync-all"),
]
