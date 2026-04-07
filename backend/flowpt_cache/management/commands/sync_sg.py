"""
管理コマンド: python manage.py launch_ui
ReactビルドをQWebEngineViewで表示し、QtWebChannelでDjango APIをブリッジする。
"""
import sys 
import os
import threading
from pathlib import Path
import traceback

from django.core.management.base import BaseCommand
from django.test import RequestFactory

from flowpt_cache.sync import sync_all

class Command(BaseCommand):
    help = "Launch React UI in PySide6 QWebEngineView"

    def handle(self, *args, **options):
        sync_all()
