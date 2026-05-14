use crate::models::*;
use crate::utils::*;
use tauri::{AppHandle, State, Emitter};
use serde_json::Value;
use std::fs;
use chrono::Local;

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