use crate::models::*;
use crate::utils::*;
use tauri::{AppHandle, State, Emitter};
use serde_json::Value;
use std::fs;
use std::path::Path;
use rand::{rng, Rng};
use rand::distr::Alphanumeric;
use chrono::Local;

#[tauri::command]
pub fn get_all_playlists(state: State<'_, AppState>) -> Vec<Value> {
    let master = state.playlists.lock().unwrap();
    master.clone()
}

#[tauri::command]
pub fn get_playlist_details(pl_id: String, state: State<'_, AppState>) -> Option<Value> {
    let mut master = state.playlists.lock().unwrap().clone();
    let pl = master.iter_mut().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&pl_id))?;
    let db = state.db.lock().unwrap();
    let is_smart = pl.get("type").and_then(|v| v.as_str()) == Some("smart");
    
    let mut music_list = Vec::new();
    if is_smart {
        if let Some(cond) = pl.get("conditions") {
            for song in db.iter() {
                if evaluate_smart_rules(song, cond) {
                    if let Some(fname) = song.get("musicFilename").and_then(|v| v.as_str()).and_then(|p| Path::new(p).file_name()).and_then(|n| n.to_str()) {
                        music_list.push(Value::String(fname.to_string()));
                    }
                }
            }
        }
    } else {
        let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
        if let Ok(data) = fs::read_to_string(&p_path) {
            if let Ok(arr) = serde_json::from_str::<Vec<Value>>(&data) { music_list = arr; }
        }
    }
    
    let mut songs = Vec::new();
    let mut total_sec = 0;
    for fname_val in &music_list {
        if let Some(fname) = fname_val.as_str() {
            if let Some(song) = db.iter().find(|s| s.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").ends_with(fname)) {
                let mut s_copy = song.clone();
                let dur = get_duration_str(s_copy.get("musicFilename"));
                if let Ok(duration) = mp3_duration::from_path(get_base_dir().join(song.get("musicFilename").and_then(|v| v.as_str()).unwrap_or(""))) {
                    total_sec += duration.as_secs();
                }
                s_copy.insert("duration".into(), Value::String(dur));
                s_copy.insert("imageData".into(), Value::String(get_image_base64(s_copy.get("imageFilename").and_then(|v| v.as_str()).unwrap_or(""))));
                songs.push(Value::Object(s_copy));
            }
        }
    }
    
    let dur_str = if total_sec < 60 { format!("{}秒", total_sec) } else if total_sec < 3600 { format!("{}分", total_sec / 60) } else { format!("{:.1}時間", total_sec as f64 / 3600.0) };
    if let Some(obj) = pl.as_object_mut() {
        obj.insert("music".into(), Value::Array(music_list));
        obj.insert("songs".into(), Value::Array(songs));
        obj.insert("totalDuration".into(), Value::String(dur_str));
    }
    Some(pl.clone())
}

#[tauri::command]
pub fn create_playlist(name: String, pl_type: String, state: State<'_, AppState>) -> Option<Value> {
    let mut master = state.playlists.lock().unwrap();
    let pl_id: String = rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
    let mut new_pl = serde_json::Map::new();
    new_pl.insert("id".into(), Value::String(pl_id.clone()));
    new_pl.insert("playlistName".into(), Value::String(name));
    new_pl.insert("type".into(), Value::String(pl_type.clone()));
    new_pl.insert("sortBy".into(), Value::String("title".into()));
    new_pl.insert("sortDesc".into(), Value::Bool(false));
    
    let _ = fs::create_dir_all(get_base_dir().join("userfiles/playlist"));
    if pl_type == "smart" {
        new_pl.insert("conditions".into(), Value::Array(Vec::new()));
    } else {
        let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
        let _ = fs::write(p_path, "[]");
    }
    master.push(Value::Object(new_pl));
    let _ = save_playlist_master(&master);
    Some(master.last().unwrap().clone())
}

#[tauri::command]
pub fn add_songs_to_playlist(pl_id: String, filenames: Vec<String>) -> Option<Value> {
    let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
    let mut music_list: Vec<String> = fs::read_to_string(&p_path).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or_default();
    for fname in filenames { if !music_list.contains(&fname) { music_list.push(fname); } }
    let _ = fs::write(p_path, serde_json::to_string_pretty(&music_list).unwrap());
    None
}

#[tauri::command]
pub fn create_smart_playlist(name: String, conditions: Value, state: State<'_, AppState>) -> Option<Value> {
    let mut master = state.playlists.lock().unwrap();
    let pl_id: String = rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
    let mut new_pl = serde_json::Map::new();
    new_pl.insert("id".into(), Value::String(pl_id.clone()));
    new_pl.insert("playlistName".into(), Value::String(name));
    new_pl.insert("type".into(), Value::String("smart".into()));
    new_pl.insert("sortBy".into(), Value::String("title".into()));
    new_pl.insert("sortDesc".into(), Value::Bool(false));
    new_pl.insert("conditions".into(), conditions);
    master.push(Value::Object(new_pl));
    let _ = save_playlist_master(&master);
    Some(master.last().unwrap().clone())
}

#[tauri::command]
pub fn update_smart_playlist(pl_id: String, name: String, conditions: Value, state: State<'_, AppState>) -> Option<Value> {
    let mut master = state.playlists.lock().unwrap();
    let mut target = None;
    for p in master.iter_mut() {
        if p.get("id").and_then(|v| v.as_str()) == Some(&pl_id) {
            if let Some(obj) = p.as_object_mut() {
                obj.insert("playlistName".into(), Value::String(name.clone()));
                obj.insert("conditions".into(), conditions.clone());
            }
            target = Some(p.clone());
            break;
        }
    }
    let _ = save_playlist_master(&master);
    target
}

#[tauri::command]
pub fn duplicate_playlist_by_id(pl_id: String, state: State<'_, AppState>) -> Option<Value> {
    let mut master = state.playlists.lock().unwrap();
    if let Some(src) = master.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&pl_id)).cloned() {
        let new_id: String = rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
        let mut new_pl = src.as_object().unwrap().clone();
        new_pl.insert("id".into(), Value::String(new_id.clone()));
        let name = new_pl.get("playlistName").and_then(|v| v.as_str()).unwrap_or("Untitled");
        new_pl.insert("playlistName".into(), Value::String(format!("{} - コピー", name)));
        
        if new_pl.get("type").and_then(|v| v.as_str()) != Some("smart") {
            let src_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
            let dst_path = get_base_dir().join(format!("userfiles/playlist/{}.json", new_id));
            if src_path.exists() { let _ = fs::copy(src_path, dst_path); } else { let _ = fs::write(dst_path, "[]"); }
        }
        master.push(Value::Object(new_pl.clone()));
        let _ = save_playlist_master(&master);
        return Some(Value::Object(new_pl));
    }
    None
}

#[tauri::command]
pub fn delete_playlist_by_id(pl_id: String, state: State<'_, AppState>) -> bool {
    let mut master = state.playlists.lock().unwrap();
    master.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(&pl_id));
    let _ = save_playlist_master(&master);
    let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
    let _ = fs::remove_file(p_path);
    true
}

#[tauri::command]
pub fn update_playlist_by_id(pl_id: String, field: String, value: Value, state: State<'_, AppState>) -> Option<Value> {
    let mut master = state.playlists.lock().unwrap();
    let mut target = None;
    for p in master.iter_mut() {
        if p.get("id").and_then(|v| v.as_str()) == Some(&pl_id) {
            if field == "music" {
                if p.get("type").and_then(|v| v.as_str()) != Some("smart") {
                    let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
                    let _ = fs::write(p_path, serde_json::to_string_pretty(&value).unwrap());
                }
            } else {
                if let Some(obj) = p.as_object_mut() { obj.insert(field.clone(), value.clone()); }
            }
            target = Some(p.clone()); break;
        }
    }
    if field != "music" { let _ = save_playlist_master(&master); }
    target
}

#[tauri::command]
pub fn record_playback(song_data: Value) -> bool {
    let fname = song_data.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("");
    if fname.is_empty() { return false; }
    
    let b = get_base_dir();
    let p_path = b.join("userfiles/played_times.json");
    let h_path = b.join("userfiles/history.json");
    
    let mut counts: serde_json::Map<String, Value> = fs::read_to_string(&p_path).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or_default();
    let c = counts.get(fname).and_then(|v| if v.is_number() { v.as_u64() } else { None }).unwrap_or(0) + 1;
    counts.insert(fname.to_string(), Value::Number(c.into()));
    let _ = fs::write(p_path, serde_json::to_string_pretty(&counts).unwrap());

    let mut history: Vec<Value> = fs::read_to_string(&h_path).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or_default();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    history.push(serde_json::json!({
        "title": song_data.get("title").unwrap_or(&Value::Null),
        "artist": song_data.get("artist").unwrap_or(&Value::Null),
        "filename": fname,
        "timestamp": now
    }));
    if history.len() > 1000 { history.remove(0); }
    let _ = fs::write(h_path, serde_json::to_string_pretty(&history).unwrap());
    true
}

#[tauri::command]
pub fn get_playback_history() -> Vec<Value> {
    let h_path = get_base_dir().join("userfiles/history.json");
    let mut history: Vec<Value> = fs::read_to_string(&h_path).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or_default();
    history.reverse();
    history
}

#[tauri::command]
pub fn update_playback_state_bridge(state_data: Value, app: AppHandle, state: State<'_, AppState>) {
    *state.playback_state.lock().unwrap() = state_data.clone();
    if *state.is_mini_player_open.lock().unwrap() {
        let _ = app.emit("sync_from_python", state_data);
    }
}

#[tauri::command]
pub fn get_playback_state_bridge(state: State<'_, AppState>) -> Value {
    state.playback_state.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_mini_player_open(status: bool, state: State<'_, AppState>) {
    *state.is_mini_player_open.lock().unwrap() = status;
}

#[tauri::command]
pub fn control_from_mini(action: String, data: Value, app: AppHandle) {
    let _ = app.emit("receive_control_from_mini", serde_json::json!({"action": action, "data": data}));
}