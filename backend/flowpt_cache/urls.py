from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EntityViewSet, EntityHistoryViewSet, SnapshotViewSet, SyncStateViewSet
from .auth_views import session_view, login_view, logout_view, sg_login_view

router = DefaultRouter()
router.register(r"history", EntityHistoryViewSet, basename="history")
router.register(r"snapshots", SnapshotViewSet, basename="snapshot")
router.register(r"sync-state", SyncStateViewSet, basename="sync-state")

# 汎用エンティティルート: /api/entities/<entity_type>/
entity_list = EntityViewSet.as_view({"get": "list", "post": "create"})
entity_detail = EntityViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})
entity_temp_detail = EntityViewSet.as_view({"patch": "partial_update", "delete": "destroy"})
entity_sync = EntityViewSet.as_view({"post": "sync"})
entity_commit = EntityViewSet.as_view({"post": "commit"})

urlpatterns = [
    path("", include(router.urls)),
    # 認証・セッション
    path("auth/session/", session_view, name="auth-session"),
    path("auth/login/", login_view, name="auth-login"),
    path("auth/logout/", logout_view, name="auth-logout"),
    path("auth/sg-login/", sg_login_view, name="auth-sg-login"),
    # エンティティ
    path("entities/<str:entity_type>/", entity_list, name="entity-list"),
    path("entities/<str:entity_type>/<int:pk>/", entity_detail, name="entity-detail"),
    # 仮ID（_new_<int>）形式のエンティティ操作ルート
    path("entities/<str:entity_type>/_new_<int:pk>/", entity_temp_detail, name="entity-temp-detail"),
    path("entities/<str:entity_type>/sync/", entity_sync, name="entity-sync"),
    path("entities/<str:entity_type>/commit/", entity_commit, name="entity-commit"),
    path("entities/all/sync/", entity_sync, {"entity_type": "all"}, name="entity-sync-all"),
]
