"""FlowPT同期ロジック"""
import json
import os
from pathlib import Path
from typing import Any

import shotgun_api3

from .models import CachedEntity, EntityHistory

CONFIG_PATH = Path(__file__).parent / "config.json"


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_sg_client() -> shotgun_api3.Shotgun:
    from tank.authentication import ShotgunAuthenticator
    authentiactor = ShotgunAuthenticator()

    user = authentiactor.get_default_user()
    if user and user.are_creadentials_expired():
        authentiactor.clear_default_user()
        user = None
    if not user:
        from PySide6.QtWidgets import QApplication
        if not QApplication.instance():
            _ = QApplication([])
        user = authentiactor.get_user()
        return user.create_sg_connection()
    return shotgun_api3.Shotgun(
        os.environ["FLOWPT_URL"],
        script_name=os.environ["FLOWPT_SCRIPT"],
        api_key=os.environ["FLOWPT_KEY"],
    )


def _prune_history(entity_type: str, flowpt_id: int, max_gen: int):
    from .models import EntityHistory
    qs = EntityHistory.objects.filter(entity_type=entity_type, flowpt_id=flowpt_id).order_by("-generation")
    ids_to_delete = list(qs.values_list("id", flat=True)[max_gen:])
    if ids_to_delete:
        EntityHistory.objects.filter(id__in=ids_to_delete).delete()


def sync_entity_type(entity_type: str, sg: shotgun_api3.Shotgun | None = None) -> dict:
    """指定エンティティタイプをFlowPTから同期し、差分履歴を記録する"""
    config = _load_config()
    max_gen: int = config.get("generations", 10)
    entity_cfg = config["entities"].get(entity_type)
    if entity_cfg is None:
        raise ValueError(f"Unknown entity type: {entity_type}")

    if sg is None:
        sg = get_sg_client()

    sg_type = entity_cfg.get("type", entity_type)
    remote_entities: list[dict] = sg.find(
        sg_type,
        entity_cfg.get("filters", []),
        entity_cfg.get("fields", ["id"]),
    )

    remote_map: dict[int, dict] = {e["id"]: e for e in remote_entities}
    local_map: dict[int, CachedEntity] = {
        e.flowpt_id: e
        for e in CachedEntity.objects.filter(entity_type=entity_type)
    }

    stats = {"created": 0, "updated": 0, "deleted": 0}

    # upsert
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

    # delete
    for fid, local in local_map.items():
        if fid not in remote_map:
            _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
            local.delete()
            stats["deleted"] += 1

    return stats


def _record_history(entity_type, flowpt_id, before, after, action, max_gen):
    from .models import EntityHistory
    last = EntityHistory.objects.filter(entity_type=entity_type, flowpt_id=flowpt_id).order_by("-generation").first()
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


def sync_all(sg: shotgun_api3.Shotgun | None = None) -> dict:
    config = _load_config()
    if sg is None:
        sg = get_sg_client()
    results = {}
    for entity_type in config["entities"]:
        results[entity_type] = sync_entity_type(entity_type, sg)
    return results


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
