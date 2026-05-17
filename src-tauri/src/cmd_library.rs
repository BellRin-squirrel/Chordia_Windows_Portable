use serde_json::Value;
use std::fs;
use rand::{rng, Rng};
use rand::distr::Alphanumeric;
use base64::{Engine as _, engine::general_purpose};
use tauri::State;

use crate::AppState;
use crate::utils::*;

#[tauri::command]
pub fn get_library_count(search_query: String, state: State<'_, AppState>) -> usize {
    let db = state.db.lock().unwrap();
    db.iter().filter(|i| if search_query.is_empty() { true } else { match_search(i, &search_query) }).count()
}

#[tauri::command]
pub fn get_library_chunk(page: usize, limit: usize, sort_field: Option<String>, sort_desc: bool, search_query: String, state: State<'_, AppState>) -> Vec<serde_json::Map<String, Value>> {
    let mut db = state.db.lock().unwrap().clone();
    db.retain(|i| search_query.is_empty() || match_search(i, &search_query));
    if let Some(f) = sort_field {
        db.sort_by(|a, b| {
            let (va, vb) = (a.get(&f).and_then(|v| v.as_str()).unwrap_or("").to_lowercase(), b.get(&f).and_then(|v| v.as_str()).unwrap_or("").to_lowercase());
            let res = if ["track", "disc", "year", "bpm"].contains(&f.as_str()) {
                va.parse::<i32>().unwrap_or(0).cmp(&vb.parse::<i32>().unwrap_or(0))
            } else { va.cmp(&vb) };
            if sort_desc { res.reverse() } else { res }
        });
    }
    if limit > 0 { let start = (page.saturating_sub(1)) * limit; db.into_iter().skip(start).take(limit).collect() } else { db }
}

#[tauri::command]
pub fn update_song_by_id(music_filename: String, field: String, value: String, state: State<'_, AppState>) -> bool {
    let mut db = state.db.lock().unwrap();
    if let Some(i) = db.iter_mut().find(|i| i.get("musicFilename").and_then(|v| v.as_str()) == Some(&music_filename)) {
        if field == "lyric" {
            let clean_val = value.replace("\r\n", "\n").replace("\r", "\n");
            i.insert(field, clean_val.into());
        } else {
            i.insert(field, value.into()); 
        }
        save_db(&db).is_ok()
    } else { false }
}

#[tauri::command]
pub fn update_song_artwork_by_id(music_filename: String, new_art_base64: Option<String>, remove: bool, state: State<'_, AppState>) -> bool {
    let mut db = state.db.lock().unwrap();
    if let Some(target) = db.iter_mut().find(|i| i.get("musicFilename").and_then(|v| v.as_str()) == Some(&music_filename)) {
        if let Some(old) = target.get("imageFilename").and_then(|v| v.as_str()) { if !old.contains("default.png") { let _ = fs::remove_file(get_base_dir().join(old)); } }
        if remove {
            target.insert("imageFilename".into(), "library/images/default.png".into());
            target.insert("imageData".into(), get_asset_url("library/images/default.png").into());
        }
        else if let Some(b64) = new_art_base64 {
            let f_id: String = rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
            let path = format!("library/images/{}.png", f_id);
            let b64c = if b64.contains(',') { b64.split(',').nth(1).unwrap() } else { &b64 };
            if let Ok(bytes) = general_purpose::STANDARD.decode(b64c) {
                if force_save_as_png(&bytes, &get_base_dir().join(&path)) { 
                    target.insert("imageFilename".into(), path.clone().into());
                    target.insert("imageData".into(), get_asset_url(&path).into());
                } else { return false; }
            } else { return false; }
        }
        save_db(&db).is_ok()
    } else { false }
}

#[tauri::command]
pub fn delete_song_by_id(music_filename: String, state: State<'_, AppState>) -> bool {
    let mut db = state.db.lock().unwrap();
    if let Some(pos) = db.iter().position(|i| i.get("musicFilename").and_then(|v| v.as_str()) == Some(&music_filename)) {
        let i = db.remove(pos);
        if let Some(p) = i.get("musicFilename").and_then(|v| v.as_str()) { let _ = fs::remove_file(get_base_dir().join(p)); }
        if let Some(p) = i.get("imageFilename").and_then(|v| v.as_str()) { if !p.contains("default.png") { let _ = fs::remove_file(get_base_dir().join(p)); } }
        save_db(&db).is_ok()
    } else { false }
}

#[tauri::command]
pub fn get_common_values_for_selected(filenames: Vec<String>, state: State<'_, AppState>) -> serde_json::Map<String, Value> {
    let db = state.db.lock().unwrap();
    let sel: Vec<_> = db.iter().filter(|i| filenames.contains(&i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").into())).collect();
    let mut res = serde_json::Map::new();
    if sel.is_empty() { return res; }
    for k in ["title", "artist", "album", "genre", "year", "track", "disc", "bpm", "composer", "comment", "lyric"] {
        let first = sel[0].get(k).and_then(|v| v.as_str()).unwrap_or("");
        res.insert(k.into(), if sel.iter().all(|i| i.get(k).and_then(|v| v.as_str()).unwrap_or("") == first) { first.into() } else { "< 維持 >".into() });
    }
    res
}

#[tauri::command]
pub fn update_multiple_songs(filenames: Vec<String>, updates: serde_json::Map<String, Value>, state: State<'_, AppState>) -> Value {
    let mut db = state.db.lock().unwrap();
    let mut count = 0;
    let up: Vec<_> = updates.into_iter().filter(|(_, v)| v.as_str() != Some("< 維持 >")).collect();
    for i in db.iter_mut() {
        if filenames.contains(&i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").into()) {
            for (k, v) in &up { i.insert(k.clone(), v.clone()); }
            count += 1;
        }
    }
    if count > 0 { let _ = save_db(&db); }
    serde_json::json!({"success": true, "count": count})
}

#[tauri::command]
pub fn delete_multiple_songs(filenames: Vec<String>, state: State<'_, AppState>) -> Value {
    let mut db = state.db.lock().unwrap();
    let mut count = 0;
    db.retain(|i| {
        if filenames.contains(&i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").into()) {
            if let Some(p) = i.get("musicFilename").and_then(|v| v.as_str()) { let _ = fs::remove_file(get_base_dir().join(p)); }
            if let Some(p) = i.get("imageFilename").and_then(|v| v.as_str()) { if !p.contains("default.png") { let _ = fs::remove_file(get_base_dir().join(p)); } }
            count += 1; false
        } else { true }
    });
    if count > 0 { let _ = save_db(&db); }
    serde_json::json!({"success": true, "count": count})
}