"""REST API views"""
import copy
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CachedEntity, CachedProject, EntityDiff, EntityHistory, Snapshot, SyncState
from .serializers import (
    CachedEntitySerializer, CachedProjectSerializer, EntityDiffSerializer,
    EntityHistorySerializer, SnapshotSerializer, SyncStateSerializer,
)
from .sync import sync_all, sync_entity_type, commit_diffs_to_flowpt, _registered_project_ids


def _apply_diffs(entity_type: str, base_map: dict) -> list[dict]:
    """base_mapにEntityDiffを合成して返す"""
    result = copy.deepcopy(base_map)
    diffs = EntityDiff.objects.filter(
        entity_type=entity_type, snapshot__isnull=True
    ).order_by("created_at")
    for diff in diffs:
        if diff.action == "create":
            # 仮IDキーは "_new_{diff.id}"、_diff_id でcreate diffと識別できるようにする
            tmp_key = f"_new_{diff.id}"
            result[tmp_key] = {"id": tmp_key, "_diff_id": diff.id, **diff.patch}
        elif diff.action == "update":
            # 通常のflowpt_idキーへのupdate
            if diff.flowpt_id in result:
                result[diff.flowpt_id].update(diff.patch)
            # create diff上のエンティティへのupdate（_diff_idで照合）
            else:
                for key, val in result.items():
                    if isinstance(key, str) and key.startswith("_new_") and val.get("_diff_id") == diff.flowpt_id:
                        val.update(diff.patch)
                        break
        elif diff.action == "delete":
            if diff.flowpt_id in result:
                del result[diff.flowpt_id]
            else:
                # create diff上のエンティティの削除
                del_key = next(
                    (k for k, v in result.items()
                     if isinstance(k, str) and k.startswith("_new_") and v.get("_diff_id") == diff.flowpt_id),
                    None
                )
                if del_key:
                    del result[del_key]
    return list(result.values())


class EntityViewSet(viewsets.ViewSet):
    """
    汎用エンティティCRUD。
    ?direct=1 で差分を無視しFlowPTと直接授受。
    sync POST body: { "full": true } でフル取得。
    """

    def list(self, request, entity_type=None):
        direct = request.query_params.get("direct") == "1"
        if direct:
            from .sync import get_sg_client, _load_config
            cfg = _load_config()
            ec = cfg["entities"].get(entity_type, {})
            sg = get_sg_client()
            sg_type = ec.get("type", entity_type)
            data = sg.find(sg_type, ec.get("filters", []), ec.get("fields", ["id"]))
            return Response(data)

        if entity_type == "Project":
            base = {e.flowpt_id: e.data for e in CachedProject.objects.all()}
        else:
            qs = CachedEntity.objects.filter(entity_type=entity_type)
            # ?project_id=<int> でProjectを絞り込む
            project_id = request.query_params.get("project_id")
            if project_id is not None:
                try:
                    qs = qs.filter(project__flowpt_id=int(project_id))
                except (ValueError, TypeError):
                    return Response({"error": "project_id must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
            base = {e.flowpt_id: e.data for e in qs}
        return Response(_apply_diffs(entity_type, base))

    def retrieve(self, request, entity_type=None, pk=None):
        if entity_type == "Project":
            try:
                cached = CachedProject.objects.get(flowpt_id=pk)
            except CachedProject.DoesNotExist:
                return Response(status=status.HTTP_404_NOT_FOUND)
        else:
            try:
                cached = CachedEntity.objects.get(entity_type=entity_type, flowpt_id=pk)
            except CachedEntity.DoesNotExist:
                return Response(status=status.HTTP_404_NOT_FOUND)

        data = copy.deepcopy(cached.data)
        for diff in EntityDiff.objects.filter(
            entity_type=entity_type, flowpt_id=pk, snapshot__isnull=True
        ).order_by("created_at"):
            if diff.action == "update":
                data.update(diff.patch)
            elif diff.action == "delete":
                return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    def create(self, request, entity_type=None):
        diff = EntityDiff.objects.create(
            entity_type=entity_type,
            flowpt_id=None,
            patch=request.data,
            action="create",
        )
        return Response(EntityDiffSerializer(diff).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, entity_type=None, pk=None):
        # pk が int の場合は通常の update diff
        # URL /_new_<int>/ から来た場合は pk が int で渡されるが
        # request.resolver_match.url_name で temp ルートか判定する
        is_temp_route = (
            request.resolver_match.url_name == "entity-temp-detail"
            if hasattr(request, "resolver_match") and request.resolver_match
            else False
        )
        if is_temp_route:
            # _new_<pk> 形式として処理
            temp_id = f"_new_{pk}"
            try:
                orig_diff = EntityDiff.objects.get(id=pk, action="create", entity_type=entity_type)
                merged_patch = {**orig_diff.patch, **request.data}
                orig_diff.patch = merged_patch
                orig_diff.save(update_fields=["patch"])
                return Response(EntityDiffSerializer(orig_diff).data)
            except (EntityDiff.DoesNotExist, ValueError):
                return Response({"error": "create diff not found"}, status=status.HTTP_404_NOT_FOUND)

        pk_str = str(pk)
        if pk_str.startswith("_new_"):
            try:
                diff_id = int(pk_str[len("_new_"):])
                orig_diff = EntityDiff.objects.get(id=diff_id, action="create", entity_type=entity_type)
                merged_patch = {**orig_diff.patch, **request.data}
                orig_diff.patch = merged_patch
                orig_diff.save(update_fields=["patch"])
                return Response(EntityDiffSerializer(orig_diff).data)
            except (EntityDiff.DoesNotExist, ValueError):
                return Response({"error": "create diff not found"}, status=status.HTTP_404_NOT_FOUND)

        diff = EntityDiff.objects.create(
            entity_type=entity_type,
            flowpt_id=int(pk),
            patch=request.data,
            action="update",
        )
        return Response(EntityDiffSerializer(diff).data)

    def destroy(self, request, entity_type=None, pk=None):
        is_temp_route = (
            request.resolver_match.url_name == "entity-temp-detail"
            if hasattr(request, "resolver_match") and request.resolver_match
            else False
        )
        if is_temp_route:
            # _new_<pk> として EntityDiff レコードを削除
            try:
                EntityDiff.objects.filter(id=pk, action="create", entity_type=entity_type).delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except ValueError:
                return Response({"error": "invalid id"}, status=status.HTTP_400_BAD_REQUEST)

        pk_str = str(pk)
        if pk_str.startswith("_new_"):
            try:
                diff_id = int(pk_str[len("_new_"):])
                EntityDiff.objects.filter(id=diff_id, action="create", entity_type=entity_type).delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except ValueError:
                return Response({"error": "invalid id"}, status=status.HTTP_400_BAD_REQUEST)

        EntityDiff.objects.create(
            entity_type=entity_type,
            flowpt_id=int(pk),
            patch={},
            action="delete",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request, entity_type=None):
        full = bool(request.data.get("full", False))
        project_ids: list[int] | None = request.data.get("project_ids") if "project_ids" in request.data else _registered_project_ids()
        if entity_type and entity_type != "all":
            result = sync_entity_type(entity_type, full=full, project_ids=project_ids)
        else:
            result = sync_all(full=full, project_ids=project_ids)
        return Response(result)

    @action(detail=False, methods=["post"], url_path="commit")
    def commit(self, request, entity_type=None):
        diff_ids = request.data.get("diff_ids")
        commit_diffs_to_flowpt(diff_ids)
        return Response({"status": "committed"})


class EntityHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EntityHistorySerializer

    def get_queryset(self):
        qs = EntityHistory.objects.all()
        et = self.request.query_params.get("entity_type")
        fid = self.request.query_params.get("flowpt_id")
        if et:
            qs = qs.filter(entity_type=et)
        if fid:
            qs = qs.filter(flowpt_id=fid)
        return qs


class SnapshotViewSet(viewsets.ModelViewSet):
    queryset = Snapshot.objects.all()
    serializer_class = SnapshotSerializer

    @action(detail=True, methods=["post"], url_path="capture")
    def capture(self, request, pk=None):
        snapshot = self.get_object()
        EntityDiff.objects.filter(snapshot__isnull=True).update(snapshot=snapshot)
        return Response({"status": "captured"})


class SyncStateViewSet(viewsets.ReadOnlyModelViewSet):
    """各エンティティタイプの最終同期日時を参照するエンドポイント"""
    queryset = SyncState.objects.all()
    serializer_class = SyncStateSerializer
    lookup_field = "entity_type"
