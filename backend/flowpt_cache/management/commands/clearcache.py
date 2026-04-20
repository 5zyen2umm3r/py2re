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
from flowpt_cache.models import CachedEntity, CachedProject, EntityDiff, EntityHistory, SyncState


class Command(BaseCommand):
    help = "キャッシュのクリア"

    def handle(self, *args, **options):
        CachedEntity.objects.all().delete()
        EntityDiff.objects.all().delete()
        EntityHistory.objects.all().delete()
        SyncState.objects.all().delete()