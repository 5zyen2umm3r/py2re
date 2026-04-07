"""REST API views"""
import copy
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CachedEntity, EntityDiff, EntityHistory, Snapshot
from .serializers import (
    CachedEntitySerializer, EntityDiffSerializer,
    EntityHistorySerializer, SnapshotSerializer,
)
from .sync import sync_all, sync_entity_type, commit_diffs_to_flowpt


def _apply_diffs(entity_type: str, base_map: dict[int, dict]) -> list[dict]:
    """base_mapにEntityDiffを合成して返す"""
    result = copy.deepcopy(base_map)
    diffs = EntityDiff.objects.filter(entity_type=entity_type, snapshot__isnull=True).order_by("created_at")
    for diff in diffs:
        if diff.action == "create":
            tmp_id = f"_new_{diff.id}"
            result[tmp_id] = {"_diff_id": diff.id, **diff.patch}
        elif diff.action == "update" and diff.flowpt_id in result:
            result[diff.flowpt_id].update(diff.patch)
        elif diff.action == "delete" and diff.flowpt_id in result:
            del result[diff.flowpt_id]
    return list(result.values())


class EntityViewSet(viewsets.ViewSet):
    """
    汎用エンティティCRUD。
    ?direct=1 で差分を無視しFlowPTと直接授受。
    """

    def list(self, request, entity_type=None):
        direct = request.query_params.get("direct") == "1"
        if direct:
            from .sync import get_sg_client
            from .sync import _load_config
            cfg = _load_config()
            ec = cfg["entities"].get(entity_type, {})
            sg = get_sg_client()
            sg_type = ec.get("type", entity_type)
            data = sg.find(sg_type, ec.get("filters", []), ec.get("fields", ["id"]))
            return Response(data)

        base = {e.flowpt_id: e.data for e in CachedEntity.objects.filter(entity_type=entity_type)}
        return Response(_apply_diffs(entity_type, base))

    def retrieve(self, request, entity_type=None, pk=None):
        try:
            cached = CachedEntity.objects.get(entity_type=entity_type, flowpt_id=pk)
        except CachedEntity.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        data = copy.deepcopy(cached.data)
        # apply diffs for this record
        for diff in EntityDiff.objects.filter(entity_type=entity_type, flowpt_id=pk, snapshot__isnull=True).order_by("created_at"):
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
        diff = EntityDiff.objects.create(
            entity_type=entity_type,
            flowpt_id=int(pk),
            patch=request.data,
            action="update",
        )
        return Response(EntityDiffSerializer(diff).data)

    def destroy(self, request, entity_type=None, pk=None):
        diff = EntityDiff.objects.create(
            entity_type=entity_type,
            flowpt_id=int(pk),
            patch={},
            action="delete",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request, entity_type=None):
        if entity_type and entity_type != "all":
            result = sync_entity_type(entity_type)
        else:
            result = sync_all()
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
        """現在の未コミット差分をこのSnapshotに紐付ける"""
        snapshot = self.get_object()
        EntityDiff.objects.filter(snapshot__isnull=True).update(snapshot=snapshot)
        return Response({"status": "captured"})
