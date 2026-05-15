use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub items_per_page: i32,
    pub open_player_new_window: bool,
    pub open_manage_new_window: bool,
    pub developer_mode: bool,
    pub lazy_load_playlists: bool,
    pub primary_color: String,
    pub background_color: String,
    pub sub_background_color: String,
    pub text_color: String,
    pub theme_mode: String,
    pub active_tags: Vec<String>,
    pub player_visible_tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    pub id: Option<i32>,
    pub status: Option<String>,
    pub music_filename: Option<String>,
    pub image_filename: Option<String>,
    pub lyric: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub track: Option<String>,
    pub year: Option<String>,
    pub album_artist: Option<String>,
    pub disc: Option<String>,
    pub bpm: Option<String>,
    pub composer: Option<String>,
    pub comment: Option<String>,
    pub artwork_base64: Option<String>,
    pub temp_path: Option<String>,
    pub rel_path: Option<String>,
}

// ★ 警告を抑制するためのアトリビュートを追加
#[allow(dead_code)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUpdateInfo {
    pub update_needed: bool,
    pub local_version: String,
    pub latest_version: String,
}

#[derive(Serialize)]
pub struct TagInfo { pub key: String, pub label: String }

#[allow(dead_code)] // オートコンプリート用構造体にも念のため追加
#[derive(Serialize)]
pub struct AutocompleteLists { pub title: Vec<String>, pub artist: Vec<String>, pub album: Vec<String> }

#[allow(dead_code)] // 重複チェック用構造体にも念のため追加
#[derive(Serialize)]
pub struct DuplicateSong {
    pub title: String, pub artist: String, pub album: String, pub filename: String,
    #[serde(rename = "imageData")] pub image_data: String,
}

pub struct AppState {
    pub db: Mutex<Vec<serde_json::Map<String, Value>>>,
    pub playlists: Mutex<Vec<Value>>,
    pub playback_state: Mutex<Value>,
    pub is_mini_player_open: Mutex<bool>,
}