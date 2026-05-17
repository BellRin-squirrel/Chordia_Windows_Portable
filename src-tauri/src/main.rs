#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod utils;
mod cmd_window;
mod cmd_settings;
mod cmd_add_music;
mod cmd_playlist;
mod cmd_library;
mod cmd_history;

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
            let _window = app.get_webview_window("main").unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_window::open_new_window,
            cmd_window::set_mini_player_mode,
            cmd_window::close_mini_player,
            cmd_window::make_window_square,
            
            cmd_settings::get_app_settings,
            cmd_settings::save_app_settings,
            cmd_settings::get_custom_themes,
            cmd_settings::save_custom_theme,
            cmd_settings::delete_custom_theme,
            
            cmd_add_music::get_default_art_url,
            cmd_add_music::update_default_artwork,
            cmd_add_music::reset_default_artwork,
            cmd_add_music::get_available_tags,
            cmd_add_music::get_autocomplete_lists,
            cmd_add_music::check_duplicate_songs,
            cmd_add_music::save_music_data,
            cmd_add_music::download_and_save_music,
            cmd_add_music::check_tools_status,
            cmd_add_music::fetch_video_info,
            cmd_add_music::fetch_youtube_playlist,
            cmd_add_music::fetch_and_crop_thumbnail,
            cmd_add_music::fetch_and_crop_image_url,
            cmd_add_music::extract_artwork_from_local_file,
            cmd_add_music::download_original_thumbnail,
            cmd_add_music::search_lyrics_online,

            cmd_playlist::get_playlist_summaries,
            cmd_playlist::get_playlist_details,
            cmd_playlist::get_album_list,
            cmd_playlist::get_artist_list,
            cmd_playlist::get_virtual_playlist_details,
            cmd_playlist::create_playlist,
            cmd_playlist::update_playlist_by_id,
            cmd_playlist::delete_playlist_by_id,
            cmd_playlist::duplicate_playlist_by_id,
            cmd_playlist::add_songs_to_playlist,
            cmd_playlist::remove_songs_from_playlist,
            cmd_playlist::create_smart_playlist,
            cmd_playlist::update_smart_playlist,
            cmd_playlist::convert_smart_to_normal_and_remove_songs,
            
            cmd_library::get_library_count,
            cmd_library::get_library_chunk,
            cmd_library::update_song_by_id,
            cmd_library::update_song_artwork_by_id,
            cmd_library::delete_song_by_id,
            cmd_library::get_common_values_for_selected,
            cmd_library::update_multiple_songs,
            cmd_library::delete_multiple_songs,
            
            cmd_history::record_playback,
            cmd_history::get_playback_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}