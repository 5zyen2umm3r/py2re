"""
管理コマンド: python manage.py sync_sg

使用例:
  python manage.py sync_sg                        # 差分同期（全Project）
  python manage.py sync_sg --full                 # フル同期（全Project）
  python manage.py sync_sg --project-ids 123 456  # 指定Projectのみ差分同期
  python manage.py sync_sg --project-ids 123 --full  # 指定Projectのみフル同期
  python manage.py sync_sg --entity-type Asset    # 特定エンティティのみ
"""
from django.core.management.base import BaseCommand
from flowpt_cache.sync import sync_all, sync_entity_type


class Command(BaseCommand):
    help = "FlowPTからエンティティを同期する"

    def add_arguments(self, parser):
        parser.add_argument(
            "--full",
            action="store_true",
            default=False,
            help="フル取得（削除検出あり）。省略時は前回同期以降の差分のみ取得。",
        )
        parser.add_argument(
            "--project-ids",
            nargs="+",
            type=int,
            metavar="ID",
            default=None,
            help="同期対象のProject IDを指定（複数可）。省略時は登録済み全Project。",
        )
        parser.add_argument(
            "--entity-type",
            type=str,
            default=None,
            metavar="TYPE",
            help="同期するエンティティタイプを1つ指定（例: Asset）。省略時は全タイプ。",
        )

    def handle(self, *args, **options):
        full: bool = options["full"]
        project_ids: list[int] | None = options["project_ids"]
        entity_type: str | None = options["entity_type"]

        mode = "full" if full else "incremental"
        scope = f"project_ids={project_ids}" if project_ids else "all projects"
        self.stdout.write(f"Sync start: mode={mode}, scope={scope}, entity={entity_type or 'all'}")

        if entity_type:
            result = sync_entity_type(entity_type, full=full, project_ids=project_ids)
            self._print_result(entity_type, result)
        else:
            results = sync_all(full=full, project_ids=project_ids)
            for et, result in results.items():
                self._print_result(et, result)

        self.stdout.write(self.style.SUCCESS("Sync complete."))

    def _print_result(self, entity_type: str, result: dict):
        if result.get("skipped", False):
            self.stdout.write(
                f"  {entity_type}: created={result['created']}, "
                f"updated={result['updated']}, deleted={result['deleted']} "
                f"({result.get('mode', '-')})"
            )
        else:
            self.stdout.write(
                f"  {entity_type}: reason={result['reason']}, "
            )

