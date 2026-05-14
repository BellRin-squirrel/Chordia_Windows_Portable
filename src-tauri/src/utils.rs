use std::path::PathBuf;
use std::fs;
use serde_json::Value;
use base64::{Engine as _, engine::general_purpose};
use image::load_from_memory;

pub fn get_base_dir() -> PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cfg!(debug_assertions) {
        if path.ends_with("src-tauri") {
            path.pop();
        }
    } else {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                return parent.to_path_buf();
            }
        }
    }
    path
}

pub fn load_db() -> Vec<serde_json::Map<String, Value>> {
    let path = get_base_dir().join("userfiles/music.json");
    if !path.exists() { return Vec::new(); }
    let data = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_else(|_| Vec::new())
}

pub fn save_db(db: &Vec<serde_json::Map<String, Value>>) -> Result<(), String> {
    let path = get_base_dir().join("userfiles/music.json");
    let data = serde_json::to_string_pretty(db).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

pub fn load_playlist_master() -> Vec<Value> {
    let path = get_base_dir().join("userfiles/playlist.json");
    fs::read_to_string(&path).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or_default()
}

pub fn save_playlist_master(pl: &Vec<Value>) -> Result<(), String> {
    let path = get_base_dir().join("userfiles/playlist.json");
    fs::write(path, serde_json::to_string_pretty(pl).unwrap()).map_err(|e| e.to_string())
}

pub fn get_image_base64(rel_path: &str) -> String {
    if rel_path.is_empty() { return "".to_string(); }
    let path = get_base_dir().join(rel_path);
    if !path.exists() { return "".to_string(); }
    if let Ok(bytes) = fs::read(&path) {
        let b64 = general_purpose::STANDARD.encode(&bytes);
        return format!("data:image/png;base64,{}", b64);
    }
    "".to_string()
}

pub fn force_save_as_png(image_bytes: &[u8], target_path: &PathBuf) -> bool {
    if let Ok(img) = load_from_memory(image_bytes) {
        let mut final_img = img;
        if final_img.color().has_alpha() {
            let bg = image::RgbaImage::from_pixel(final_img.width(), final_img.height(), image::Rgba([255, 255, 255, 255]));
            let mut bg_dynamic = image::DynamicImage::ImageRgba8(bg);
            let _ = image::imageops::overlay(&mut bg_dynamic, &final_img, 0, 0);
            final_img = bg_dynamic;
        }
        let rgb_img = final_img.into_rgb8();
        return rgb_img.save_with_format(target_path, image::ImageFormat::Png).is_ok();
    }
    false
}

pub fn match_search(item: &serde_json::Map<String, Value>, query: &str) -> bool {
    let q = query.to_lowercase();
    let search_keys = ["title", "artist", "album", "genre", "year", "composer"];
    for k in search_keys {
        if let Some(v) = item.get(k).and_then(|val| val.as_str()) {
            if v.to_lowercase().contains(&q) { return true; }
        }
    }
    false
}

pub fn get_duration_str(path_val: Option<&Value>) -> String {
    if let Some(rel_path) = path_val.and_then(|v| v.as_str()) {
        let abs_path = get_base_dir().join(rel_path);
        if abs_path.exists() {
            if let Ok(duration) = mp3_duration::from_path(&abs_path) {
                let secs = duration.as_secs();
                return format!("{}:{:02}", secs / 60, secs % 60);
            }
        }
    }
    "--:--".to_string()
}

pub fn evaluate_smart_rules(song: &serde_json::Map<String, Value>, rule: &Value) -> bool {
    if let Some(obj) = rule.as_object() {
        if let Some(r_type) = obj.get("type").and_then(|v| v.as_str()) {
            if r_type == "group" {
                let m = obj.get("match").and_then(|v| v.as_str()).unwrap_or("all");
                let items = obj.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                if items.is_empty() { return true; }
                let results: Vec<bool> = items.iter().map(|child| evaluate_smart_rules(song, child)).collect();
                return if m == "all" { results.into_iter().all(|r| r) } else { results.into_iter().any(|r| r) };
            } else if r_type == "filter" {
                let tag = obj.get("tag").and_then(|v| v.as_str()).unwrap_or("");
                let op = obj.get("op").and_then(|v| v.as_str()).unwrap_or("");
                let t_val = obj.get("val").unwrap_or(&Value::Null);
                let s_val = song.get(tag).and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                
                if ["track", "year", "disc", "bpm"].contains(&tag) {
                    let s_num = song.get(tag).and_then(|v| if v.is_number() { v.as_f64() } else { v.as_str().and_then(|s| s.parse().ok()) }).unwrap_or(0.0);
                    if op == "range" {
                        if let Some(arr) = t_val.as_array() {
                            let min = arr.get(0).and_then(|v| v.as_str().and_then(|s| s.parse::<f64>().ok())).unwrap_or(0.0);
                            let max = arr.get(1).and_then(|v| v.as_str().and_then(|s| s.parse::<f64>().ok())).unwrap_or(0.0);
                            return s_num >= min && s_num <= max;
                        } return false;
                    }
                    let v_num = if t_val.is_number() { t_val.as_f64().unwrap_or(0.0) } else { t_val.as_str().unwrap_or("").parse().unwrap_or(0.0) };
                    return match op { "equals" => s_num == v_num, "not_equals" => s_num != v_num, "greater" => s_num > v_num, "less" => s_num < v_num, _ => false };
                }
                let t_str = t_val.as_str().unwrap_or("").to_lowercase();
                return match op { "contains" => s_val.contains(&t_str), "not_contains" => !s_val.contains(&t_str), "equals" => s_val == t_str, "not_equals" => s_val != t_str, "startswith" => s_val.starts_with(&t_str), "endswith" => s_val.ends_with(&t_str), _ => false };
            }
        }
    }
    false
}