"""FlowPT同期ロジック"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import shotgun_api3

from .models import CachedEntity, CachedProject, EntityHistory, SyncState

CONFIG_PATH = Path(__file__).parent / "config.json"


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_sg_client() -> shotgun_api3.Shotgun:
    try:
        script_name=os.environ.get("FLOWPT_SCRIPT"),
        if script_name:
            return shotgun_api3.Shotgun(
                os.environ["FLOWPT_URL"],
                script_name=script_name,
                api_key=os.environ["FLOWPT_KEY"],
            )
        from tank.authentication import ShotgunAuthenticator
        auth = ShotgunAuthenticator()
        user = auth.get_default_user()
        if user and user.are_credentials_expired():
            auth.clear_default_user()
            user = None
        if not user:
            from PySide6.QtWidgets import QApplication
            if not QApplication.instance():
                _ = QApplication([])
            user = auth.get_user()
        return user.create_sg_connection()
    except ImportError:
        pass


# ---- SyncState helpers ----

def _get_last_synced(entity_type: str) -> datetime | None:
    state = SyncState.objects.filter(entity_type=entity_type).first()
    return state.last_synced_at if state else None


def _set_last_synced(entity_type: str, dt: datetime):
    SyncState.objects.update_or_create(
        entity_type=entity_type,
        defaults={"last_synced_at": dt},
    )


# ---- History helpers ----

def _prune_history(entity_type: str, flowpt_id: int, max_gen: int):
    qs = EntityHistory.objects.filter(
        entity_type=entity_type, flowpt_id=flowpt_id
    ).order_by("-generation")
    ids_to_delete = list(qs.values_list("id", flat=True)[max_gen:])
    if ids_to_delete:
        EntityHistory.objects.filter(id__in=ids_to_delete).delete()


def _record_history(entity_type, flowpt_id, before, after, action, max_gen):
    last = EntityHistory.objects.filter(
        entity_type=entity_type, flowpt_id=flowpt_id
    ).order_by("-generation").first()
    gen = (last.generation + 1) if last else 1
    EntityHistory.objects.create(
        entity_type=entity_type,
        flowpt_id=flowpt_id,
        generation=gen,
        before=before,
        after=after,
        action=action,
    )
    _prune_history(entity_type, flowpt_id, max_gen)


# ---- Filter builders ----

def _registered_project_ids() -> list[int]:
    """キャッシュ済みProjectのIDリストを返す"""
    return list(CachedProject.objects.values_list("flowpt_id", flat=True))


def _build_filters(entity_cfg: dict, last_synced: datetime | None, full: bool) -> list:
    """
    config の filters に以下を追加して返す:
    - project_filter_field が定義されていれば、登録済みProjectへの絞り込み
    - full=False かつ last_synced があれば updated_at フィルタ
    """
    filters = list(entity_cfg.get("filters", []))

    project_field = entity_cfg.get("project_filter_field")
    if project_field:
        project_ids = _registered_project_ids()
        if project_ids:
            filters.append(
                [project_field, "in", [{"type": "Project", "id": pid} for pid in project_ids]]
            )
        else:
            # Projectが未登録の場合は何も取得しない
            filters.append(["id", "is", -1])

    if not full and last_synced is not None:
        filters.append(["updated_at", "greater_than", last_synced])

    return filters


# ---- Project専用同期 ----

def sync_projects(sg: shotgun_api3.Shotgun, full: bool = False) -> dict:
    """Projectエンティティを専用テーブル(CachedProject)に同期する"""
    config = _load_config()
    max_gen: int = config.get("generations", 10)
    entity_cfg = config["entities"]["Project"]
    entity_type = "Project"

    last_synced = _get_last_synced(entity_type)
    sync_start = datetime.now(timezone.utc)

    filters = list(entity_cfg.get("filters", []))
    if not full and last_synced is not None:
        filters.append(["updated_at", "greater_than", last_synced])

    remote_entities: list[dict] = sg.find(
        "Project", filters, entity_cfg.get("fields", ["id"])
    )
    remote_map: dict[int, dict] = {e["id"]: e for e in remote_entities}
    stats = {"created": 0, "updated": 0, "deleted": 0, "mode": "full" if full else "incremental"}

    if full:
        local_ids = set(CachedProject.objects.values_list("flowpt_id", flat=True))
        for fid in local_ids - set(remote_map.keys()):
            local = CachedProject.objects.get(flowpt_id=fid)
            _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
            local.delete()
            stats["deleted"] += 1

    for fid, remote_data in remote_map.items():
        obj, created = CachedProject.objects.get_or_create(
            flowpt_id=fid, defaults={"data": remote_data}
        )
        if created:
            _record_history(entity_type, fid, None, remote_data, "created", max_gen)
            stats["created"] += 1
        elif obj.data != remote_data:
            _record_history(entity_type, fid, obj.data, remote_data, "updated", max_gen)
            obj.data = remote_data
            obj.save(update_fields=["data", "synced_at"])
            stats["updated"] += 1

    _set_last_synced(entity_type, sync_start)
    return stats


# ---- 汎用エンティティ同期 ----

def sync_entity_type(entity_type: str, sg: shotgun_api3.Shotgun | None = None, full: bool = False) -> dict:
    """
    指定エンティティタイプをFlowPTから同期する。
    full=False（デフォルト）: 前回同期以降の updated_at 差分のみ取得。
    full=True: フル取得（削除検出も行う）。
    Project は専用テーブルに同期する。
    """
    if sg is None:
        sg = get_sg_client()

    if entity_type == "Project":
        return sync_projects(sg, full=full)

    config = _load_config()
    max_gen: int = config.get("generations", 10)
    entity_cfg = config["entities"].get(entity_type)
    if entity_cfg is None:
        raise ValueError(f"Unknown entity type: {entity_type}")

    last_synced = _get_last_synced(entity_type)
    sync_start = datetime.now(timezone.utc)

    sg_type = entity_cfg.get("type", entity_type)
    filters = _build_filters(entity_cfg, last_synced, full)

    remote_entities: list[dict] = sg.find(
        sg_type, filters, entity_cfg.get("fields", ["id"])
    )
    remote_map: dict[int, dict] = {e["id"]: e for e in remote_entities}
    local_map: dict[int, CachedEntity] = {
        e.flowpt_id: e
        for e in CachedEntity.objects.filter(entity_type=entity_type)
    }
    stats = {"created": 0, "updated": 0, "deleted": 0, "mode": "full" if full else "incremental"}

    for fid, remote_data in remote_map.items():
        if fid in local_map:
            local = local_map[fid]
            if local.data != remote_data:
                _record_history(entity_type, fid, local.data, remote_data, "updated", max_gen)
                local.data = remote_data
                local.save(update_fields=["data", "synced_at"])
                stats["updated"] += 1
        else:
            _record_history(entity_type, fid, None, remote_data, "created", max_gen)
            CachedEntity.objects.create(entity_type=entity_type, flowpt_id=fid, data=remote_data)
            stats["created"] += 1

    # 削除検出はフル取得時のみ
    if full:
        for fid, local in local_map.items():
            if fid not in remote_map:
                _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
                local.delete()
                stats["deleted"] += 1

    _set_last_synced(entity_type, sync_start)
    return stats


def sync_all(sg: shotgun_api3.Shotgun | None = None, full: bool = False) -> dict:
    """
    全エンティティを同期する。
    Projectを先に同期し、他エンティティのproject絞り込みに使用する。
    full=True でフル取得（削除検出あり）。
    """
    config = _load_config()
    if sg is None:
        sg = get_sg_client()

    results: dict = {}
    # Projectを最初に同期（他エンティティのフィルタ基準になるため）
    results["Project"] = sync_projects(sg, full=full)

    for entity_type in config["entities"]:
        if entity_type == "Project":
            continue
        results[entity_type] = sync_entity_type(entity_type, sg, full=full)

    return results


# ---- FlowPTへのコミット ----

def commit_diffs_to_flowpt(diff_ids: list[int] | None = None):
    """蓄積した差分をFlowPT本体に反映する"""
    from .models import EntityDiff
    sg = get_sg_client()
    config = _load_config()

    qs = EntityDiff.objects.filter(snapshot__isnull=True)
    if diff_ids:
        qs = qs.filter(id__in=diff_ids)

    for diff in qs.order_by("created_at"):
        entity_cfg = config["entities"].get(diff.entity_type, {})
        sg_type = entity_cfg.get("type", diff.entity_type)

        if diff.action == "create":
            sg.create(sg_type, diff.patch)
        elif diff.action == "update" and diff.flowpt_id:
            sg.update(sg_type, diff.flowpt_id, diff.patch)
        elif diff.action == "delete" and diff.flowpt_id:
            sg.delete(sg_type, diff.flowpt_id)

        diff.delete()
