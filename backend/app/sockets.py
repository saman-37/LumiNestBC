"""Socket.IO server. Owner: Backend (Person 2).

One event goes to every connected client:
    shelter_update -> the public shelter object (same shape as an item of GET /api/shelters)
Always emit AFTER the database transaction has committed.
"""
from flask_socketio import SocketIO

from .availability import public_shelter

socketio = SocketIO()


def emit_shelter_update(shelter_row: dict) -> None:
    socketio.emit("shelter_update", public_shelter(shelter_row))
