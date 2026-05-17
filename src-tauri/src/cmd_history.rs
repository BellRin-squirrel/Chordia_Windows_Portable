use serde_json::Value;
use std::fs;
use chrono::Local;

use crate::utils::get_base_dir;

#[tauri::command]
pub fn record_playback(song: Value) {
    let filename = song.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").to_string();
    if filename.is_empty() { return; }
    let base = get_base_dir();
    let pt_path = base.join("userfiles/played_times.json");
    let mut pt: serde_json::Map<String, Value> = fs::read_to_string(&pt_path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let count = pt.get(&filename).and_then(|v| v.as_i64()).unwrap_or(0);
    pt.insert(filename.clone(), (count + 1).into());
    let _ = fs::write(&pt_path, serde_json::to_string_pretty(&pt).unwrap_or_default());
    let h_path = base.join("userfiles/history.json");
    let mut h: Vec<Value> = fs::read_to_string(&h_path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    h.push(serde_json::json!({"title": song.get("title"), "artist": song.get("artist"), "filename": filename, "timestamp": Local::now().format("%Y-%m-%d %H:%M:%S").to_string()}));
    if h.len() > 1000 { h.remove(0); }
    let _ = fs::write(&h_path, serde_json::to_string_pretty(&h).unwrap_or_default());
}

#[tauri::command]
pub fn get_playback_history() -> Vec<Value> {
    let h_path = get_base_dir().join("userfiles/history.json");
    fs::read_to_string(&h_path).ok().and_then(|d| serde_json::from_str::<Vec<Value>>(&d).ok()).map(|mut v| { v.reverse(); v }).unwrap_or_default()
}