"""
Google Drive backup integration — stdlib-only OAuth 2.0 loopback flow
(RFC 8252, "Desktop app" client type) and a Drive v3 multipart upload.
No google-auth / google-api-python-client — GuardPay stays dependency-free.

One-time setup the user does in Google Cloud Console (there's no way around
this — Google requires every app to have its own registered OAuth client):
  1. console.cloud.google.com -> create a project (no billing/credit card needed)
  2. APIs & Services -> Library -> enable "Google Drive API"
  3. APIs & Services -> OAuth consent screen -> External -> add yourself as a test user
  4. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
     -> Application type: "Desktop app"
  5. Copy the Client ID + Client Secret into Settings > Integrations in GuardPay

GuardPay's own server (already running on localhost) acts as the OAuth
redirect target — no separate listener needed. Tokens are stored in the
local `integrations` table only; nothing leaves the machine except the
direct calls to Google's own endpoints below.
"""
import json
import mimetypes
import os
import time
import urllib.parse
import urllib.request

from .database import get_db

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
SCOPE = "https://www.googleapis.com/auth/drive.file"
FOLDER_NAME = "GuardPay Backups"


def _get(key):
    conn = get_db()
    try:
        row = conn.execute("SELECT value FROM integrations WHERE key=?", (key,)).fetchone()
        return row['value'] if row else None
    finally:
        conn.close()


def _set(key, value):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO integrations (key, value, updated_at) VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, value)
        )
        conn.commit()
    finally:
        conn.close()


def status():
    return {
        "configured": bool(_get('gdrive_client_id') and _get('gdrive_client_secret')),
        "connected": bool(_get('gdrive_refresh_token')),
        "last_backup_at": _get('gdrive_last_backup_at'),
    }


def save_client(client_id, client_secret):
    client_id = (client_id or '').strip()
    client_secret = (client_secret or '').strip()
    if not client_id or not client_secret:
        raise ValueError("Client ID and Client Secret are both required")
    _set('gdrive_client_id', client_id)
    _set('gdrive_client_secret', client_secret)


def disconnect():
    conn = get_db()
    try:
        conn.execute("DELETE FROM integrations WHERE key LIKE 'gdrive_%'")
        conn.commit()
    finally:
        conn.close()


def build_auth_url(redirect_uri):
    client_id = _get('gdrive_client_id')
    if not client_id:
        raise ValueError("Save a Client ID and Client Secret first")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    }
    return AUTH_URL + "?" + urllib.parse.urlencode(params)


def _post_form(url, fields):
    data = urllib.parse.urlencode(fields).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def exchange_code(code, redirect_uri):
    client_id = _get('gdrive_client_id')
    client_secret = _get('gdrive_client_secret')
    if not client_id or not client_secret:
        raise ValueError("Missing saved Client ID/Secret")
    result = _post_form(TOKEN_URL, {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })
    if 'refresh_token' in result:
        _set('gdrive_refresh_token', result['refresh_token'])
    _set('gdrive_access_token', result.get('access_token', ''))
    _set('gdrive_token_expiry', str(int(time.time()) + int(result.get('expires_in', 0))))
    return result


def _access_token():
    expiry = int(_get('gdrive_token_expiry') or 0)
    if time.time() < expiry - 60:
        token = _get('gdrive_access_token')
        if token:
            return token
    client_id = _get('gdrive_client_id')
    client_secret = _get('gdrive_client_secret')
    refresh_token = _get('gdrive_refresh_token')
    if not (client_id and client_secret and refresh_token):
        raise ValueError("Not connected to Google Drive")
    result = _post_form(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    })
    _set('gdrive_access_token', result.get('access_token', ''))
    _set('gdrive_token_expiry', str(int(time.time()) + int(result.get('expires_in', 0))))
    return result.get('access_token')


def _drive_get(url, token):
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _ensure_folder(token):
    folder_id = _get('gdrive_folder_id')
    if folder_id:
        return folder_id
    q = urllib.parse.quote(f"name='{FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false")
    result = _drive_get(f"{DRIVE_FILES_URL}?q={q}&fields=files(id,name)", token)
    files = result.get('files', [])
    if files:
        folder_id = files[0]['id']
    else:
        meta = json.dumps({"name": FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"}).encode('utf-8')
        req = urllib.request.Request(DRIVE_FILES_URL, data=meta, method='POST')
        req.add_header('Authorization', f"Bearer {token}")
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        folder_id = result['id']
    _set('gdrive_folder_id', folder_id)
    return folder_id


def upload_file(local_path, remote_name=None):
    token = _access_token()
    folder_id = _ensure_folder(token)
    remote_name = remote_name or os.path.basename(local_path)
    mime_type = mimetypes.guess_type(local_path)[0] or 'application/octet-stream'

    with open(local_path, 'rb') as f:
        file_data = f.read()

    boundary = 'guardpay-boundary-8f2a1c'
    metadata = json.dumps({"name": remote_name, "parents": [folder_id]})
    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode('utf-8') + file_data + f"\r\n--{boundary}--".encode('utf-8')

    req = urllib.request.Request(f"{DRIVE_UPLOAD_URL}?uploadType=multipart", data=body, method='POST')
    req.add_header('Authorization', f"Bearer {token}")
    req.add_header('Content-Type', f"multipart/related; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode('utf-8'))

    _set('gdrive_last_backup_at', time.strftime('%Y-%m-%dT%H:%M:%S'))
    return result
