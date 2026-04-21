"""FlowPT同期ロジック"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import shotgun_api3
from django.db import transaction
from django.conf import settings

from .models import CachedEntity, CachedProject, EntityHistory, SyncState

CONFIG_PATH = settings.FLOWPT_CONFIG_PATH

def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---- datetime 変換ヘルパー ----

def _serialize_datetime_fields(data: dict, datetime_fields: list[str]) -> dict:
    """
    SG から取得したデータ内の datetime オブジェクトを ISO 8601 文字列に変換する。
    JSON（Django の JSONField）に格納できるようにするために使用する。
    """
    if not datetime_fields:
        return data
    result = dict(data)
    for field in datetime_fields:
        val = result.get(field)
        if isinstance(val, datetime):
            result[field] = val.isoformat()
    return result


def _deserialize_datetime_fields(data: dict, datetime_fields: list[str]) -> dict:
    """
    DB から取得したデータ内の ISO 8601 文字列を datetime オブジェクトに変換する。
    SG へのコミット（update/create）時に使用する。
    """
    if not datetime_fields:
        return data
    result = dict(data)
    for field in datetime_fields:
        val = result.get(field)
        if isinstance(val, str):
            try:
                result[field] = datetime.fromisoformat(val)
            except ValueError:
                pass  # 変換できない場合はそのまま
    return result


def _get_datetime_fields(entity_type: str, config: dict) -> list[str]:
    """config から指定エンティティの datetime_fields を取得する。"""
    return config.get("entities", {}).get(entity_type, {}).get("datetime_fields", [])


def get_sg_client() -> shotgun_api3.Shotgun:
    try:
        script_name=os.environ.get("FLOWPT_SCRIPT")
        
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


# ---- Project FK解決 ----

def _resolve_project(entity_cfg: dict, data: dict) -> "CachedProject | None":
    """
    data から project_filter_field を参照し、対応する CachedProject を返す。
    HumanUser のように project_filter_field がリスト型の場合は先頭を使用する。
    """
    project_field = entity_cfg.get("project_filter_field")
    if not project_field:
        return None
    ref = data.get(project_field)
    # リスト型（例: HumanUser.projects）は先頭要素を使用
    if isinstance(ref, list):
        ref = ref[0] if ref else None
    if isinstance(ref, dict):
        pid = ref.get("id")
        if pid:
            return CachedProject.objects.filter(flowpt_id=pid).first()
    return None

def _registered_project_ids() -> list[int]:
    """キャッシュ済みProjectのIDリストを返す"""
    return list(CachedProject.objects.values_list("flowpt_id", flat=True))


def _build_filters(
    entity_cfg: dict,
    last_synced: datetime | None,
    full: bool,
    project_ids: list[int] | None = None,
) -> list:
    """
    config の filters に以下を追加して返す:
    - project_filter_field が定義されていれば、対象Projectへの絞り込み
      project_ids 指定時はその値を、未指定時は登録済み全Projectを使用
    - full=False かつ last_synced があれば updated_at フィルタ
    """
    filters = list(entity_cfg.get("filters", []))

    project_field = entity_cfg.get("project_filter_field")
    if project_field:
        pids = project_ids if project_ids is not None else _registered_project_ids()
        if pids:
            filters.append(
                [project_field, "in", [{"type": "Project", "id": pid} for pid in pids]]
            )
        else:
            filters.append(["id", "is", -1])

    if not full and last_synced is not None:
        filters.append(["updated_at", "greater_than", last_synced])

    return filters


# ---- Project専用同期 ----

def sync_projects(sg: shotgun_api3.Shotgun, full: bool = False, project_ids: list[int] | None = None) -> dict:
    """
    Projectエンティティを専用テーブル(CachedProject)に同期する。
    project_ids 指定時はそのIDのProjectのみ取得・更新する。
    """
    config = _load_config()
    max_gen: int = config.get("generations", 10)
    entity_cfg = config["entities"]["Project"]
    entity_type = "Project"
    datetime_fields = _get_datetime_fields(entity_type, config)

    last_synced = _get_last_synced(entity_type)
    sync_start = datetime.now(timezone.utc)

    filters = list(entity_cfg.get("filters", []))
    if project_ids is not None:
        filters.append(["id", "in", project_ids])
    if not full and last_synced is not None:
        filters.append(["updated_at", "greater_than", last_synced])

    remote_entities: list[dict] = sg.find(
        "Project", filters, entity_cfg.get("fields", ["id"])
    )
    remote_map: dict[int, dict] = {
        e["id"]: _serialize_datetime_fields(e, datetime_fields)
        for e in remote_entities
    }
    stats = {"created": 0, "updated": 0, "deleted": 0, "mode": "full" if full else "incremental"}

    # ---- 削除検出 ----
    # full=True: ローカルに存在してremoteに存在しないものを削除
    # full=False: retired_only=True で updated_at > last_synced なものを取得して削除
    if full:
        local_qs = CachedProject.objects.all()
        if project_ids is not None:
            local_qs = local_qs.filter(flowpt_id__in=project_ids)
        local_ids = set(local_qs.values_list("flowpt_id", flat=True))

        # retired エンティティも取得してローカルから削除
        retired_filters = list(entity_cfg.get("filters", []))
        if project_ids is not None:
            retired_filters.append(["id", "in", project_ids])
        try:
            retired_ids = {
                e["id"] for e in sg.find("Project", retired_filters, ["id"], retired_only=True)
            }
        except Exception:
            retired_ids = set()

        for fid in local_ids - set(remote_map.keys()):
            local = CachedProject.objects.get(flowpt_id=fid)
            _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
            local.delete()
            stats["deleted"] += 1

        # retired エンティティがローカルに残っている場合も削除
        for fid in retired_ids:
            if fid not in local_ids:
                continue
            if fid in remote_map:
                continue  # 通常取得にも含まれている場合はスキップ
            try:
                local = CachedProject.objects.get(flowpt_id=fid)
                _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
                local.delete()
                stats["deleted"] += 1
            except CachedProject.DoesNotExist:
                pass
    else:
        # インクリメンタル: updated_at > last_synced な retired エンティティを削除
        if last_synced is not None:
            retired_filters = list(entity_cfg.get("filters", []))
            if project_ids is not None:
                retired_filters.append(["id", "in", project_ids])
            retired_filters.append(["updated_at", "greater_than", last_synced])
            retired_remote = sg.find("Project", retired_filters, ["id"], retired_only=True)
            for e in retired_remote:
                fid = e["id"]
                try:
                    local = CachedProject.objects.get(flowpt_id=fid)
                    _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
                    local.delete()
                    stats["deleted"] += 1
                except CachedProject.DoesNotExist:
                    pass

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

def sync_entity_type(
    entity_type: str,
    sg: shotgun_api3.Shotgun | None = None,
    full: bool = False,
    project_ids: list[int] | None = None,
) -> dict:
    """
    指定エンティティタイプをFlowPTから同期する。
    full=False（デフォルト）: 前回同期以降の updated_at 差分のみ取得。
    full=True: フル取得（削除検出も行う）。
    project_ids: 対象Projectを絞り込む。None の場合は登録済み全Project。
    Project は専用テーブルに同期する（project_ids は Project自体のIDフィルタとして使用）。
    config の "sync": false が設定されたエンティティはスキップする。
    """
    if sg is None:
        sg = get_sg_client()

    if entity_type == "Project":
        return sync_projects(sg, full=full, project_ids=project_ids)

    config = _load_config()
    max_gen: int = config.get("generations", 10)
    entity_cfg = config["entities"].get(entity_type)
    if entity_cfg is None:
        raise ValueError(f"Unknown entity type: {entity_type}")

    # sync: false が設定されている場合はスキップ
    if entity_cfg.get("sync", True) is False:
        return {"skipped": True, "reason": "sync disabled in config"}

    fields = entity_cfg.get("fields", ["id"])
    last_synced = _get_last_synced(entity_type)
    sync_start = datetime.now(timezone.utc)
    datetime_fields = _get_datetime_fields(entity_type, config)

    sg_type = entity_cfg.get("type", entity_type)
    filters = _build_filters(entity_cfg, last_synced, full, project_ids)

    remote_entities: list[dict] = sg.find(sg_type, filters, fields)
    remote_map: dict[int, dict] = {
        e["id"]: _serialize_datetime_fields(e, datetime_fields)
        for e in remote_entities
    }

    # 削除検出のローカルスコープ: project_ids 指定時はそのProject配下のみ対象
    if project_ids is not None and "project" in fields:
        pids_set = set(project_ids)
        local_qs = CachedEntity.objects.filter(entity_type=entity_type)
        local_map: dict[int, CachedEntity] = {
            e.flowpt_id: e for e in local_qs
            if isinstance(e.data.get(project_field), dict)
            and e.data[project_field].get("id") in pids_set
        }
    else:
        local_map = {
            e.flowpt_id: e
            for e in CachedEntity.objects.filter(entity_type=entity_type)
        }

    stats = {"created": 0, "updated": 0, "deleted": 0, "mode": "full" if full else "incremental"}

    # ---- インクリメンタル削除検出 ----
    # full=False の場合でも、updated_at > last_synced な retired エンティティを削除する
    if not full and last_synced is not None:
        retired_filters = _build_filters(entity_cfg, last_synced, False, project_ids)
        try:
            retired_remote = sg.find(sg_type, retired_filters, ["id"], retired_only=True)
            for e in retired_remote:
                fid = e["id"]
                if fid in local_map:
                    local = local_map[fid]
                    _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
                    local.delete()
                    stats["deleted"] += 1
                    del local_map[fid]
        except Exception:
            pass  # retired_only 非対応の場合は無視

    for fid, remote_data in remote_map.items():
        project_obj = _resolve_project(entity_cfg, remote_data)
        if fid in local_map:
            local = local_map[fid]
            update_fields = []
            if local.data != remote_data:
                _record_history(entity_type, fid, local.data, remote_data, "updated", max_gen)
                local.data = remote_data
                update_fields.append("data")
                update_fields.append("synced_at")
            if local.project != project_obj:
                local.project = project_obj
                update_fields.append("project")
            if update_fields:
                local.save(update_fields=list(set(update_fields + ["synced_at"])))
                if "data" in update_fields:
                    stats["updated"] += 1
        else:
            _record_history(entity_type, fid, None, remote_data, "created", max_gen)
            CachedEntity.objects.create(
                entity_type=entity_type,
                flowpt_id=fid,
                data=remote_data,
                project=project_obj,
            )
            stats["created"] += 1

    # 削除検出はフル取得時のみ（retired エンティティも含む）
    if full:
        # retired_only=True で retired エンティティのIDも取得し、local_map に残っていれば削除
        try:
            retired_filters = _build_filters(entity_cfg, None, True, project_ids)
            retired_ids = {
                e["id"] for e in sg.find(sg_type, retired_filters, ["id"], retired_only=True)
            }
        except Exception:
            retired_ids = set()

        for fid, local in list(local_map.items()):
            if fid not in remote_map or fid in retired_ids:
                _record_history(entity_type, fid, local.data, None, "deleted", max_gen)
                local.delete()
                stats["deleted"] += 1

    _set_last_synced(entity_type, sync_start)
    return stats


def sync_all(
    sg: shotgun_api3.Shotgun | None = None,
    full: bool = False,
    project_ids: list[int] | None = None,
) -> dict:
    """
    全エンティティを同期する。
    Projectを先に同期し、他エンティティのproject絞り込みに使用する。
    full=True でフル取得（削除検出あり）。
    project_ids 指定時はそのProject配下のエンティティのみ同期する。
    """
    config = _load_config()
    if sg is None:
        sg = get_sg_client()

    results: dict = {}
    results["Project"] = sync_projects(sg, full=full, project_ids=project_ids)

    for entity_type in config["entities"]:
        if entity_type == "Project":
            continue
        # sync: false が設定されているエンティティはスキップ
        if config["entities"][entity_type].get("sync", True) is False:
            results[entity_type] = {"skipped": True, "reason": "sync disabled in config"}
            continue
        results[entity_type] = sync_entity_type(entity_type, sg, full=full, project_ids=project_ids)

    return results


# ---- FlowPTへのコミット ----

def _has_unresolved_temp_refs(patch: dict, temp_id_map: dict[str, int]) -> bool:
    """patch 内に未解決の仮ID参照が残っているか確認する"""
    for val in patch.values():
        if isinstance(val, dict) and "id" in val:
            ref_id = val["id"]
            if isinstance(ref_id, str) and ref_id.startswith("_new_") and ref_id not in temp_id_map:
                return True
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, dict) and "id" in item:
                    ref_id = item["id"]
                    if isinstance(ref_id, str) and ref_id.startswith("_new_") and ref_id not in temp_id_map:
                        return True
    return False


def _process_create_diffs_with_deps(
    create_diffs: list,
    temp_id_map: dict[str, int],
    sg,
    config: dict,
) -> None:
    """
    create diff を依存関係を考慮して処理する。
    未解決の仮ID参照を持つ diff は保留し、解決可能になったものから順に処理する。
    保留リストが減らなくなった場合は循環依存として例外を発生させる。
    """
    pending = list(create_diffs)

    while pending:
        prev_count = len(pending)
        next_pending = []

        for diff in pending:
            if _has_unresolved_temp_refs(diff.patch, temp_id_map):
                # まだ未解決の仮ID参照がある → 保留
                next_pending.append(diff)
                continue

            # 解決可能 → 処理する（select_for_update で二重処理を防ぐ）
            from .models import EntityDiff as _EntityDiff
            with transaction.atomic():
                try:
                    locked_diff = _EntityDiff.objects.select_for_update().get(
                        id=diff.id, action="create"
                    )
                except _EntityDiff.DoesNotExist:
                    # 既に別プロセスで処理済み → スキップ
                    continue

            entity_cfg = config["entities"].get(diff.entity_type, {})
            sg_type = entity_cfg.get("type", diff.entity_type)
            datetime_fields = _get_datetime_fields(diff.entity_type, config)

            clean_patch = _resolve_temp_refs(diff.patch, temp_id_map)
            clean_patch = {
                k: v for k, v in clean_patch.items()
                if k not in ("id", "_diff_id", "type")
            }
            clean_patch = _deserialize_datetime_fields(clean_patch, datetime_fields)

            result = sg.create(sg_type, clean_patch)
            actual_id = result.get("id")

            if actual_id is not None:
                temp_key = f"_new_{diff.id}"
                temp_id_map[temp_key] = actual_id

                # ローカルキャッシュにも登録
                from .models import CachedEntity, CachedProject
                result_data = {**clean_patch, "id": actual_id, "type": diff.entity_type}
                if diff.entity_type == "Project":
                    CachedProject.objects.get_or_create(
                        flowpt_id=actual_id,
                        defaults={"data": result_data},
                    )
                else:
                    project_obj = _resolve_project(
                        config["entities"].get(diff.entity_type, {}), result_data
                    )
                    CachedEntity.objects.get_or_create(
                        entity_type=diff.entity_type,
                        flowpt_id=actual_id,
                        defaults={"data": result_data, "project": project_obj},
                    )

            diff.delete()

        if len(next_pending) == prev_count:
            # 1件も減らなかった → 循環依存または解決不能な仮ID参照
            unresolved_ids = [
                f"_new_{d.id} ({d.entity_type})" for d in next_pending
            ]
            raise ValueError(
                f"循環依存または解決不能な仮ID参照が検出されました: {', '.join(unresolved_ids)}"
            )

        pending = next_pending


def _resolve_temp_refs(patch: dict, temp_id_map: dict[str, int]) -> dict:
    """patch 内の仮ID参照（"_new_xxx" 形式）を実際の FlowPT ID に置き換える。"""
    resolved = {}
    for key, val in patch.items():
        if isinstance(val, dict) and "id" in val:
            ref_id = val["id"]
            if isinstance(ref_id, str) and ref_id in temp_id_map:
                resolved[key] = {**val, "id": temp_id_map[ref_id]}
            else:
                resolved[key] = val
        elif isinstance(val, list):
            new_list = []
            for item in val:
                if isinstance(item, dict) and "id" in item:
                    ref_id = item["id"]
                    if isinstance(ref_id, str) and ref_id in temp_id_map:
                        new_list.append({**item, "id": temp_id_map[ref_id]})
                    else:
                        new_list.append(item)
                else:
                    new_list.append(item)
            resolved[key] = new_list
        else:
            resolved[key] = val
    return resolved


def commit_diffs_to_flowpt(diff_ids: list[int] | None = None):
    """
    蓄積した差分をFlowPT本体に反映する。

    create diff は依存関係を考慮して処理し（_process_create_diffs_with_deps）、
    update/delete diff は create 完了後に処理する。
    patch 内の仮ID参照は実際の FlowPT ID に置き換えてから送信する。
    """
    from .models import EntityDiff
    sg = get_sg_client()
    config = _load_config()

    qs = EntityDiff.objects.filter(snapshot__isnull=True)
    if diff_ids:
        qs = qs.filter(id__in=diff_ids)

    # 仮ID → 実際の FlowPT ID のマッピング
    temp_id_map: dict[str, int] = {}

    all_diffs = list(qs.order_by("created_at"))

    # sync: false のエンティティは commit もスキップする
    no_sync_types = {
        et for et, cfg in config["entities"].items()
        if cfg.get("sync", True) is False
    }
    if no_sync_types:
        all_diffs = [d for d in all_diffs if d.entity_type not in no_sync_types]

    create_diffs = [d for d in all_diffs if d.action == "create"]
    other_diffs  = [d for d in all_diffs if d.action != "create"]

    # --- Step 1: create diff を依存関係を考慮して処理 ---
    _process_create_diffs_with_deps(create_diffs, temp_id_map, sg, config)

    # --- Step 2: update / delete diff を処理 ---
    for diff in other_diffs:
        entity_cfg = config["entities"].get(diff.entity_type, {})
        sg_type = entity_cfg.get("type", diff.entity_type)
        datetime_fields = _get_datetime_fields(diff.entity_type, config)

        if diff.action == "update" and diff.flowpt_id:
            clean_patch = _resolve_temp_refs(diff.patch, temp_id_map)
            clean_patch = {
                k: v for k, v in clean_patch.items()
                if k not in ("id", "_diff_id", "type")
            }
            clean_patch = _deserialize_datetime_fields(clean_patch, datetime_fields)
            sg.update(sg_type, diff.flowpt_id, clean_patch)

        elif diff.action == "delete" and diff.flowpt_id:
            sg.delete(sg_type, diff.flowpt_id)

        diff.delete()
