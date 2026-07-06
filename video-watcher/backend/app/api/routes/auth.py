from fastapi import Depends

from app.api.schemas.responses import UserProfile
from app.dependencies import get_current_user


def register(app):
    @app.get("/auth/me", response_model=UserProfile)
    def me(user: dict = Depends(get_current_user)):
        return user
