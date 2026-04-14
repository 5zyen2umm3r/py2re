"""認証・セッション関連ビュー"""
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status


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
