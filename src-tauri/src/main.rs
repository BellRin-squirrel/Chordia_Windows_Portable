#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod utils;
mod commands;

use std::sync::Mutex;
use tauri::Manager;
use utils::{load_db, load_playlists_master};

pub struct AppState {
    pub db: Mutex<Vec<serde_json::Map<String, serde_json::Value>>>,
    pub playlists: Mutex<Vec<serde_json::Value>>,
}

fn main() {
    let initial_db = load_db();
    let initial_playlists = load_playlists_master();

    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(initial_db),
            playlists: Mutex::new(initial_playlists),
        })
        .setup(|app| {
            app.get_webview_window("main").unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // --- 全般 ---
            commands::open_new_window,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::get_custom_themes,
            commands::save_custom_theme,
            commands::delete_custom_theme,
            
            // --- 追加・アートワーク ---
            commands::get_default_art_url,
            commands::update_default_artwork,
            commands::reset_default_artwork,
            commands::get_available_tags,
            commands::get_autocomplete_lists,
            commands::check_duplicate_songs,
            commands::save_music_data, // ★追加
            commands::download_and_save_music,
            commands::check_tools_status,
            commands::fetch_video_info,
            commands::fetch_youtube_playlist,
            commands::fetch_and_crop_thumbnail,
            commands::fetch_and_crop_image_url,
            commands::extract_artwork_from_local_file,
            commands::download_original_thumbnail,
            commands::search_lyrics_online,
            
            // --- プレイリスト関連 ---
            commands::get_playlist_summaries,
            commands::get_playlist_details,
            commands::get_album_list,
            commands::get_artist_list,
            commands::get_virtual_playlist_details,
            commands::create_playlist,
            commands::update_playlist_by_id,
            commands::delete_playlist_by_id,
            commands::duplicate_playlist_by_id,
            commands::add_songs_to_playlist,
            commands::remove_songs_from_playlist,
            commands::create_smart_playlist,
            commands::update_smart_playlist,
            commands::convert_smart_to_normal_and_remove_songs,
            
            // --- 管理画面系 ---
            commands::get_library_count,
            commands::get_library_chunk,
            commands::update_song_by_id,
            commands::update_song_artwork_by_id,
            commands::delete_song_by_id,
            commands::get_common_values_for_selected,
            commands::update_multiple_songs,
            commands::delete_multiple_songs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}