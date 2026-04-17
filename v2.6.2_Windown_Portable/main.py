import io
import os
import sys
import base64
import json
import shutil
import csv
import random
import string
import mimetypes
import configparser
import copy
import socket
import threading
import eel
import bottle
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import glob
import time
import secrets
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TCON, TRCK, APIC, ID3NoHeaderError, TDRC, COMM, TPE2, TPOS, TBPM, TCOM, USLT
import zipfile
import pyzipper
import tkinter
import tkinter.filedialog as filedialog
from datetime import datetime
import urllib.request
import urllib.error
from PIL import Image
import subprocess
import tempfile
import pyzipper
import tkinter.filedialog as filedialog
import tkinter
import ctypes

# --- ディレクトリ設定 ---
if getattr(sys, 'frozen', False):
    # .exeとして実行されている場合（exeのあるディレクトリ）
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # 通常のpythonスクリプトとして実行されている場合
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# アプリバージョン定義
appVersion = "v2.6.1"

LIBRARY_DIR = os.path.join(BASE_DIR, "library")
MUSIC_DIR = os.path.join(LIBRARY_DIR, "music")
IMAGE_DIR = os.path.join(LIBRARY_DIR, "images")
USERFILES_DIR = os.path.join(BASE_DIR, "userfiles")

DB_PATH = os.path.join(USERFILES_DIR, "music.json")
PLAYLIST_DIR = os.path.join(USERFILES_DIR, "playlist")
PLAYLIST_MASTER_PATH = os.path.join(USERFILES_DIR, "playlist.json")
LYRIC_DB_PATH = os.path.join(USERFILES_DIR, "lyric.json")
SETTINGS_PATH = os.path.join(USERFILES_DIR, "settings.ini")
CUSTOM_THEMES_PATH = os.path.join(USERFILES_DIR, "custom_themes.json")

PLAY_COUNT_PATH = os.path.join(USERFILES_DIR, "played_times.json") # ★追加
HISTORY_PATH = os.path.join(USERFILES_DIR, "history.json")       # ★追加

# ★ BIN_DIR と 拡張機能の実行ファイルパス定義
BIN_DIR = os.path.join(USERFILES_DIR, "bin")
TOOL_VERSIONS_PATH = os.path.join(USERFILES_DIR, "tool_versions.json")
ffmpeg_exe = os.path.join(BIN_DIR, "ffmpeg.exe")
deno_exe = os.path.join(BIN_DIR, "deno.exe")
yt_dlp_exe = os.path.join(BIN_DIR, "yt-dlp.exe")

for directory in [MUSIC_DIR, IMAGE_DIR, USERFILES_DIR, PLAYLIST_DIR, BIN_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)

# --- TAG MAP ---
TAG_MAP = {
    'title': {'id3': TIT2, 'label': 'タイトル'}, 'artist': {'id3': TPE1, 'label': 'アーティスト'},
    'album': {'id3': TALB, 'label': 'アルバム'}, 'genre': {'id3': TCON, 'label': 'ジャンル'},
    'track': {'id3': TRCK, 'label': 'トラック'}, 'year': {'id3': TDRC, 'label': '年/日付'},
    'album_artist':{'id3': TPE2, 'label': 'アルバムアーティスト'}, 'disc': {'id3': TPOS, 'label': 'ディスクNo'},
    'bpm': {'id3': TBPM, 'label': 'BPM'}, 'composer': {'id3': TCOM, 'label': '作曲者'},
    'comment': {'id3': COMM, 'label': 'コメント'},
}
AUTH_STATE = {
    "window_open": False,
    "current_code": None,
    "code_expires_at": 0,
    "pending_request": None,
    "sessions": {}
}
# ミニプレイヤーとの同期用変数
CURRENT_PLAYBACK_STATE = {
    "song": None,
    "isPlaying": False,
    "currentTime": 0,
    "duration": 0,
    "queue": []
}
IS_MINI_PLAYER_OPEN = False

@eel.expose
def getAppVersion():
    return appVersion

def save_playlist_master(data_list):
    """プレイリストの基本情報一覧(playlist.json)を保存する"""
    try:
        with open(PLAYLIST_MASTER_PATH, 'w', encoding='utf-8') as f:
            json.dump(data_list, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Master Playlist Save Error: {e}")
        return False

def load_playlist_master():
    """プレイリストの基本情報一覧(playlist.json)を読み込む"""
    if not os.path.exists(PLAYLIST_MASTER_PATH):
        return []
    try:
        with open(PLAYLIST_MASTER_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Master Playlist Load Error: {e}")
        return []

def auth_code_generator():
    """30秒ごとにコードを更新する正しいロジック"""
    while True:
        if AUTH_STATE["window_open"]:
            now = time.time()
            # 有効期限が切れたら更新
            if now >= AUTH_STATE["code_expires_at"]:
                new_code = ''.join(random.choices(string.digits, k=6))
                AUTH_STATE["current_code"] = new_code
                AUTH_STATE["code_expires_at"] = now + 30
                try:
                    eel.update_auth_code(new_code, 30)()
                except: pass
        time.sleep(0.5) # 負荷軽減のため0.5秒ごとにチェック

# プログラム起動時にスレッドを開始
threading.Thread(target=auth_code_generator, daemon=True).start()

def ensure_default_image():
    """起動時にデフォルト画像があるか確認し、なければコピーする"""
    target = os.path.join(IMAGE_DIR, "default.png")
    if not os.path.exists(target):
        # app/icon/Chordia.png をコピー
        source = resource_path(os.path.join('app', 'icon', 'Chordia.png'))
        if os.path.exists(source):
            try:
                shutil.copy(source, target)
                print("Default image created.")
            except Exception as e:
                print(f"Error creating default image: {e}")

def generate_file_id(length=32):
    try:
        characters = string.ascii_lowercase + string.digits
        return ''.join(random.choices(characters, k=length))
    except Exception:
        return "temp_id_" + str(random.randint(1000, 9999))

def resolve_db_path(path):
    """
    DBに保存されたパス（相対パスまたは絶対パス）を、
    現在の実行環境での絶対パスに変換する。
    """
    if not path: return ""
    # スラッシュやバックスラッシュを現在のOSのセパレータに正規化
    path = os.path.normpath(path)
    
    if os.path.isabs(path):
        return path
    return os.path.join(BASE_DIR, path)

def make_relative_path(path):
    """
    絶対パスを BASE_DIR からの相対パスに変換して保存用に整形する。
    OS依存を無くすために区切り文字を '/' に統一する。
    """
    if not path: return ""
    try:
        rel_path = os.path.relpath(path, BASE_DIR)
        return rel_path.replace('\\', '/')
    except ValueError:
        return path.replace('\\', '/')

def load_db():
    try:
        if not os.path.exists(DB_PATH):
            return []
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []

def save_db(data_list):
    try:
        with open(DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(data_list, f, indent=4, ensure_ascii=False)
        return True
    except Exception:
        return False

@eel.expose
def set_sync_window_state(is_open):
    """同期ウィンドウの開閉状態をセット"""
    AUTH_STATE["window_open"] = is_open
    if not is_open:
        AUTH_STATE["pending_request"] = None

@eel.expose
def check_import_duplicates(import_list):
    """インポート予定のリストと現在のDBを照合し、タイトルとアーティストが一致する重複曲を返す"""
    db = load_db()
    # 検索高速化のため現在のDBをセット化 (小文字・トリミング済み)
    existing_set = set()
    for item in db:
        t = str(item.get('title', '')).strip().lower()
        a = str(item.get('artist', '')).strip().lower()
        if t and a:
            existing_set.add((t, a))

    duplicates = []
    for item in import_list:
        it = str(item.get('title', '')).strip().lower()
        ia = str(item.get('artist', '')).strip().lower()
        if (it, ia) in existing_set:
            duplicates.append({
                'title': item.get('title'),
                'artist': item.get('artist')
            })
    return duplicates

@eel.expose
def check_duplicate_songs(title, artist):
    """タイトルとアーティスト名が完全に一致する楽曲を検索する"""
    db = load_db()
    matches = []
    q_title = title.strip().lower()
    q_artist = artist.strip().lower()

    if not q_title or not q_artist:
        return []

    for item in db:
        if item.get('title', '').strip().lower() == q_title and \
           item.get('artist', '').strip().lower() == q_artist:
            # プレビュー再生用にファイル名（ベースネーム）を抽出
            m_path = item.get('musicFilename', '')
            fname = os.path.basename(m_path)
            
            matches.append({
                'title': item.get('title'),
                'artist': item.get('artist'),
                'album': item.get('album'),
                'filename': fname,
                'imageData': get_image_base64(item.get('imageFilename'))
            })
    return matches

@eel.expose
def clear_all_sessions():
    """同期ウィンドウが閉じられたときにすべてのセッションをクリアする"""
    AUTH_STATE["sessions"].clear()
    return True

@eel.expose
def reset_default_artwork():
    """デフォルト画像(default.png)をChordia.pngで初期化する"""
    target = os.path.join(IMAGE_DIR, "default.png")
    # app/icon/Chordia.png の絶対パスを取得
    source = resource_path(os.path.join('app', 'icon', 'Chordia.png'))
    try:
        if os.path.exists(source):
            shutil.copy(source, target)
            return True
        return False
    except Exception as e:
        print(f"Error resetting default image: {e}")
        return False

@eel.expose
def fetch_youtube_playlist(url):
    """
    yt-dlp を使用して再生リストの情報を一括取得する
    """
    is_ok, msg = check_required_binaries()
    if not is_ok:
        return {'status': 'error', 'message': msg}
    
    command =[
        yt_dlp_exe,
        "--dump-json",
        "--flat-playlist",
        url
    ]
    
    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        
        if result.returncode != 0:
            return {'status': 'error', 'message': f"取得エラー: {result.stderr.strip()}"}
            
        videos =[]
        for line in result.stdout.strip().split('\n'):
            if not line: continue
            try:
                info = json.loads(line)
                title = info.get('title', '')
                if title in ['[Private video]', '[Deleted video]']:
                    continue
                
                v_url = info.get('url', '')
                if not v_url and info.get('id'):
                    v_url = f"https://www.youtube.com/watch?v={info['id']}"
                
                thumbnails = info.get('thumbnails', [])
                thumb_url = thumbnails[-1]['url'] if thumbnails else info.get('thumbnail', '')
                
                videos.append({
                    'title': title,
                    'uploader': info.get('uploader', 'Unknown'),
                    'url': v_url,
                    'duration': info.get('duration', 0),
                    'thumbnail': thumb_url
                })
            except:
                pass
                
        return {'status': 'success', 'videos': videos}
        
    except Exception as e:
        return {'status': 'error', 'message': f"実行エラー: {str(e)}"}

# --- 歌詞操作 API ---

@eel.expose
def get_lyrics(music_filename):
    try:
        if not os.path.exists(LYRIC_DB_PATH):
            return ""
        with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f:
            lyrics_data = json.load(f)
        filename_key = os.path.basename(music_filename)
        return lyrics_data.get(filename_key, "")
    except Exception:
        return ""

@eel.expose
def parse_list_import(content, file_type):
    """JSON/CSVの内容を解析して、プレビュー用のリストを返す"""
    import_list = []
    try:
        if file_type == 'json':
            import_list = json.loads(content)
        elif file_type == 'csv':
            f = io.StringIO(content)
            reader = csv.DictReader(f)
            import_list = [row for row in reader]
    except Exception as e:
        return {'status': 'error', 'message': f'ファイルの解析に失敗しました: {str(e)}'}

    if not import_list:
        return {'status': 'error', 'message': 'データが空です。'}

    processed_data = []
    total = len(import_list)

    for i, item in enumerate(import_list):
        # 進捗通知
        try:
            eel.js_import_progress(i + 1, total, f"ファイルを解析中... {i+1} / {total}")()
            if i % 10 == 0: eel.sleep(0.001)
        except: pass

        music_path = item.get('musicFilename')
        image_path = item.get('imageFilename')
        
        # プレビュー用のデータ構造を作成
        entry = {
            'id': i + 1,
            'status': 'ok' if (music_path and os.path.exists(music_path)) else 'error',
            'musicFilename': music_path,
            'imageFilename': image_path,
            'lyric': item.get('lyric', ''),
            'artwork_base64': '' 
        }

        # タグ情報をコピー
        for key in TAG_MAP.keys():
            entry[key] = item.get(key, '')

        # 画像があればプレビュー用にBase64化
        if image_path and os.path.exists(image_path):
            entry['artwork_base64'] = get_image_base64(image_path)

        processed_data.append(entry)

    return {'status': 'success', 'data': processed_data}

@eel.expose
def execute_final_list_import(import_data_list):
    """編集済みのリストを受け取り、実際にファイルをコピーしてDBに登録する"""
    logs = []
    current_db = load_db()
    lyrics_data = {}
    if os.path.exists(LYRIC_DB_PATH):
        try:
            with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f: lyrics_data = json.load(f)
        except: pass

    total = len(import_data_list)
    success_count = 0

    for i, item in enumerate(import_data_list):
        try:
            eel.js_import_progress(i + 1, total, f"楽曲を登録中... {i+ success_count} / {total}")()
            eel.sleep(0.001)
        except: pass

        try:
            title = item.get('title', 'Unknown')
            src_music = item.get('musicFilename')
            src_image = item.get('imageFilename')
            
            if not src_music or not os.path.exists(src_music):
                logs.append({'status': 'error', 'message': f'ファイルが見つかりません: {title}'})
                continue
            
            file_id = generate_file_id()
            ext_music = os.path.splitext(src_music)[1]
            new_music_filename = f"{file_id}{ext_music}"
            
            dst_music_abs = os.path.join(MUSIC_DIR, new_music_filename)
            shutil.copy2(src_music, dst_music_abs)

            dst_image_abs = ""
            # 手動設定されたBase64画像がある場合（プレビューで変更した場合）
            if item.get('artwork_base64') and item['artwork_base64'].startswith('data:image'):
                b64_data = item['artwork_base64'].split(',')[1]
                ext = ".jpg" if "image/jpeg" in item['artwork_base64'] else ".png"
                dst_image_abs = os.path.join(IMAGE_DIR, f"{file_id}{ext}")
                with open(dst_image_abs, 'wb') as f:
                    f.write(base64.b64decode(b64_data))
            # 元のファイルパスがある場合
            elif src_image and os.path.exists(src_image):
                ext_image = os.path.splitext(src_image)[1]
                dst_image_abs = os.path.join(IMAGE_DIR, f"{file_id}{ext_image}")
                shutil.copy2(src_image, dst_image_abs)

            db_entry = {
                "musicFilename": make_relative_path(dst_music_abs),
                "imageFilename": make_relative_path(dst_image_abs),
                "lyric": item.get('lyric', '')
            }
            for key in TAG_MAP.keys():
                db_entry[key] = item.get(key, '')
            
            current_db.append(db_entry)
            if db_entry["lyric"]:
                lyrics_data[new_music_filename] = db_entry["lyric"]

            success_count += 1
            logs.append({'status': 'success', 'message': f'登録: {title}'})
        except Exception as e:
            logs.append({'status': 'error', 'message': f'エラー ({title}): {str(e)}'})

    save_db(current_db)
    try:
        with open(LYRIC_DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(lyrics_data, f, indent=4, ensure_ascii=False)
    except: pass
    
    set_mp3_tag(notify_progress=True)
    
    return {'status': 'success', 'count': success_count, 'total': total, 'logs': logs}

@eel.expose
def record_playback(song_data):
    """楽曲の再生開始を履歴と回数ファイルに記録する"""
    if not song_data: return
    
    filename = os.path.basename(song_data.get('musicFilename', ''))
    if not filename: return

    # 1. 再生回数の更新 (played_times.json)
    counts = {}
    if os.path.exists(PLAY_COUNT_PATH):
        try:
            with open(PLAY_COUNT_PATH, 'r', encoding='utf-8') as f:
                counts = json.load(f)
        except: counts = {}
    
    counts[filename] = counts.get(filename, 0) + 1
    
    with open(PLAY_COUNT_PATH, 'w', encoding='utf-8') as f:
        json.dump(counts, f, indent=4, ensure_ascii=False)

    # 2. 再生履歴の追加 (history.json)
    history = []
    if os.path.exists(HISTORY_PATH):
        try:
            with open(HISTORY_PATH, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except: history = []
    
    history.append({
        "title": song_data.get('title'),
        "artist": song_data.get('artist'),
        "filename": filename,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    
    # 履歴は直近1000件程度に制限（肥大化防止）
    if len(history) > 1000:
        history = history[-1000:]

    with open(HISTORY_PATH, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=4, ensure_ascii=False)

    return True

@eel.expose
def save_lyrics(music_filename, text):
    try:
        lyrics_data = {}
        if os.path.exists(LYRIC_DB_PATH):
            with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f:
                lyrics_data = json.load(f)
        filename_key = os.path.basename(music_filename)
        lyrics_data[filename_key] = text
        with open(LYRIC_DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(lyrics_data, f, indent=4, ensure_ascii=False)
        return True
    except Exception:
        return False

@eel.expose
def save_lyrics_for_song(music_filename, lyric_text):
    """指定された曲の歌詞をmusic.jsonに保存する"""
    db = load_db()
    updated = False
    for item in db:
        if item.get('musicFilename') == music_filename:
            item['lyric'] = lyric_text
            updated = True
            break
    
    if updated:
        save_db(db)
        return True
    return False

@eel.expose
def open_in_explorer(music_filename):
    """指定された楽曲ファイルをWindowsエクスプローラーで選択状態で開く"""
    path = resolve_db_path(music_filename)
    if os.path.exists(path):
        # パスを正規化し、ダブルクォーテーションで囲むことでスペース混じりのパスでも選択状態で開く
        norm_path = os.path.normpath(path)
        subprocess.Popen(f'explorer /select,"{norm_path}"')
    return True

@eel.expose
def migrate_lyrics_to_db():
    """旧形式(lyrics.json)からmusic.jsonへ歌詞データを移行する(1回限り)"""
    LYRICS_OLD_PATH = os.path.join(USERFILES_DIR, "lyrics.json")
    if not os.path.exists(LYRICS_OLD_PATH):
        return False
    
    try:
        with open(LYRICS_OLD_PATH, 'r', encoding='utf-8') as f:
            old_lyrics_dict = json.load(f)
        
        db = load_db()
        migrated_count = 0
        
        for item in db:
            m_path = item.get('musicFilename')
            if m_path:
                # ファイル名をキーとして歌詞を検索 (旧形式のキーに合わせて調整)
                fname = os.path.basename(m_path)
                if fname in old_lyrics_dict:
                    item['lyric'] = old_lyrics_dict[fname]
                    migrated_count += 1
                elif 'lyric' not in item:
                    item['lyric'] = "" # キーがない場合は空文字で初期化
        
        if migrated_count > 0:
            save_db(db)
            # 移行完了後、旧ファイルをリネームしてバックアップ
            os.rename(LYRICS_OLD_PATH, LYRICS_OLD_PATH + ".bak")
            return True
    except Exception as e:
        print(f"Migration Error: {e}")
    return False

@eel.expose
def create_smart_playlist(name, conditions):
    """スマートプレイリストを新規作成"""
    pl_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))
    
    new_pl = {
        "id": pl_id,
        "playlistName": name,
        "type": "smart",
        "sortBy": "title",
        "sortDesc": False,
        "conditions": conditions
    }

    master = load_playlist_master()
    master.append(new_pl)
    save_playlist_master(master)
    
    return get_playlist_details(pl_id)

def evaluate_smart_rules(song, rule_item):
    """再帰的にルールを評価する"""
    if rule_item['type'] == 'group':
        match_type = rule_item['match']
        results = [evaluate_smart_rules(song, child) for child in rule_item['items']]
        if not results: return True
        return all(results) if match_type == 'all' else any(results)
    elif rule_item['type'] == 'filter':
        tag = rule_item['tag']
        op = rule_item['op']
        target_val = rule_item['val']
        song_val = str(song.get(tag, '')).lower()
        if tag in ['track', 'year', 'disc', 'bpm']:
            try:
                s_num = float(song.get(tag, 0)) if str(song.get(tag, '')).strip() else 0
                if op == 'range':
                    return float(target_val[0]) <= s_num <= float(target_val[1])
                v_num = float(target_val)
                if op == 'equals': return s_num == v_num
                if op == 'not_equals': return s_num != v_num
                if op == 'greater': return s_num > v_num
                if op == 'less': return s_num < v_num
            except: return False
        target_str = str(target_val).lower()
        if op == 'contains': return target_str in song_val
        if op == 'not_contains': return target_str not in song_val
        if op == 'equals': return song_val == target_str
        if op == 'not_equals': return song_val != target_str
        if op == 'startswith': return song_val.startswith(target_str)
        if op == 'endswith': return song_val.endswith(target_str)
    return False

# --- Flask Server ---
flask_app = Flask(__name__)
CORS(flask_app)

# --- 認証API ---
@flask_app.route('/api/auth/request', methods=['POST'])
def auth_request():
    """iPhoneからの接続要求(IP手入力時)"""
    if not AUTH_STATE["window_open"]:
        return jsonify({"status": "error", "message": "Server not accepting requests"}), 503
    
    data = request.json
    AUTH_STATE["pending_request"] = {
        "ip": data.get('ip'),
        "device": data.get('device'),
        "os": data.get('os'),
        "status": "waiting"
    }
    try:
        eel.notify_auth_request(AUTH_STATE["pending_request"])()
    except: pass
    return jsonify({"status": "pending"})

@flask_app.route('/api/auth/cancel', methods=['POST'])
def auth_cancel():
    """iPhone側でキャンセルされたときに呼び出される"""
    AUTH_STATE["pending_request"] = None
    try:
        eel.reset_pc_ui()()
    except: pass
    return jsonify({"status": "reset"})

@flask_app.route('/api/auth/verify_session', methods=['GET'])
def auth_verify_session():
    """iOSからのセッション有効性確認(ポーリング用)"""
    if verify_request(request):
        return jsonify({"status": "valid"})
    return jsonify({"status": "invalid"}), 403

@flask_app.route('/api/auth/verify', methods=['POST'])
def auth_verify():
    """認証コードまたはQRコードによる最終検証"""
    data = request.json
    code = data.get('code')
    ip = data.get('ip')
    device = data.get('device')
    os_ver = data.get('os')
    
    if code == AUTH_STATE["current_code"]:
        # ★ 認証成功時は即座に保留中のリクエストをクリア
        AUTH_STATE["pending_request"] = None

        # 重複セッション防止
        keys_to_del = [k for k, v in AUTH_STATE["sessions"].items() if v["ip"] == ip and v["device"] == device]
        for k in keys_to_del: del AUTH_STATE["sessions"][k]

        api_key = secrets.token_hex(32)
        AUTH_STATE["sessions"][api_key] = {
            "ip": ip, "device": device, "os": os_ver,
            "last_access": time.time()
        }
        try:
            # PC側のUIを成功状態で閉じる
            eel.notify_auth_success(device)()
        except: pass
        return jsonify({"status": "success", "api_key": api_key})
    
    return jsonify({"status": "error", "message": "Invalid code"}), 403

# --- ポート番号の自動取得 ---
def find_free_port():
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0)) # OSに空きポートを自動割り当てさせる
        return s.getsockname()[1]

# 起動時にこのプロセス専用のポートを即座に確定させる
FLASK_PORT = find_free_port()

@flask_app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """iPhone側から接続解除されたときにセッションを削除する"""
    api_key = request.headers.get('X-API-KEY')
    if api_key in AUTH_STATE["sessions"]:
        del AUTH_STATE["sessions"][api_key]
    return jsonify({"status": "logged_out"})

def verify_request(req):
    api_key = req.headers.get('X-API-KEY')
    ip = req.headers.get('X-DEVICE-IP')
    device = req.headers.get('X-DEVICE-NAME')
    os_ver = req.headers.get('X-DEVICE-OS')
    
    if not api_key or api_key not in AUTH_STATE["sessions"]:
        return False
    
    session = AUTH_STATE["sessions"][api_key]
    # 10分(600秒)の有効期限チェック
    if time.time() - session["last_access"] > 600:
        del AUTH_STATE["sessions"][api_key]
        return False
        
    if session["ip"] == ip and session["device"] == device and session["os"] == os_ver:
        session["last_access"] = time.time()
        return True
    return False

@flask_app.route('/api/library', methods=['GET'])
def api_library():
    if not verify_request(request): return jsonify({"error": "Unauthorized"}), 403
    try:
        data = load_db()
        response_data = []
        for item in data:
            music_name = os.path.basename(item.get('musicFilename', ''))
            img_name = os.path.basename(item.get('imageFilename', ''))
            mobile_item = item.copy()
            mobile_item['url_music'] = f"/mobile_music/{music_name}" if music_name else ""
            mobile_item['url_image'] = f"/mobile_image/{img_name}" if img_name else ""
            if 'imageData' in mobile_item:
                del mobile_item['imageData']
            response_data.append(mobile_item)
        return jsonify({"library": response_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@flask_app.route('/mobile_music/<filename>')
def serve_mobile_music(filename):
    if not verify_request(request): return "Unauthorized", 403
    try:
        return send_from_directory(MUSIC_DIR, filename)
    except Exception:
        return "File not found", 404

@flask_app.route('/mobile_image/<filename>')
def serve_mobile_image(filename):
    if not verify_request(request): return "Unauthorized", 403
    try:
        return send_from_directory(IMAGE_DIR, filename)
    except Exception:
        return "File not found", 404

@flask_app.route('/api/playlists', methods=['GET'])
def api_playlists():
    """iPhoneアプリ同期用：すべてのプレイリストと、それに紐づく楽曲リストを集約して返す"""
    if not verify_request(request): return jsonify({"error": "Unauthorized"}), 403
    try:
        master = load_playlist_master()
        raw_db = load_db()
        playlists_list = []

        for pl in master:
            pl_data = pl.copy()
            if pl.get('type') == 'smart' and 'conditions' in pl:
                matched_filenames = []
                for song in raw_db:
                    if evaluate_smart_rules(song, pl['conditions']):
                        matched_filenames.append(os.path.basename(song.get('musicFilename', '')))
                pl_data['music'] = matched_filenames
            else:
                songs_path = os.path.join(PLAYLIST_DIR, f"{pl.get('id')}.json")
                if os.path.exists(songs_path):
                    try:
                        with open(songs_path, 'r', encoding='utf-8') as f:
                            pl_data['music'] = json.load(f)
                    except:
                        pl_data['music'] = []
                else:
                    pl_data['music'] = []
                    
            playlists_list.append(pl_data)

        return jsonify({"playlists": playlists_list})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@flask_app.route('/api/auth/check', methods=['POST'])
def auth_check():
    """iPhoneからの承認状態確認(ポーリング用)"""
    data = request.json
    if AUTH_STATE["pending_request"] and AUTH_STATE["pending_request"]["ip"] == data.get('ip'):
        response = {"status": AUTH_STATE["pending_request"]["status"]}
        # ★ 追加: 承認された場合、新しく発行されたコードも返す
        if AUTH_STATE["pending_request"]["status"] == "approved":
            response["code"] = AUTH_STATE["current_code"]
        return jsonify(response)
    return jsonify({"status": "expired"})

# ★ Eelから呼び出す認証関連の関数
@eel.expose
def respond_to_request(approve):
    """PCユーザーがポップアップで承認/拒否したとき"""
    if AUTH_STATE["pending_request"]:
        # ステータスを更新するだけにする（コードの表示判断はJS側に任せる）
        AUTH_STATE["pending_request"]["status"] = "approved" if approve else "rejected"
    return True

@eel.expose
def get_autocomplete_lists():
    """楽曲追加画面のサジェスト用に、タイトル・アーティスト・アルバムの一覧を取得する"""
    db = load_db()
    titles = set()
    artists = set()
    albums = set()
    for item in db:
        # None が入っていてもエラーにならないように str() を挟む
        t = str(item.get('title') or '').strip()
        a = str(item.get('artist') or '').strip()
        al = str(item.get('album') or '').strip()
        
        if t: titles.add(t)
        if a: artists.add(a)
        if al: albums.add(al)
        
    return {
        'title': sorted(list(titles), key=lambda s: s.lower()),
        'artist': sorted(list(artists), key=lambda s: s.lower()),
        'album': sorted(list(albums), key=lambda s: s.lower())
    }

@eel.expose
def get_auth_code_on_load():
    """ウィンドウ読み込み時に呼び出され、事前に6桁のコードを発行する"""
    code = ''.join(random.choices(string.digits, k=6))
    # 特定のデバイスが紐付く前なので ip/deviceなどは None
    AUTH_STATE["pending"] = {
        "code": code,
        "ip": None,
        "device": None,
        "os": None
    }
    return code

@eel.expose
def get_album_list():
    """登録されている全楽曲からアルバム名の一覧（重複なし・昇順）を取得"""
    db = load_db()
    albums = sorted(list(set(item.get('album', '') for item in db if item.get('album', '').strip())), key=lambda s: s.lower())
    return albums

@eel.expose
def get_artist_list():
    """登録されている全楽曲からアーティスト名の一覧（重複なし・昇順）を取得"""
    db = load_db()
    artists = sorted(list(set(item.get('artist', '') for item in db if item.get('artist', '').strip())), key=lambda s: s.lower())
    return artists

@eel.expose
def get_virtual_playlist_details(field, value):
    """アルバム名やアーティスト名から仮想プレイリスト（一時的なリスト）を作成して返す"""
    raw_db = load_db()
    # 指定されたフィールド（album または artist）が一致する曲を抽出
    matched_songs = [s for s in raw_db if s.get(field) == value]
    
    songs = []
    total_seconds = 0
    for s_data in matched_songs:
        s = s_data.copy()
        m_path = resolve_db_path(s.get('musicFilename'))
        duration_str = "--:--"
        if m_path and os.path.exists(m_path):
            try:
                audio = MP3(m_path)
                sec = int(audio.info.length)
                total_seconds += sec
                duration_str = f"{sec // 60}:{sec % 60:02d}"
            except: pass
        s['duration'] = duration_str
        s['imageData'] = get_image_base64(s.get('imageFilename'))
        songs.append(s)

    # 仮想プレイリストオブジェクト
    res = {
        "id": f"virtual_{field}_{value}",
        "playlistName": value,
        "type": "virtual",
        "sortBy": "title",
        "sortDesc": False,
        "songs": songs,
        "music": [os.path.basename(s.get('musicFilename','')) for s in matched_songs]
    }
    
    if total_seconds < 60: dur_str = f"{total_seconds}秒"
    elif total_seconds < 3600: dur_str = f"{total_seconds // 60}分"
    else: dur_str = f"{round(total_seconds / 3600, 1)}時間"
    res['totalDuration'] = dur_str
    
    return res

@eel.expose
def approve_auth(ip, device, os_ver):
    code = ''.join(random.choices(string.digits, k=6))
    AUTH_STATE["pending"] = { "code": code, "ip": ip, "device": device, "os": os_ver }
    return code

@eel.expose
def reject_auth():
    AUTH_STATE["pending"] = None
    return True

@eel.expose
def get_active_sessions():
    """セッション一覧を返し、10分以上経過したものは削除する"""
    now = time.time()
    active = []
    expired = [k for k, v in AUTH_STATE["sessions"].items() if now - v["last_access"] > 600]
    for k in expired: del AUTH_STATE["sessions"][k]

    for v in AUTH_STATE["sessions"].values():
        active.append({
            "device": v["device"],
            "ip": v["ip"],
            "remaining": int(600 - (now - v["last_access"]))
        })
    return active

@eel.expose
def force_disconnect_session(ip, device):
    """PC側から特定のデバイスのセッションを強制切断する"""
    keys_to_del = [k for k, v in AUTH_STATE["sessions"].items() if v["ip"] == ip and v["device"] == device]
    for k in keys_to_del:
        del AUTH_STATE["sessions"][k]
    return True

def run_flask():
    global FLASK_PORT
    try:
        # 他のプロセスと衝突しないよう、確定したポートで起動
        # debug=False, use_reloader=False は複数プロセス時の安定性のために重要です
        flask_app.run(host='0.0.0.0', port=FLASK_PORT, threaded=True, debug=False, use_reloader=False)
    except Exception as e:
        print(f"Flask起動失敗: {e}")

# --- Eel Functions ---

def resource_path(relative_path):
    try:
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.abspath(".")
        return os.path.join(base_path, relative_path)
    except Exception:
        return relative_path

@eel.expose
def get_connect_info():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        ip = '127.0.0.1'
        try:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except Exception:
            pass
        finally:
            s.close()
        # このプロセス固有のポートを返す
        return {'ip': ip, 'port': FLASK_PORT}
    except Exception:
        return {'ip': '127.0.0.1', 'port': FLASK_PORT}

def get_duration_str(path):
    try:
        # ★修正: パスを解決してからファイルにアクセス
        full_path = resolve_db_path(path)
        if full_path and os.path.exists(full_path) and full_path.lower().endswith('.mp3'):
            audio = MP3(full_path)
            length = int(audio.info.length)
            minutes, seconds = divmod(length, 60)
            return f"{minutes}:{seconds:02d}"
        return "--:--"
    except Exception:
        return "--:--"

def get_image_base64(path):
    try:
        # ★修正: パスを解決してからファイルにアクセス
        full_path = resolve_db_path(path)
        if full_path and os.path.exists(full_path):
            with open(full_path, 'rb') as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
                ext = os.path.splitext(full_path)[1].lower()
                mime = "image/png"
                if ext in ['.jpg', '.jpeg']:
                    mime = "image/jpeg"
                elif ext == '.gif':
                    mime = "image/gif"
                return f"data:{mime};base64,{encoded}"
        return ""
    except Exception:
        return ""

def load_settings():
    config = configparser.ConfigParser()
    if os.path.exists(SETTINGS_PATH):
        config.read(SETTINGS_PATH, encoding='utf-8')
    
    if not config.has_section('Database'): config.add_section('Database')
    if not config.has_option('Database', 'items_per_page'): config.set('Database', 'items_per_page', '50')
    if not config.has_option('Database', 'open_player_new_window'): config.set('Database', 'open_player_new_window', 'false')
    if not config.has_option('Database', 'open_manage_new_window'): config.set('Database', 'open_manage_new_window', 'false')
    if not config.has_option('Database', 'developer_mode'): config.set('Database', 'developer_mode', 'false')
    # ★変更: デフォルトを false に修正
    if not config.has_option('Database', 'lazy_load_playlists'): config.set('Database', 'lazy_load_playlists', 'false')
    
    if not config.has_section('Theme'): config.add_section('Theme')
    if not config.has_option('Theme', 'primary_color'): config.set('Theme', 'primary_color', '#4f46e5')
    if not config.has_option('Theme', 'background_color'): config.set('Theme', 'background_color', '#f3f4f6')
    if not config.has_option('Theme', 'sub_background_color'): config.set('Theme', 'sub_background_color', '#ffffff')
    if not config.has_option('Theme', 'text_color'): config.set('Theme', 'text_color', '#1f2937')
    if not config.has_option('Theme', 'theme_mode'): config.set('Theme', 'theme_mode', 'light')
    
    if not config.has_section('Tags'): config.add_section('Tags')
    if not config.has_option('Tags', 'active_tags'): config.set('Tags', 'active_tags', 'title,artist,album,genre,track')
    if not config.has_option('Tags', 'player_visible_tags'): config.set('Tags', 'player_visible_tags', 'title,artist,album,track')
    
    with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
        config.write(f)
    return config

@eel.expose
def update_default_artwork(b64_data):
    """ユーザーが設定した画像をデフォルト画像(default.png)として保存する"""
    target = os.path.join(IMAGE_DIR, "default.png")
    try:
        if ',' in b64_data: data = b64_data.split(',')[1]
        else: data = b64_data
        with open(target, 'wb') as f:
            f.write(base64.b64decode(data))
        # 既存曲への一括適用が必要な場合はここでset_mp3_tagを呼ぶことも可能
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

@eel.expose
def get_app_settings():
    try:
        config = load_settings()
        data = {
            'items_per_page': config.getint('Database', 'items_per_page'),
            'open_player_new_window': config.getboolean('Database', 'open_player_new_window'),
            'open_manage_new_window': config.getboolean('Database', 'open_manage_new_window'),
            'developer_mode': config.getboolean('Database', 'developer_mode'),
            'lazy_load_playlists': config.getboolean('Database', 'lazy_load_playlists'), # ★追加
            'primary_color': config.get('Theme', 'primary_color'),
            'background_color': config.get('Theme', 'background_color'),
            'sub_background_color': config.get('Theme', 'sub_background_color'),
            'text_color': config.get('Theme', 'text_color'),
            'theme_mode': config.get('Theme', 'theme_mode'),
            'active_tags': config.get('Tags', 'active_tags').split(','),
            'player_visible_tags': config.get('Tags', 'player_visible_tags').split(',')
        }
        return data
    except Exception as e:
        print(f"[DEBUG] get_app_settings Error: {e}")
        raise e

@eel.expose
def set_mini_player_open(status):
    """ミニプレイヤーの起動状態を管理する"""
    global IS_MINI_PLAYER_OPEN
    IS_MINI_PLAYER_OPEN = status
    if status:
        print("ミニプレイヤーがアクティブになりました。")
    return True

@eel.expose
def open_mini_player():
    """ミニプレイヤーの起動許可を出す（実際の起動はJS側のwindow.openで行う）"""
    # 二重起動の防止はJS側の window.open('...', 'ChordiaMiniPlayer') で
    # 同名ウィンドウを再利用する仕組みに任せるのが最も確実で軽量です
    return True

@eel.expose
def save_app_settings(s_dict):
    try:
        config = configparser.ConfigParser()
        config.read(SETTINGS_PATH, encoding='utf-8')
        
        if 'items_per_page' in s_dict: config.set('Database', 'items_per_page', str(s_dict['items_per_page']))
        if 'open_player_new_window' in s_dict: config.set('Database', 'open_player_new_window', str(s_dict['open_player_new_window']).lower())
        if 'open_manage_new_window' in s_dict: config.set('Database', 'open_manage_new_window', str(s_dict['open_manage_new_window']).lower())
        if 'developer_mode' in s_dict: config.set('Database', 'developer_mode', str(s_dict['developer_mode']).lower())
        if 'lazy_load_playlists' in s_dict: config.set('Database', 'lazy_load_playlists', str(s_dict['lazy_load_playlists']).lower()) # ★追加
        if 'primary_color' in s_dict: config.set('Theme', 'primary_color', s_dict['primary_color'])
        if 'background_color' in s_dict: config.set('Theme', 'background_color', s_dict['background_color'])
        if 'sub_background_color' in s_dict: config.set('Theme', 'sub_background_color', s_dict['sub_background_color'])
        if 'text_color' in s_dict: config.set('Theme', 'text_color', s_dict['text_color'])
        if 'theme_mode' in s_dict: config.set('Theme', 'theme_mode', s_dict['theme_mode'])
        if 'active_tags' in s_dict: config.set('Tags', 'active_tags', ",".join(s_dict['active_tags']))
        if 'player_visible_tags' in s_dict: config.set('Tags', 'player_visible_tags', ",".join(s_dict['player_visible_tags']))
        
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            config.write(f)
        return True
    except Exception as e:
        print(f"Save Settings Error: {e}")
        return False

@eel.expose
def get_available_tags():
    try:
        return [{'key': k, 'label': v['label']} for k, v in TAG_MAP.items()]
    except Exception as e:
        print(f"[DEBUG] get_available_tags Error: {e}")
        return []

@eel.expose
def get_custom_themes():
    """保存されたオリジナルテーマの一覧を取得する。必ず辞書型を返す。"""
    if not os.path.exists(CUSTOM_THEMES_PATH):
        return {}
    try:
        with open(CUSTOM_THEMES_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 読み込んだデータが辞書型であることを保証する
            if isinstance(data, dict):
                return data
            return {}
    except Exception as e:
        print(f"Theme Load Error: {e}")
        return {}

@eel.expose
def add_songs_to_playlist(pl_id, filenames):
    """プレイリストに楽曲を追加する"""
    master = load_playlist_master()
    pl = next((p for p in master if p.get('id') == pl_id), None)
    if not pl or pl.get('type') == 'smart': return None
    
    songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
    current_music = []
    if os.path.exists(songs_path):
        try:
            with open(songs_path, 'r', encoding='utf-8') as f:
                current_music = json.load(f)
        except: pass
        
    for fname in filenames:
        if fname not in current_music:
            current_music.append(fname)
            
    with open(songs_path, 'w', encoding='utf-8') as f:
        json.dump(current_music, f, indent=4, ensure_ascii=False)
        
    return get_playlist_details(pl_id)

@eel.expose
def save_custom_theme(name, colors):
    """オリジナルテーマを保存する。既存のファイルがリスト型でも辞書型に強制変換する。"""
    try:
        # get_custom_themes を使わず直接読み込んでチェック（確実に辞書として扱うため）
        themes = {}
        if os.path.exists(CUSTOM_THEMES_PATH):
            with open(CUSTOM_THEMES_PATH, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    if isinstance(data, dict):
                        themes = data
                except json.JSONDecodeError:
                    pass
        
        # データを追加/更新
        themes[name] = colors
        
        with open(CUSTOM_THEMES_PATH, 'w', encoding='utf-8') as f:
            json.dump(themes, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Theme Save Error: {e}")
        return False
    
@eel.expose
def delete_custom_theme(name):
    """保存されたオリジナルテーマを削除する"""
    try:
        themes = get_custom_themes()
        if name in themes:
            del themes[name]
            with open(CUSTOM_THEMES_PATH, 'w', encoding='utf-8') as f:
                json.dump(themes, f, indent=4, ensure_ascii=False)
            return True
        return False
    except Exception as e:
        print(f"Theme Delete Error: {e}")
        return False

@eel.expose
def set_mp3_tag(notify=False, notify_progress=False):
    db = load_db()
    total = len(db)
    
    for i, item in enumerate(db):
        path = resolve_db_path(item.get('musicFilename'))
        
        if not path or not os.path.exists(path) or not path.lower().endswith('.mp3'): continue
        
        if notify_progress:
            try:
                if i % 10 == 0 or i == total - 1:
                    # ★修正: 末尾に()を追加して実行
                    eel.js_import_progress(i + 1, total, f"タグ情報更新中... {i+1}/{total}")()
                    eel.sleep(0.001)
            except Exception:
                pass

        try:
            audio = MP3(path)
            if audio.tags is None: audio.add_tags()
            
            for k, t_def in TAG_MAP.items():
                val = item.get(k)
                if val: audio.tags.add(t_def['id3'](encoding=3, text=str(val)))
            
            lyric = item.get('lyric', '')
            if lyric:
                audio.tags.setall('USLT',[USLT(encoding=3, lang='eng', desc='', text=str(lyric))])
            else:
                audio.tags.delall('USLT')
                
            i_path = resolve_db_path(item.get('imageFilename'))
            if i_path and os.path.exists(i_path):
                with open(i_path, 'rb') as f:
                    audio.tags.add(APIC(encoding=3, mime='image/jpeg', type=3, desc='Cover', data=f.read()))
            
            audio.save()
        except Exception as e:
            print(f"Tag Write Error: {e}")
    return True

@eel.expose
def get_library_count(search_query="", advanced_conditions=None):
    try:
        db = load_db()
        if advanced_conditions:
            db = [item for item in db if _match_advanced_search(item, advanced_conditions)]
        elif search_query:
            db = [item for item in db if _match_search(item, search_query)]
        return len(db)
    except Exception:
        return 0

@eel.expose
def get_library_chunk(page, limit, sort_field=None, sort_desc=False, notify_progress=False, search_query="", advanced_conditions=None):
    try:
        raw_data = load_db()
        
        # 1. 検索フィルタリング
        if advanced_conditions:
            raw_data = [item for item in raw_data if _match_advanced_search(item, advanced_conditions)]
        elif search_query:
            raw_data = [item for item in raw_data if _match_search(item, search_query)]

        # 2. ソート
        if sort_field:
            def sort_key(item):
                val = item.get(sort_field, '')
                if sort_field in ['track', 'disc', 'year', 'bpm']:
                    try:
                        return int(val)
                    except Exception:
                        return 0
                return str(val).lower()
            if sort_field != 'duration': raw_data.sort(key=sort_key, reverse=sort_desc)
        
        # 3. ページネーション処理
        if limit > 0:
            start = (page - 1) * limit
            end = start + limit
            target_chunk = raw_data[start:end]
        else:
            target_chunk = raw_data

        processed_chunk = []
        total_in_chunk = len(target_chunk)
        for i, item in enumerate(target_chunk):
            if notify_progress:
                try:
                    eel.js_manage_progress(i + 1, total_in_chunk)
                    if limit == 0 and i % 10 == 0:
                        eel.sleep(0.001)
                except Exception:
                    pass
            item['duration'] = get_duration_str(item.get('musicFilename'))
            item['imageData'] = get_image_base64(item.get('imageFilename'))
            processed_chunk.append(item)
        return processed_chunk
    except Exception:
        return []
    
@eel.expose
def get_default_art_url():
    """プレビュー用URL(キャッシュ回避付き)"""
    import time
    return f"/get_image/default.png?t={int(time.time())}"

@eel.expose
def get_library_data_with_meta(include_images=False):
    data = load_db()
    total = len(data)
    if total == 0:
        return[]

    for i, it in enumerate(data):
        if i % 10 == 0 or i == total - 1:
            try:
                # ★修正: () を付けてJSの関数を実行する
                eel.js_music_load_progress(i + 1, total)()
            except Exception:
                pass
            eel.sleep(0.001)

        it['duration'] = get_duration_str(it.get('musicFilename'))
        it['imageData'] = get_image_base64(it.get('imageFilename')) if include_images else ""
        # lyricキーがない場合に備えて初期化
        if 'lyric' not in it:
            it['lyric'] = ""
            
    return data

@eel.expose
def save_music_data(data):
    try:
        f_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))
        m_b64 = data['music_data']
        ext = os.path.splitext(data['music_name'])[1] or ".mp3"
        
        # ファイル実体は絶対パスで保存
        m_path_abs = os.path.join(MUSIC_DIR, f"{f_id}{ext}")
        with open(m_path_abs, 'wb') as f:
            f.write(base64.b64decode(m_b64.split(',')[1] if ',' in m_b64 else m_b64))

        i_path_abs = ""
        if data.get('artwork_data'):
            i_b64 = data['artwork_data']
            i_ext = ".jpg" if "image/jpeg" in i_b64 else ".png"
            i_path_abs = os.path.join(IMAGE_DIR, f"{f_id}{i_ext}")
            with open(i_path_abs, 'wb') as f:
                f.write(base64.b64decode(i_b64.split(',')[1] if ',' in i_b64 else i_b64))
        else:
            default_img = os.path.join(IMAGE_DIR, "default.png")
            if os.path.exists(default_img):
                i_path_abs = os.path.abspath(default_img)

        # 歌詞データの取得と改行コードの正規化
        raw_lyric = data.get('lyric', '')
        normalized_lyric = raw_lyric.replace('\r\n', '\n').replace('\r', '\n')

        # DBには相対パスを保存
        db = load_db()
        entry = {
            "musicFilename": make_relative_path(m_path_abs),
            "imageFilename": make_relative_path(i_path_abs),
            "lyric": normalized_lyric
        }
        for k in TAG_MAP.keys(): entry[k] = data.get(k, '')
        db.append(entry)
        save_db(db)
        
        # lyric.json への保存処理
        if normalized_lyric:
            lyrics_data = {}
            if os.path.exists(LYRIC_DB_PATH):
                try:
                    with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f:
                        lyrics_data = json.load(f)
                except Exception:
                    pass
            
            # ファイル名をキーにして保存
            new_filename = f"{f_id}{ext}"
            lyrics_data[new_filename] = normalized_lyric
            
            with open(LYRIC_DB_PATH, 'w', encoding='utf-8') as f:
                json.dump(lyrics_data, f, indent=4, ensure_ascii=False)
        
        set_mp3_tag()
        return True
    except Exception as e:
        print(f"Save Music Error: {e}")
        return False
    
@eel.expose
def download_and_save_music(data):
    """
    userfiles/bin/yt-dlp.exe と ffmpeg.exe を使用して動画URLから音声をダウンロードし、
    メタデータやアートワークを付与してライブラリに保存する。
    """
    is_ok, msg = check_required_binaries()
    if not is_ok:
        print(f"Error: {msg}")
        return False

    try:
        video_url = data.get('video_url')
        if not video_url:
            return False

        f_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))
        m_path_abs = os.path.join(MUSIC_DIR, f"{f_id}.mp3")

        # --no-playlist フラグを追加してプレイリストURLを渡されても単一動画として処理する
        command = [
            yt_dlp_exe,
            "--no-playlist",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0", # 最高品質(VBR)
            "--ffmpeg-location", os.path.dirname(ffmpeg_exe),
            "-o", os.path.join(MUSIC_DIR, f"{f_id}.%(ext)s"),
            video_url
        ]

        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        
        if result.returncode != 0:
            print(f"Download Error: {result.stderr.strip()}")
            return False

        if not os.path.exists(m_path_abs):
            print("Error: MP3 file was not created.")
            return False

        i_path_abs = ""
        artwork_b64 = data.get('artwork_data')
        
        if artwork_b64:
            if ',' in artwork_b64:
                header, b64_body = artwork_b64.split(',', 1)
            else:
                header, b64_body = "image/png", artwork_b64
                
            i_ext = ".jpg" if "image/jpeg" in header else ".png"
            i_path_abs = os.path.join(IMAGE_DIR, f"{f_id}{i_ext}")
            
            with open(i_path_abs, 'wb') as f:
                f.write(base64.b64decode(b64_body))
        else:
            default_img = os.path.join(IMAGE_DIR, "default.png")
            if os.path.exists(default_img):
                i_path_abs = os.path.abspath(default_img)

        raw_lyric = data.get('lyric', '')
        normalized_lyric = raw_lyric.replace('\r\n', '\n').replace('\r', '\n')

        db = load_db()
        entry = {
            "musicFilename": make_relative_path(m_path_abs),
            "imageFilename": make_relative_path(i_path_abs),
            "lyric": normalized_lyric
        }
        for k in TAG_MAP.keys():
            entry[k] = data.get(k, '')
        db.append(entry)
        save_db(db)
        
        if normalized_lyric:
            lyrics_data = {}
            if os.path.exists(LYRIC_DB_PATH):
                try:
                    with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f:
                        lyrics_data = json.load(f)
                except Exception:
                    pass
            new_filename = f"{f_id}.mp3"
            lyrics_data[new_filename] = normalized_lyric
            with open(LYRIC_DB_PATH, 'w', encoding='utf-8') as f:
                json.dump(lyrics_data, f, indent=4, ensure_ascii=False)
        
        set_mp3_tag()
        
        return True

    except Exception as e:
        print(f"Download and Save Error: {e}")
        return False

    except Exception as e:
        print(f"Download and Save Error: {e}")
        return False

@eel.expose
def execute_import(content, file_type):
    logs = []
    import_list =[]
    try:
        if file_type == 'json':
            import_list = json.loads(content)
        elif file_type == 'csv':
            f = io.StringIO(content)
            reader = csv.DictReader(f)
            if 'musicFilename' not in reader.fieldnames:
                return[{'status': 'error', 'message': 'CSVヘッダーエラー'}]
            for row in reader:
                import_list.append(row)
    except Exception as e:
        return[{'status': 'error', 'message': str(e)}]

    if not import_list:
        return[{'status': 'error', 'message': 'データなし'}]

    current_db = load_db()
    lyrics_data = {}
    if os.path.exists(LYRIC_DB_PATH):
        try:
            with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f: lyrics_data = json.load(f)
        except: pass

    total_count = len(import_list)
    success_count = 0

    for i, item in enumerate(import_list):
        # ★ 進捗通知とブロック防止
        try:
            eel.js_import_progress(i + 1, total_count, f"リストから楽曲をインポート中... {i+1} / {total_count}")()
            if i % 2 == 0 or i == total_count - 1:
                eel.sleep(0.001)
        except: pass

        try:
            title = item.get('title', 'Unknown')
            src_music = item.get('musicFilename')
            src_image = item.get('imageFilename')
            
            if not src_music or not os.path.exists(src_music):
                logs.append({'status': 'error', 'message': f'楽曲なし: {title}'})
                continue
            
            file_id = generate_file_id()
            ext_music = os.path.splitext(src_music)[1]
            new_music_filename = f"{file_id}{ext_music}"
            
            dst_music_abs = os.path.join(MUSIC_DIR, new_music_filename)
            shutil.copy2(src_music, dst_music_abs)

            dst_image_abs = ""
            if src_image and os.path.exists(src_image):
                ext_image = os.path.splitext(src_image)[1]
                new_image_filename = f"{file_id}{ext_image}"
                dst_image_abs = os.path.join(IMAGE_DIR, new_image_filename)
                shutil.copy2(src_image, dst_image_abs)

            db_entry = {
                "musicFilename": make_relative_path(dst_music_abs),
                "imageFilename": make_relative_path(dst_image_abs)
            }
            for key in TAG_MAP.keys():
                db_entry[key] = item.get(key, '')
            
            current_db.append(db_entry)
            
            if "lyric" in item and item["lyric"]:
                lyrics_data[new_music_filename] = item["lyric"]

            success_count += 1
            logs.append({'status': 'success', 'message': f'登録: {title}'})
        except Exception as e:
            logs.append({'status': 'error', 'message': f'エラー ({title}): {str(e)}'})

    save_db(current_db)
    
    try:
        with open(LYRIC_DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(lyrics_data, f, indent=4, ensure_ascii=False)
    except: pass
    
    set_mp3_tag(notify_progress=True)
    
    logs.append({'status': 'info', 'message': f'完了。成功: {success_count} / 全体: {total_count}'})
    return logs

def check_required_binaries():
    """
    yt-dlp.exe, ffmpeg.exe, deno.exe が bin フォルダに存在するか確認する。
    不足している場合はエラーメッセージを返す。
    """
    required_tools = ['yt-dlp.exe', 'ffmpeg.exe', 'deno.exe']
    missing_tools = []
    
    for tool in required_tools:
        if not os.path.exists(os.path.join(BIN_DIR, tool)):
            missing_tools.append(tool)
            
    if missing_tools:
        return False, f"必要なツールが不足しています: {', '.join(missing_tools)}。\n拡張機能ページからインストールしてください。"
    return True, ""

@eel.expose
def fetch_video_info(url):
    """
    userfiles/bin/yt-dlp.exe を使用して動画情報（タイトル、サムネイル、長さ等）を取得する
    """
    is_ok, msg = check_required_binaries()
    if not is_ok:
        return {'status': 'error', 'message': msg}
    
    # --no-playlist を含めてプレイリスト情報を無視するようにする
    command = [
        yt_dlp_exe,
        "--dump-json",
        "--no-playlist",
        "--skip-download",
        url
    ]
    
    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        
        if result.returncode != 0:
            return {'status': 'error', 'message': f"取得エラー: {result.stderr.strip()}"}
            
        info = json.loads(result.stdout.strip())
        
        return {
            'status': 'success',
            'title': info.get('title', 'Unknown Title'),
            'duration': info.get('duration', 0),
            'thumbnail': info.get('thumbnail', ''),
            'uploader': info.get('uploader', 'Unknown')
        }
        
    except Exception as e:
        return {'status': 'error', 'message': f"実行エラー: {str(e)}"}

@eel.expose
def download_original_thumbnail(url):
    """
    オリジナル画質のサムネイル画像をユーザーが指定した場所に保存する
    """
    root = tkinter.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    
    file_path = filedialog.asksaveasfilename(
        title="オリジナルサムネイル画像を保存",
        defaultextension=".jpg",
        filetypes=[("JPEG files", "*.jpg"), ("PNG files", "*.png"), ("All files", "*.*")]
    )
    root.destroy()
    
    if not file_path:
        return {'status': 'cancel', 'message': 'キャンセルされました'}
        
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(file_path, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        return {'status': 'success', 'message': 'オリジナル画像を保存しました'}
    except Exception as e:
        return {'status': 'error', 'message': f'保存に失敗しました: {str(e)}'}

@eel.expose
def fetch_and_crop_thumbnail(url):
    """
    URLからサムネイル画像をダウンロードし、中央を基準に正方形にクロップしてBase64で返す
    """
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            img_data = response.read()
        
        # バイトデータから画像を読み込む
        img = Image.open(io.BytesIO(img_data))
        
        # 中央を基準に正方形にクロップ
        width, height = img.size
        new_size = min(width, height)
        left = (width - new_size) / 2
        top = (height - new_size) / 2
        right = (width + new_size) / 2
        bottom = (height + new_size) / 2
        
        img_cropped = img.crop((left, top, right, bottom))
        
        # RGBモードに変換（PNGのアルファチャンネル等がある場合のJPEG保存エラー回避）
        if img_cropped.mode != 'RGB':
            img_cropped = img_cropped.convert('RGB')
        
        # Base64に変換
        buffered = io.BytesIO()
        img_cropped.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return f"data:image/jpeg;base64,{img_str}"
    except Exception as e:
        print(f"Thumbnail Crop Error: {e}")
        return None

@eel.expose
def extract_artwork_from_local_file(b64_music):
    """
    Base64化されたMP3ファイルからアルバムアートを抽出し、Base64で返す。
    画像がない場合はNoneを返す。
    """
    import tempfile
    try:
        # Base64のヘッダーを削除
        if ',' in b64_music:
            b64_music = b64_music.split(',')[1]
        
        music_data = base64.b64decode(b64_music)
        
        # 一時ファイルとして保存してMutagenで読み込む
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_audio:
            temp_audio.write(music_data)
            temp_audio_path = temp_audio.name
            
        audio = MP3(temp_audio_path, ID3=ID3)
        os.remove(temp_audio_path)
        
        if audio.tags:
            apic_frames = audio.tags.getall('APIC')
            if apic_frames:
                apic = apic_frames[0]
                img = Image.open(io.BytesIO(apic.data))
                
                # スクエアにクロップ
                width, height = img.size
                new_size = min(width, height)
                left = (width - new_size) / 2
                top = (height - new_size) / 2
                right = (width + new_size) / 2
                bottom = (height + new_size) / 2
                
                img_cropped = img.crop((left, top, right, bottom))
                if img_cropped.mode != 'RGB':
                    img_cropped = img_cropped.convert('RGB')
                    
                buffered = io.BytesIO()
                img_cropped.save(buffered, format="JPEG")
                img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
                return f"data:image/jpeg;base64,{img_str}"
                
        return None
    except Exception as e:
        print(f"Artwork Extraction Error: {e}")
        return None

@eel.expose
def remove_songs_from_playlist(pl_id, filenames):
    """プレイリストから楽曲を削除する"""
    master = load_playlist_master()
    pl = next((p for p in master if p.get('id') == pl_id), None)
    if not pl or pl.get('type') == 'smart': return None
    
    songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
    current_music = []
    if os.path.exists(songs_path):
        try:
            with open(songs_path, 'r', encoding='utf-8') as f:
                current_music = json.load(f)
        except: pass
        
    new_music = [m for m in current_music if m not in filenames]
    with open(songs_path, 'w', encoding='utf-8') as f:
        json.dump(new_music, f, indent=4, ensure_ascii=False)
        
    return get_playlist_details(pl_id)

@eel.expose
def fetch_and_crop_image_url(url):
    """
    直接の画像URL（jpg, png, webpなど）から画像をダウンロードし、スクエアにクロップしてBase64で返す
    """
    try:
        # 拡張子の簡易チェック（クエリパラメータ等を考慮してURLのファイル名部分をチェック）
        from urllib.parse import urlparse
        parsed = urlparse(url)
        ext = os.path.splitext(parsed.path)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
            return {'status': 'error', 'message': 'jpg, png, webp形式の画像URLのみ対応しています。'}
            
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            img_data = response.read()
            
        img = Image.open(io.BytesIO(img_data))
        
        # スクエアにクロップ
        width, height = img.size
        new_size = min(width, height)
        left = (width - new_size) / 2
        top = (height - new_size) / 2
        right = (width + new_size) / 2
        bottom = (height + new_size) / 2
        
        img_cropped = img.crop((left, top, right, bottom))
        if img_cropped.mode != 'RGB':
            img_cropped = img_cropped.convert('RGB')
            
        buffered = io.BytesIO()
        img_cropped.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return {'status': 'success', 'data': f"data:image/jpeg;base64,{img_str}"}
    except urllib.error.URLError:
        return {'status': 'error', 'message': '画像の取得に失敗しました。URLを確認してください。'}
    except Exception as e:
        return {'status': 'error', 'message': f'画像処理エラー: {str(e)}'}

@eel.expose
def update_song_metadata(music_filename, updated_fields):
    """
    updated_fields: {'title': '...', 'artist': '...', 'lyric': '...', ...}
    """
    db = load_db()
    found = False
    for item in db:
        if item.get('musicFilename') == music_filename:
            # フィールドを一括更新
            for key, value in updated_fields.items():
                item[key] = value
            found = True
            break
    
    if found:
        save_db(db)
        # music.jsonへの保存が終わったら、その曲の情報をファイルに書き込む
        # (個別に最適化も可能ですが、既存のset_mp3_tagを呼ぶのが安全です)
        set_mp3_tag()
        return True
    return False

@eel.expose
def update_song_by_id(music_filename, field, value):
    try:
        data = load_db()
        for item in data:
            if item.get('musicFilename') == music_filename:
                item[field] = value
                save_db(data)
                set_mp3_tag()
                return True
        return False
    except Exception: return False

@eel.expose
def update_song_artwork_by_id(music_filename, new_art_base64, remove):
    try:
        data = load_db()
        target = None
        # music_filename (ID) は相対パスの可能性があるが、DB内も相対パスなので文字列比較でOK
        for item in data:
            if item.get('musicFilename') == music_filename:
                target = item
                break
        if not target: return False
        
        # 削除時は絶対パスにしてから削除
        old = resolve_db_path(target.get('imageFilename'))
        if old and os.path.exists(old):
            try: os.remove(old)
            except: pass
            
        if remove:
            target['imageFilename'] = ""
        elif new_art_base64:
            file_id = generate_file_id()
            image_ext = ".png"
            if ',' in new_art_base64:
                header, body = new_art_base64.split(',', 1)
                if "image/jpeg" in header: image_ext = ".jpg"
                new_art_base64 = body
            
            # 実体は絶対パスで保存
            new_image_filename = f"{file_id}{image_ext}"
            new_path_abs = os.path.join(IMAGE_DIR, new_image_filename)
            with open(new_path_abs, 'wb') as f:
                f.write(base64.b64decode(new_art_base64))
            
            # ★修正: DBには相対パスを保存
            target['imageFilename'] = make_relative_path(new_path_abs)
            
        save_db(data)
        set_mp3_tag()
        return True
    except Exception:
        return False

@eel.expose
def delete_song_by_id(music_filename):
    try:
        data = load_db()
        idx = -1
        for i, item in enumerate(data):
            if item.get('musicFilename') == music_filename: idx = i; break
        if idx != -1:
            # ★修正: ファイル削除のために絶対パスへ変換
            m = resolve_db_path(data[idx].get('musicFilename'))
            img = resolve_db_path(data[idx].get('imageFilename'))
            
            if m and os.path.exists(m): os.remove(m)
            if img and os.path.exists(img): os.remove(img)
            
            del data[idx]
            save_db(data)
            return True
        return False
    except Exception:
        return False

@eel.expose
def get_playlist_summaries():
    """プレイリスト一覧を取得 (サイドバー用)。基本情報のみ返す"""
    master = load_playlist_master()
    summaries = []
    for pl in master:
        try:
            summaries.append({
                "id": pl.get('id'),
                "playlistName": pl.get('playlistName', 'Untitled'),
                "totalDuration": "0分", 
                "sortBy": pl.get('sortBy', 'title'),
                "sortDesc": pl.get('sortDesc', False),
                "type": pl.get('type', 'normal'),
                "songs": None
            })
        except: continue
    return summaries

@eel.expose
def get_playlist_details(pl_id):
    """プレイリストの詳細（楽曲情報含む）を取得する"""
    master = load_playlist_master()
    pl = next((p for p in master if p.get('id') == pl_id), None)
    if not pl: return None
    
    raw_db = load_db()
    music_map = {os.path.basename(m.get('musicFilename','')): m for m in raw_db if m.get('musicFilename')}
    
    # 楽曲リストの取得
    music_list = []
    if pl.get('type') == 'smart' and 'conditions' in pl:
        # スマートプレイリスト：動的抽出
        for song in raw_db:
            if evaluate_smart_rules(song, pl['conditions']):
                music_list.append(os.path.basename(song.get('musicFilename', '')))
    else:
        # 通常プレイリスト：playlistフォルダの個別JSONから読み込み
        songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
        if os.path.exists(songs_path):
            try:
                with open(songs_path, 'r', encoding='utf-8') as f:
                    music_list = json.load(f)
            except: pass
    
    songs = []
    total_seconds = 0
    for fname in music_list:
        if fname in music_map:
            s = music_map[fname].copy()
            m_path = resolve_db_path(s.get('musicFilename'))
            duration_str = "--:--"
            if m_path and os.path.exists(m_path):
                try:
                    audio = MP3(m_path)
                    sec = int(audio.info.length)
                    total_seconds += sec
                    duration_str = f"{sec // 60}:{sec % 60:02d}"
                except: pass
            s['duration'] = duration_str
            s['imageData'] = get_image_base64(s.get('imageFilename'))
            songs.append(s)
    
    pl['music'] = music_list # 同期用に配列を詰めておく
    pl['songs'] = songs
    if total_seconds < 60: dur_str = f"{total_seconds}秒"
    elif total_seconds < 3600: dur_str = f"{total_seconds // 60}分"
    else: dur_str = f"{round(total_seconds / 3600, 1)}時間"
    pl['totalDuration'] = dur_str
    
    return pl

@eel.expose
def create_playlist(name, pl_type="normal"):
    """新規プレイリスト作成"""
    pl_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))
    
    new_pl = {
        "id": pl_id,
        "playlistName": name,
        "type": pl_type,
        "sortBy": "title",
        "sortDesc": False
    }
    
    if pl_type == "smart":
        new_pl["conditions"] = []
    else:
        # 通常プレイリストの場合は空の配列を保存
        songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
        with open(songs_path, 'w', encoding='utf-8') as f:
            json.dump([], f, indent=4, ensure_ascii=False)
            
    master = load_playlist_master()
    master.append(new_pl)
    save_playlist_master(master)
    
    return get_playlist_details(pl_id)

@eel.expose
def update_playback_state_bridge(state):
    """メインウィンドウから状態を受け取り、保持する。ミニプレイヤーが開いていれば通知する"""
    global CURRENT_PLAYBACK_STATE
    CURRENT_PLAYBACK_STATE.update(state)
    
    if IS_MINI_PLAYER_OPEN:
        try:
            # 通信相手がいない場合に備えて、実行を投げっぱなしにする(非同期呼び出し)
            # 相手がいない場合はエラーを無視して続行
            eel.sync_from_python(CURRENT_PLAYBACK_STATE)()
        except:
            pass

@eel.expose
def get_playback_state_bridge():
    """ミニプレイヤー起動時に現在の状態を取得する用"""
    return CURRENT_PLAYBACK_STATE

@eel.expose
def control_from_mini(action, data=None):
    """ミニプレイヤーからの操作をすべてのウィンドウ（メインウィンドウ）に転送する"""
    try:
        # すべてのウィンドウに対して receive_control_from_mini を実行
        eel.receive_control_from_mini(action, data)()
    except Exception as e:
        print(f"Control Bridge Error: {e}")

@eel.expose
def update_playlist_by_id(pl_id, field, value):
    """プレイリストのマスター情報（名前、ソート順など）を更新、musicフィールドの場合は個別JSONを更新"""
    master = load_playlist_master()
    pl = next((p for p in master if p.get('id') == pl_id), None)
    if not pl: return None
    
    if field == 'music':
        # 通常プレイリストの楽曲リスト更新
        if pl.get('type') != 'smart':
            songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
            with open(songs_path, 'w', encoding='utf-8') as f:
                json.dump(value, f, indent=4, ensure_ascii=False)
    else:
        # 基本情報の更新
        pl[field] = value
        save_playlist_master(master)
        
    return get_playlist_details(pl_id)
    
@eel.expose
def delete_playlist_by_id(pl_id):
    """プレイリストの削除"""
    master = load_playlist_master()
    new_master = [p for p in master if p.get('id') != pl_id]
    
    if len(master) != len(new_master):
        save_playlist_master(new_master)
        # 個別JSONファイルがあれば削除
        songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
        if os.path.exists(songs_path):
            try: os.remove(songs_path)
            except: pass
        return True
    return False

@eel.expose
def duplicate_playlist_by_id(pl_id):
    """プレイリストの複製"""
    master = load_playlist_master()
    src_pl = next((p for p in master if p.get('id') == pl_id), None)
    if not src_pl: return None
    
    new_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))
    new_pl = copy.deepcopy(src_pl)
    new_pl['id'] = new_id
    new_pl['playlistName'] = f"{src_pl.get('playlistName', 'Untitled')} - コピー"
    
    # 通常プレイリストの場合は楽曲リストも複製
    if src_pl.get('type') != 'smart':
        src_songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
        dst_songs_path = os.path.join(PLAYLIST_DIR, f"{new_id}.json")
        if os.path.exists(src_songs_path):
            shutil.copy2(src_songs_path, dst_songs_path)
        else:
            with open(dst_songs_path, 'w', encoding='utf-8') as f:
                json.dump([], f, indent=4, ensure_ascii=False)
                
    master.append(new_pl)
    save_playlist_master(master)
    
    return get_playlist_details(new_id)
    
@eel.expose
def scan_mp3_zip(zip_path, password=None):
    """
    ZIP内のMP3をスキャンし、タグ情報とアルバムアート、歌詞を取得して返す。
    進捗表示を「展開」と「解析」の2段階で行う。
    """
    import tempfile
    if not os.path.exists(zip_path):
        return {'status': 'error', 'message': 'ファイルが見つかりません。'}

    pwd_bytes = password.encode('utf-8') if password else None
    temp_dir = tempfile.mkdtemp()

    try:
        with pyzipper.AESZipFile(zip_path, 'r') as zf:
            # 1. 展開フェーズ
            all_files = zf.infolist()
            total_files_in_zip = len(all_files)
            
            for i, member in enumerate(all_files):
                # 進捗通知: 展開中
                try:
                    # 全体の50%までを展開フェーズとして表示
                    progress_val = int((i + 1) / total_files_in_zip * 100)
                    eel.js_import_progress(i + 1, total_files_in_zip, f"ZIPを展開中... {i+1} / {total_files_in_zip}")()
                    # 負荷軽減とUI更新のためのsleep
                    if i % 5 == 0 or i == total_files_in_zip - 1:
                        eel.sleep(0.001)
                except: pass

                try:
                    zf.extract(member, temp_dir, pwd=pwd_bytes)
                except Exception as e:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    if 'password' in str(e).lower() or 'bad password' in str(e).lower():
                        return {'status': 'password_required'}
                    return {'status': 'error', 'message': f'ZIP展開エラー: {str(e)}'}

        # 2. 解析フェーズ
        result_list = []
        id_counter = 1
        config = load_settings()
        active_tags = config.get('Tags', 'active_tags').split(',')

        # 解析対象のMP3リストを作成
        mp3_files = []
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.lower().endswith('.mp3'):
                    mp3_files.append(os.path.join(root, file))
                    
        total_mp3 = len(mp3_files)
        if total_mp3 == 0:
            return {'status': 'error', 'message': 'ZIP内にMP3ファイルが見つかりませんでした。'}

        for i, full_path in enumerate(mp3_files):
            # 進捗通知: 解析中
            try:
                eel.js_import_progress(i + 1, total_mp3, f"楽曲情報を解析中... {i+1} / {total_mp3}")()
                # UIフリーズ防止
                eel.sleep(0.001)
            except: pass

            rel_path = os.path.relpath(full_path, temp_dir)
            item = {
                'id': id_counter,
                'temp_path': full_path,
                'rel_path': rel_path,
                'status': 'ok',
                'lyric': '',
                'artwork_base64': ''
            }
            
            try:
                audio = MP3(full_path, ID3=ID3)
                if audio.tags:
                    for key, tag_def in TAG_MAP.items():
                        frame = audio.tags.get(tag_def['id3'].__name__)
                        if frame:
                            item[key] = frame.text[0] if hasattr(frame, 'text') and frame.text else str(frame)
                        else:
                            item[key] = ""
                    
                    uslt = audio.tags.getall('USLT')
                    if uslt:
                        item['lyric'] = uslt[0].text.replace('\r\n', '\n').replace('\r', '\n')
                    
                    apic = audio.tags.getall('APIC')
                    if apic:
                        img_data = apic[0].data
                        encoded = base64.b64encode(img_data).decode('utf-8')
                        mime = apic[0].mime
                        item['artwork_base64'] = f"data:{mime};base64,{encoded}"
            except Exception:
                pass

            if not item.get('title') or not item.get('artist'):
                item['status'] = 'missing_meta'
            
            result_list.append(item)
            id_counter += 1

        return {
            'status': 'success',
            'data': result_list,
            'temp_dir': temp_dir,
            'active_tags': active_tags
        }

    except Exception as e:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        return {'status': 'error', 'message': str(e)}
    
@eel.expose
def scan_mp3_zip_from_data(base64_zip, password=None):
    """
    JavaScriptから送られたBase64形式のZIPデータを一時ファイルとして保存し、スキャンを実行する。
    """
    try:
        # Base64ヘッダーの除去
        if ',' in base64_zip:
            base64_zip = base64_zip.split(',')[1]
        
        zip_bytes = base64.b64decode(base64_zip)
        
        # 一時ファイルとして保存
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip:
            temp_zip.write(zip_bytes)
            temp_zip_path = temp_zip.name
            
        # 既存のスキャン関数を呼び出し
        result = scan_mp3_zip(temp_zip_path, password)
        
        # 解析が終わったら一時ZIPファイルを削除 (展開されたtemp_dirはscan_mp3_zip側で管理)
        try:
            os.remove(temp_zip_path)
        except:
            pass
            
        return result
    except Exception as e:
        return {'status': 'error', 'message': f'データの処理に失敗しました: {str(e)}'}

@eel.expose
def execute_mp3_zip_import(import_data_list, temp_dir):
    logs =[]
    success_count = 0
    total_count = len(import_data_list)
    current_db = load_db()
    lyrics_data = {}
    if os.path.exists(LYRIC_DB_PATH):
        try:
            with open(LYRIC_DB_PATH, 'r', encoding='utf-8') as f: 
                lyrics_data = json.load(f)
        except: pass

    try:
        for i, item in enumerate(import_data_list):
            # ★ 進捗通知とブロック防止
            try:
                eel.js_import_progress(i + 1, total_count, f"楽曲を登録中... {i+1} / {total_count}")()
                if i % 2 == 0 or i == total_count - 1:
                    eel.sleep(0.001)
            except: pass

            src_path = item.get('temp_path')
            title = item.get('title', 'Unknown')
            
            try:
                if not os.path.exists(src_path):
                    logs.append({'status': 'error', 'message': f'ファイル消失: {item.get("rel_path")}'})
                    continue

                file_id = generate_file_id()
                ext = os.path.splitext(src_path)[1]
                new_music_filename = f"{file_id}{ext}"
                
                dst_music_abs = os.path.join(MUSIC_DIR, new_music_filename)
                
                # 1. アルバムアート抽出
                img_path_abs = ""
                try:
                    src_audio = MP3(src_path, ID3=ID3)
                    if src_audio.tags:
                        apic_frames = src_audio.tags.getall('APIC')
                        if apic_frames:
                            apic = apic_frames[0]
                            img_ext = ".png"
                            if apic.mime in ['image/jpeg', 'image/jpg']: img_ext = ".jpg"
                            new_image_filename = f"{file_id}{img_ext}"
                            
                            dst_image_abs = os.path.join(IMAGE_DIR, new_image_filename)
                            with open(dst_image_abs, 'wb') as img_f:
                                img_f.write(apic.data)
                            img_path_abs = dst_image_abs
                except Exception as e:
                    print(f"Art Error: {e}")

                if not img_path_abs:
                    default_img = os.path.join(IMAGE_DIR, "default.png")
                    if os.path.exists(default_img):
                        img_path_abs = os.path.abspath(default_img)

                # 2. コピー
                shutil.copy2(src_path, dst_music_abs)
                
                # 3. タグ再構築
                try:
                    audio = MP3(dst_music_abs)
                    audio.delete() 
                    audio.save()
                    audio = MP3(dst_music_abs)
                    if audio.tags is None: audio.add_tags()
                    
                    for key, val in item.items():
                        if key in TAG_MAP and val:
                            audio.tags.add(TAG_MAP[key]['id3'](encoding=3, text=str(val)))
                    
                    lyric = item.get('lyric', '')
                    if lyric:
                        audio.tags.setall('USLT',[USLT(encoding=3, lang='eng', desc='', text=str(lyric))])
                    
                    if img_path_abs and os.path.exists(img_path_abs):
                        mime_type = 'image/jpeg' if img_path_abs.lower().endswith('.jpg') else 'image/png'
                        with open(img_path_abs, 'rb') as f:
                            audio.tags.add(APIC(encoding=3, mime=mime_type, type=3, desc='Cover', data=f.read()))
                    
                    audio.save()
                    
                    db_entry = {
                        "musicFilename": make_relative_path(dst_music_abs),
                        "imageFilename": make_relative_path(img_path_abs),
                        "lyric": lyric
                    }
                    for key in TAG_MAP.keys():
                        db_entry[key] = item.get(key, '')
                    current_db.append(db_entry)
                    
                    if lyric: lyrics_data[new_music_filename] = lyric
                    success_count += 1
                    
                except Exception as e:
                    logs.append({'status': 'error', 'message': f'タグエラー {title}: {e}'})
                    if os.path.exists(dst_music_abs): os.remove(dst_music_abs)

            except Exception as e:
                logs.append({'status': 'error', 'message': f'処理エラー {title}: {e}'})

        save_db(current_db)
        try:
            with open(LYRIC_DB_PATH, 'w', encoding='utf-8') as f: json.dump(lyrics_data, f, indent=4, ensure_ascii=False)
        except: pass
        try: shutil.rmtree(temp_dir, ignore_errors=True)
        except: pass

        return {'status': 'success', 'count': success_count, 'total': total_count, 'logs': logs}

    except Exception as e:
        return {'status': 'fatal_error', 'message': str(e)}
    
@eel.expose
def select_zip_file_dialog():
    """ZIPファイル選択ダイアログを開き、パスを返す"""
    root = tkinter.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    file_path = tkinter.filedialog.askopenfilename(
        title="MP3を含むZIPファイルを選択",
        filetypes=[("ZIP files", "*.zip")]
    )
    root.destroy()
    return file_path

@eel.expose
def delete_multiple_songs(basenames):
    """選択された複数の楽曲を削除する"""
    try:
        db = load_db()
        targets = set(basenames) # ファイル名のセット
        new_db = []
        deleted_count = 0
        
        for item in db:
            fname = os.path.basename(item.get('musicFilename', ''))
            if fname in targets:
                m = resolve_db_path(item.get('musicFilename', ''))
                img = resolve_db_path(item.get('imageFilename', ''))
                
                if m and os.path.exists(m):
                    try: os.remove(m)
                    except: pass
                if img and os.path.exists(img):
                    # デフォルト画像は削除しない
                    if "default.png" not in os.path.basename(img).lower():
                        try: os.remove(img)
                        except: pass
                deleted_count += 1
            else:
                new_db.append(item)
        
        save_db(new_db)
        return {'success': True, 'count': deleted_count}
    except Exception as e:
        print(f"Bulk Delete Error: {e}")
        return {'success': False, 'message': str(e)}

@eel.expose
def update_multiple_songs(basenames, updates):
    """選択された複数の楽曲タグを一括更新する"""
    try:
        db = load_db()
        target_names = set(basenames)
        updated_count = 0
        
        # "< 維持 >" は更新対象外とする
        real_updates = {k: v for k, v in updates.items() if v != "< 維持 >"}
        
        if not real_updates:
            return {'success': True, 'count': 0}

        target_items = []
        for item in db:
            if os.path.basename(item.get('musicFilename', '')) in target_names:
                for k, v in real_updates.items():
                    item[k] = v
                target_items.append(item)
                updated_count += 1
        
        if updated_count > 0:
            save_db(db)
            # 各ファイルのID3タグも更新
            for item in target_items:
                path = resolve_db_path(item.get('musicFilename'))
                if path and os.path.exists(path) and path.lower().endswith('.mp3'):
                    try:
                        audio = MP3(path)
                        if audio.tags is None: audio.add_tags()
                        for k, t_def in TAG_MAP.items():
                            if k in real_updates:
                                audio.tags.add(t_def['id3'](encoding=3, text=str(real_updates[k])))
                        audio.save()
                    except: pass
        return {'success': True, 'count': updated_count}
    except Exception as e:
        print(f"Bulk Update Error: {e}")
        return {'success': False, 'message': str(e)}

@eel.expose
def get_common_values_for_selected(selected_basenames):
    db = load_db()
    # selected_basenames はファイル名のみ（例: 'xxx.mp3'）
    selected_basenames = set(selected_basenames)
    
    selected_items = [
        item for item in db 
        if os.path.basename(item.get('musicFilename', '')) in selected_basenames
    ]
    
    print(f"\n[DEBUG] 検索されたbasenameリスト: {selected_basenames}")
    print(f"[DEBUG] 抽出された楽曲数: {len(selected_items)}")
    
    if not selected_items:
        return {}

    common_values = {}
    all_keys = list(TAG_MAP.keys()) + ['lyric']
    
    for key in all_keys:
        first_val = selected_items[0].get(key, "")
        is_common = True
        for item in selected_items[1:]:
            if item.get(key, "") != first_val:
                is_common = False
                break
        common_values[key] = first_val if is_common else "__KEEP__"
            
    return common_values

@eel.expose
def open_player_window():
    """プレイヤー画面（player.html）を新規ウィンドウで開く"""
    # メインウィンドウとは別のサイズを指定可能です
    pass

# --- Bottle Route ---
@bottle.route('/get_image/<filename>')
def server_static_image_eel(filename):
    return bottle.static_file(filename, root=IMAGE_DIR)

@bottle.route('/stream_music/<filename>')
def server_static_music_eel(filename):
    return bottle.static_file(filename, root=MUSIC_DIR)

@eel.expose
def check_tools_status():
    """拡張機能（yt-dlp, ffmpeg, deno）のインストール状態を確認する"""
    tools = ['yt-dlp', 'ffmpeg', 'deno']
    status = {}
    for tool in tools:
        ext = ".exe"
        tool_file = f"{tool}{ext}"
        path = os.path.join(BIN_DIR, tool_file)
        status[tool] = os.path.exists(path)
    return status

@eel.expose
def convert_smart_to_normal_and_remove_songs(pl_id, filenames):
    """スマートプレイリストを通常に変換し、指定された楽曲を削除する"""
    master = load_playlist_master()
    pl = next((p for p in master if p.get('id') == pl_id), None)
    if not pl: return None
    
    # スマートプレイリストとしての現在の楽曲リストを取得
    raw_db = load_db()
    current_music = []
    if 'conditions' in pl:
        for song in raw_db:
            if evaluate_smart_rules(song, pl['conditions']):
                current_music.append(os.path.basename(song.get('musicFilename', '')))
                
    # 変換とメタ更新
    pl['type'] = 'normal'
    if 'conditions' in pl:
        del pl['conditions']
    save_playlist_master(master)
    
    # 削除と個別JSONへの保存
    new_music = [m for m in current_music if m not in filenames]
    songs_path = os.path.join(PLAYLIST_DIR, f"{pl_id}.json")
    with open(songs_path, 'w', encoding='utf-8') as f:
        json.dump(new_music, f, indent=4, ensure_ascii=False)
        
    return get_playlist_details(pl_id)

@eel.expose
def update_smart_playlist(pl_id, name, conditions):
    """既存のスマートプレイリストのルールと名前を更新"""
    master = load_playlist_master()
    pl = next((p for p in master if p.get('id') == pl_id), None)
    if not pl: return None
    
    pl['playlistName'] = name
    pl['conditions'] = conditions
    save_playlist_master(master)
    
    return get_playlist_details(pl_id)

@eel.expose
def install_tool(tool_name):
    """指定された拡張機能をダウンロード・解凍して配置し、バージョンを記録する（進捗通知対応）"""
    try:
        urls = {
            'yt-dlp': "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
            'deno': "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip",
            'ffmpeg': "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
        }
        repos = {
            'yt-dlp': 'yt-dlp/yt-dlp',
            'deno': 'denoland/deno',
            'ffmpeg': 'BtbN/FFmpeg-Builds'
        }
        
        if tool_name not in urls:
            return {"success": False, "message": "不明なツール名です。"}
            
        download_url = urls[tool_name]
        is_zip = download_url.endswith('.zip')
        file_name = f"{tool_name}.zip" if is_zip else f"{tool_name}.exe"
        download_path = os.path.join(BIN_DIR, file_name)
        
        req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        
        with urllib.request.urlopen(req) as response, open(download_path, 'wb') as out_file:
            total_size = int(response.info().get('Content-Length', 0))
            downloaded = 0
            chunk_size = 1024 * 64 # 64KB
            
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)
                
                try:
                    eel.update_ext_download_progress(tool_name, downloaded, total_size)()
                except:
                    pass

        if is_zip:
            try:
                eel.update_ext_download_progress(tool_name, "extracting", 0)()
            except:
                pass
                
            extract_dir = os.path.join(BIN_DIR, f"temp_{tool_name}")
            with zipfile.ZipFile(download_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            exe_found = False
            for root, dirs, files in os.walk(extract_dir):
                for file in files:
                    if file.lower() == f"{tool_name}.exe":
                        shutil.copy2(os.path.join(root, file), os.path.join(BIN_DIR, f"{tool_name}.exe"))
                        exe_found = True
                        break
                if exe_found:
                    break
            
            try:
                os.remove(download_path)
                shutil.rmtree(extract_dir)
            except:
                pass
                
            if not exe_found:
                return {"success": False, "message": "ZIP内に実行ファイルが見つかりませんでした。"}
                
        # --- 最新バージョンタグを json に記録 ---
        latest_tag = get_latest_github_tag(repos[tool_name])
        if latest_tag:
            try:
                with open(TOOL_VERSIONS_PATH, 'r', encoding='utf-8') as f:
                    local_versions = json.load(f)
            except:
                local_versions = {}
                
            local_versions[tool_name] = latest_tag
            
            with open(TOOL_VERSIONS_PATH, 'w', encoding='utf-8') as f:
                json.dump(local_versions, f, indent=4, ensure_ascii=False)

        return {"success": True}
        
    except urllib.error.URLError as e:
        return {"success": False, "message": f"通信エラー: {e.reason}"}
    except Exception as e:
        return {"success": False, "message": str(e)}
    
def get_latest_github_tag(repo):
    """GitHub APIを叩いて最新リリースのタグ名を取得する"""
    import urllib.request, json
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Chordia)'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('tag_name', '')
    except Exception as e:
        print(f"GitHub API Error for {repo}: {e}")
        return ""
    
@eel.expose
def check_tool_updates():
    """インストールされているツールとGitHubの最新版を比較する"""
    repos = {
        'yt-dlp': 'yt-dlp/yt-dlp',
        'deno': 'denoland/deno',
        'ffmpeg': 'BtbN/FFmpeg-Builds'
    }
    
    try:
        with open(TOOL_VERSIONS_PATH, 'r', encoding='utf-8') as f:
            local_versions = json.load(f)
    except:
        local_versions = {}
        
    results = {}
    for tool, repo in repos.items():
        latest_tag = get_latest_github_tag(repo)
        local_tag = local_versions.get(tool, "")
        
        if not latest_tag:
            update_needed = False  # API取得失敗時は一旦不要とする
        elif not local_tag:
            update_needed = True   # ローカル記録がない場合はアップデート推奨
        else:
            update_needed = (latest_tag != local_tag)
            
        results[tool] = {
            'update_needed': update_needed,
            'local_version': local_tag or "不明",
            'latest_version': latest_tag or "取得失敗"
        }
    return results

@eel.expose
def get_playback_history():
    """保存されている再生履歴（history.json）を返す（新しい順）"""
    if not os.path.exists(HISTORY_PATH):
        return []
    try:
        with open(HISTORY_PATH, 'r', encoding='utf-8') as f:
            history = json.load(f)
        # リストを逆順にして最新が上に来るようにする
        return history[::-1]
    except:
        return []

@eel.expose
def get_default_export_path():
    """エクスポートのデフォルト保存先としてデスクトップのパスを返す"""
    try:
        return os.path.join(os.path.expanduser("~"), "Desktop", "Chordia_Export.zip")
    except Exception:
        return ""

@eel.expose
def ask_save_path(current_path):
    """保存先選択ダイアログを開いてパスを返す"""
    root = tkinter.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    
    initial_dir = ""
    initial_file = "Chordia_Export.zip"
    if current_path:
        initial_dir = os.path.dirname(current_path)
        initial_file = os.path.basename(current_path)

    file_path = filedialog.asksaveasfilename(
        title="エクスポートファイルの保存先を選択",
        initialdir=initial_dir,
        initialfile=initial_file,
        defaultextension=".zip",
        filetypes=[("ZIP files", "*.zip")]
    )
    root.destroy()
    return file_path

@eel.expose
def execute_export(targets, save_path, password=None):
    """
    指定された項目をZIPに固めてエクスポートする。
    パスワードが指定された場合は pyzipper を使用して暗号化する。
    """
    try:
        def add_dir_to_zip(zip_handle, folder_path, arc_prefix):
            if not os.path.exists(folder_path):
                return
            for root, _, files in os.walk(folder_path):
                for file in files:
                    full_path = os.path.join(root, file)
                    arc_path = os.path.join(arc_prefix, os.path.relpath(full_path, folder_path))
                    zip_handle.write(full_path, arc_path)

        pwd_bytes = password.encode('utf-8') if password else None

        # pyzipperを使ってZIPを作成（パスワード対応）
        with pyzipper.AESZipFile(save_path, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES if pwd_bytes else None) as zf:
            if pwd_bytes:
                zf.setpassword(pwd_bytes)

            # 楽曲ファイル
            if targets.get('music'):
                add_dir_to_zip(zf, MUSIC_DIR, "library/music")
            
            # アルバムアート
            if targets.get('images'):
                add_dir_to_zip(zf, IMAGE_DIR, "library/images")
            
            # データベース (music.json と lyric.json)
            if targets.get('db'):
                if os.path.exists(DB_PATH):
                    zf.write(DB_PATH, "userfiles/music.json")
                if os.path.exists(LYRIC_DB_PATH):
                    zf.write(LYRIC_DB_PATH, "userfiles/lyric.json")

            # 設定ファイル (settings.ini)
            if targets.get('settings'):
                if os.path.exists(SETTINGS_PATH):
                    zf.write(SETTINGS_PATH, "userfiles/settings.ini")

            # プレイリストなど (userfiles/playlist フォルダごと)
            if targets.get('playlists'):
                if os.path.exists(PLAYLIST_DIR):
                    add_dir_to_zip(zf, PLAYLIST_DIR, "userfiles/playlist")

        return {'success': True, 'path': save_path}

    except Exception as e:
        print(f"Export Error: {e}")
        return {'success': False, 'message': str(e)}

def _match_search(item, query):
    """検索クエリが楽曲の主要なタグに含まれているか判定する"""
    q = query.lower()
    search_keys = ['title', 'artist', 'album', 'genre', 'year', 'composer']
    for k in search_keys:
        if q in str(item.get(k, '')).lower():
            return True
    return False

def _match_advanced_search(item, rule_item):
    """
    高度な検索のルール（再帰構造）を楽曲データに対して評価する
    rule_item: { 'type': 'group', 'match': 'all'/'any', 'items': [...] } 
               or { 'type': 'filter', 'tag': '...', 'op': '...', 'val': '...' }
    """
    if not rule_item:
        return True

    if rule_item['type'] == 'group':
        match_type = rule_item.get('match', 'all')
        sub_items = rule_item.get('items', [])
        if not sub_items:
            return True
        
        results = [_match_advanced_search(item, child) for child in sub_items]
        return all(results) if match_type == 'all' else any(results)
    
    elif rule_item['type'] == 'filter':
        tag = rule_item['tag']
        op = rule_item['op']
        target_val = rule_item['val']
        
        # 楽曲側の値を取得 (歌詞にも対応)
        song_val = str(item.get(tag, '')).lower()
        
        # 数値系タグの判定
        if tag in ['track', 'year', 'disc', 'bpm']:
            try:
                s_num = float(item.get(tag, 0)) if str(item.get(tag, '')).strip() else 0
                if op == 'range':
                    return float(target_val[0]) <= s_num <= float(target_val[1])
                
                v_num = float(target_val)
                if op == 'equals': return s_num == v_num
                if op == 'not_equals': return s_num != v_num
                if op == 'greater': return s_num > v_num
                if op == 'less': return s_num < v_num
            except:
                return False
        
        # 文字列系タグの判定
        target_str = str(target_val).lower()
        if op == 'contains': return target_str in song_val
        if op == 'not_contains': return target_str not in song_val
        if op == 'equals': return song_val == target_str
        if op == 'not_equals': return song_val != target_str
        if op == 'startswith': return song_val.startswith(target_str)
        if op == 'endswith': return song_val.endswith(target_str)
        
    return False

def on_close(page, sockets):
    """
    ウィンドウが閉じられたときに呼ばれるコールバック。
    """
    global IS_MINI_PLAYER_OPEN
    if 'mini_player.html' in page:
        IS_MINI_PLAYER_OPEN = False

    def monitor_websockets():
        import time
        for _ in range(10): 
            time.sleep(0.5)
            if eel._websockets: 
                return 
        import os
        os._exit(0)

    import threading
    monitoring_thread = threading.Thread(target=monitor_websockets)
    monitoring_thread.daemon = True
    monitoring_thread.start()

if __name__ == '__main__':
    # Flaskサーバーをデーモンスレッドとして起動
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True 
    flask_thread.start()
    
    ensure_default_image()
    
    # Eelの初期化
    eel.init(resource_path('app'))
    
    try:
        # shutdown_delayを長めに設定（Eel自体の終了保護）
        # close_callbackで独自のスレッド監視を実行
        eel.start('index.html', 
                  size=(1200, 900), 
                  port=0, 
                  shutdown_delay=5.0, 
                  close_callback=on_close)
    except (SystemExit, KeyboardInterrupt):
        import os
        os._exit(0)

