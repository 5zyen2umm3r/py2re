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


FRONTEND_BUILD = Path(__file__).parents[4] / "frontend" / "dist" / "index.html"


class DjangoChannel:
    """QtWebChannel経由でReactから呼ばれるブリッジオブジェクト"""

    def __init__(self):
        from PySide6.QtCore import QObject, Slot
        # 動的にQObjectを継承したクラスを生成
        class _Bridge(QObject):
            def __init__(self_inner):
                super().__init__()
                self_inner._factory = RequestFactory()

            @Slot(str, str, str, str, result=str)
            def fetch(self_inner, method: str, path: str, body: str, headers: str) -> str:
                import json
                from django.urls import resolve
                from django.test import RequestFactory as RF
                factory = RF()
                req_method = getattr(factory, method.lower())
                content_type = "application/json"
                request = req_method(path, data=body, content_type=content_type)
                try:
                    match = resolve(path)
                    response = match.func(request, *match.args, **match.kwargs)
                    #response.accepted_renderer = None
                    response.accepted_media_type = "application/json"
                    response.renderer_context = {}
                    response.render()
                    return response.content.decode()
                except Exception as e:
                    traceback.print_exc()
                    return json.dumps({"error": str(e)})

        self.bridge = _Bridge()


class Command(BaseCommand):
    help = "Launch React UI in PySide6 QWebEngineView"

    def handle(self, *args, **options):
        from PySide6.QtWidgets import QApplication
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebEngineCore import QWebEngineScript
        from PySide6.QtWebChannel import QWebChannel
        from PySide6.QtCore import QUrl, QFile, QIODevice

        app = QApplication(sys.argv)

        view = QWebEngineView()
        channel = QWebChannel()
        bridge = DjangoChannel()
        channel.registerObject("django", bridge.bridge)
        view.page().setWebChannel(channel)

        # Qt内蔵のqwebchannel.jsをページ読み込み前にインジェクト
        qwc_file = QFile(":/qtwebchannel/qwebchannel.js")
        if qwc_file.open(QIODevice.OpenModeFlag.ReadOnly):
            qwc_js = bytes(qwc_file.readAll()).decode()
            qwc_file.close()
            script = QWebEngineScript()
            script.setName("qwebchannel")
            script.setSourceCode(qwc_js)
            script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
            script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
            view.page().scripts().insert(script)
        else:
            self.stderr.write("Warning: could not load qrc:///qtwebchannel/qwebchannel.js")

        if FRONTEND_BUILD.exists():
            view.load(QUrl.fromLocalFile(str(FRONTEND_BUILD)))
        else:
            self.stderr.write(f"Frontend build not found: {FRONTEND_BUILD}")
            self.stderr.write("Run: cd frontend && npm run build")
            view.setHtml("<h2>Frontend not built. Run: cd frontend &amp;&amp; npm run build</h2>")

        view.setWindowTitle("FlowPT Cache UI")
        view.resize(1400, 900)
        view.show()
        sys.exit(app.exec())
