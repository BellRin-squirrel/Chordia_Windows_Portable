#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod utils;
mod cmd_core;
mod cmd_db;
mod cmd_player;

use std::sync::Mutex;
use crate::models::AppState;
use crate::utils::load_db;

fn main() {
    let initial_db = load_db();

    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(initial_db),
            playback_state: Mutex::new(serde_json::json!({})),
            is_mini_player_open: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            crate::cmd_core::open_new_window,
            crate::cmd_core::get_app_settings,
            crate::cmd_core::save_app_settings,
            crate::cmd_core::get_custom_themes,
            crate::cmd_core::save_custom_theme,
            crate::cmd_core::delete_custom_theme,
            crate::cmd_core::get_default_art_url,
            crate::cmd_core::update_default_artwork,
            crate::cmd_core::reset_default_artwork,
            crate::cmd_core::resolve_path,
            crate::cmd_core::open_in_explorer,
            crate::cmd_core::check_tools_status,
            crate::cmd_core::fetch_video_info,
            crate::cmd_core::fetch_youtube_playlist,
            crate::cmd_core::fetch_and_crop_thumbnail,
            crate::cmd_core::fetch_and_crop_image_url,
            crate::cmd_core::extract_artwork_from_local_file,
            crate::cmd_core::download_original_thumbnail,
            crate::cmd_core::download_and_save_music,
            crate::cmd_core::get_default_export_path,
            crate::cmd_core::ask_save_path,
            crate::cmd_core::execute_export,
            crate::cmd_core::parse_list_import,
            crate::cmd_core::check_import_duplicates,
            crate::cmd_core::execute_final_list_import,
            crate::cmd_core::scan_mp3_zip_from_data,

            crate::cmd_db::get_available_tags,
            crate::cmd_db::get_library_data_with_meta,
            crate::cmd_db::get_album_list,
            crate::cmd_db::get_artist_list,
            crate::cmd_db::get_virtual_playlist_details,
            crate::cmd_db::get_library_count,
            crate::cmd_db::get_library_chunk,
            crate::cmd_db::update_song_by_id,
            crate::cmd_db::update_song_artwork_by_id,
            crate::cmd_db::delete_song_by_id,
            crate::cmd_db::update_multiple_songs,
            crate::cmd_db::delete_multiple_songs,
            crate::cmd_db::convert_smart_to_normal_and_remove_songs,
            crate::cmd_db::remove_songs_from_playlist,
            crate::cmd_db::duplicate_playlist_by_id,
            crate::cmd_db::delete_playlist_by_id,
            crate::cmd_db::update_playlist_by_id,
            crate::cmd_db::get_common_values_for_selected,
            crate::cmd_db::get_autocomplete_lists,
            crate::cmd_db::check_duplicate_songs,

            crate::cmd_player::record_playback,
            crate::cmd_player::get_playback_history,
            crate::cmd_player::update_playback_state_bridge,
            crate::cmd_player::get_playback_state_bridge,
            crate::cmd_player::set_mini_player_open,
            crate::cmd_player::control_from_mini,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}