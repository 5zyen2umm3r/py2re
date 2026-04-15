"""認証・セッション関連ビュー"""
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.sessions.backends.db import SessionStore
from django.middleware.csrf import get_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status


def _ensure_session(request):
    """
    request.session が存在しない場合（Qt UI など file:// 経由の起動時）に
    セッションを手動で初期化する。
    SessionMiddleware が正常に動作している環境では何もしない。
    """
    if not hasattr(request, "session") or request.session is None:
        request.session = SessionStore()
        request.session.create()


def _user_data(user) -> dict:
    """ログイン済みユーザーの情報を辞書で返す"""
    return {
        "id": user.pk,
        "username": user.username,
        "email": user.email,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "isStaff": user.is_staff,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def session_view(request):
    """
    現在のセッション情報を返す。
    - 未ログイン: { "isAuthenticated": false }
    - ログイン済み: { "isAuthenticated": true, "user": { ... } }
    """
    # CSRF トークンをクッキーにセット（フロントエンドが POST する前に必要）
    get_token(request)

    if request.user.is_authenticated:
        return Response({
            "isAuthenticated": True,
            "user": _user_data(request.user),
        })
    return Response({"isAuthenticated": False})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """
    ログインエンドポイント。
    Body: { "username": "...", "password": "..." }
    成功: 200 + セッション情報
    失敗: 401
    """
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")

    if not username or not password:
        return Response(
            {"error": "username と password は必須です"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"error": "ユーザー名またはパスワードが正しくありません"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    _ensure_session(request)
    login(request, user)
    return Response({
        "isAuthenticated": True,
        "user": _user_data(user),
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    """ログアウトエンドポイント"""
    logout(request)
    return Response({"isAuthenticated": False})


@api_view(["POST"])
@permission_classes([AllowAny])
def sg_login_view(request):
    """
    ShotGrid 認証によるログインエンドポイント。
    Body: {} （認証情報は get_sg_client() が環境変数 or tank から取得）

    処理フロー:
    1. get_sg_client() で SG 接続を確立
    2. sg.find_one("HumanUser") で現在の認証ユーザ情報を取得
    3. Django User を login フィールドで同定（存在しなければ生成）
    4. そのユーザでセッションを確立して返す
    """
    from .sync import get_sg_client

    try:
        sg = get_sg_client()
        if sg is None:
            return Response(
                {"error": "ShotGrid クライアントの取得に失敗しました"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # 現在の認証ユーザ情報を取得
        sg_user = sg.find_one(
            "HumanUser",
            [
                ["sg_status_list", "is", "act"],
                ["login", "is", sg._user._login]
            ],
            ["login", "name", "email", "firstname", "lastname"],
            #additional_filter_presets=[{"preset_name": "current_user"}],
        )

        if sg_user is None:
            return Response(
                {"error": "ShotGrid からユーザ情報を取得できませんでした"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        sg_login = sg_user.get("login") or ""
        if not sg_login:
            return Response(
                {"error": "ShotGrid ユーザの login フィールドが空です"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Django ユーザを同定または生成
        user, created = User.objects.get_or_create(
            username=sg_login,
            defaults={
                "email":      sg_user.get("email") or "",
                "first_name": sg_user.get("firstname") or "",
                "last_name":  sg_user.get("lastname") or "",
            },
        )

        if not created:
            # 既存ユーザの情報を最新の SG 情報で更新
            updated = False
            for attr, val in [
                ("email",      sg_user.get("email") or ""),
                ("first_name", sg_user.get("firstname") or ""),
                ("last_name",  sg_user.get("lastname") or ""),
            ]:
                if getattr(user, attr) != val:
                    setattr(user, attr, val)
                    updated = True
            if updated:
                user.save(update_fields=["email", "first_name", "last_name"])

        # パスワード認証を使わないためログイン時にバックエンドを明示
        user.backend = "django.contrib.auth.backends.ModelBackend"
        _ensure_session(request)
        login(request, user)

        return Response({
            "isAuthenticated": True,
            "user": _user_data(user),
        })

    except Exception as exc:
        return Response(
            {"error": f"ShotGrid 認証エラー: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
