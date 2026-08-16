"""기능별 API 묶음.

각 모듈은 `register(app)` 하나만 밖으로 내보내고, 그 안에서 자기 라우트를 등록한다.
server.py 는 여기 있는 모듈들을 차례로 register 하기만 하면 된다.
"""
from . import (audio, board, characters, groups, frames, imagegen, lyrics, meshes, music,
               presets, projects, scenes, sheet, studio, tags, three_d, videos)

MODULES = [audio, board, characters, groups, frames, imagegen, lyrics, meshes, music,
           presets, projects, scenes, sheet, studio, tags, three_d, videos]


def register_all(app):
    for m in MODULES:
        m.register(app)
