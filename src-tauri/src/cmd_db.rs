use crate::models::*;
use crate::utils::*;
use tauri::State;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::collections::HashSet;

#[tauri::command]
pub fn get_available_tags() -> Vec<TagInfo> {
    vec![
        TagInfo { key: "title".into(), label: "タイトル".into() }, TagInfo { key: "artist".into(), label: "アーティスト".into() },
        TagInfo { key: "album".into(), label: "アルバム".into() }, TagInfo { key: "genre".into(), label: "ジャンル".into() },
        TagInfo { key: "track".into(), label: "トラック".into() }, TagInfo { key: "year".into(), label: "年/日付".into() },
        TagInfo { key: "album_artist".into(), label: "アルバムアーティスト".into() }, TagInfo { key: "disc".into(), label: "ディスクNo".into() },
        TagInfo { key: "bpm".into(), label: "BPM".into() }, TagInfo { key: "composer".into(), label: "作曲者".into() },
        TagInfo { key: "comment".into(), label: "コメント".into() },
    ]
}

#[tauri::command]
pub fn get_autocomplete_lists(state: State<'_, AppState>) -> AutocompleteLists {
    let db = state.db.lock().unwrap();
    let (mut t, mut a, mut al) = (HashSet::new(), HashSet::new(), HashSet::new());
    for item in db.iter() {
        if let Some(v) = item.get("title").and_then(|v| v.as_str()) { t.insert(v.trim().to_string()); }
        if let Some(v) = item.get("artist").and_then(|v| v.as_str()) { a.insert(v.trim().to_string()); }
        if let Some(v) = item.get("album").and_then(|v| v.as_str()) { al.insert(v.trim().to_string()); }
    }
    let mut tv: Vec<_> = t.into_iter().collect(); tv.sort();
    let mut av: Vec<_> = a.into_iter().collect(); av.sort();
    let mut alv: Vec<_> = al.into_iter().collect(); alv.sort();
    AutocompleteLists { title: tv, artist: av, album: alv }
}

#[tauri::command]
pub fn check_duplicate_songs(title: String, artist: String, state: State<'_, AppState>) -> Vec<DuplicateSong> {
    let db = state.db.lock().unwrap();
    let (qt, qa) = (title.trim().to_lowercase(), artist.trim().to_lowercase());
    db.iter().filter(|i| {
        i.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase() == qt &&
        i.get("artist").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase() == qa
    }).map(|i| DuplicateSong {
        title: i.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        artist: i.get("artist").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        album: i.get("album").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        filename: Path::new(i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("")).file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
        image_data: get_image_base64(i.get("imageFilename").and_then(|v| v.as_str()).unwrap_or("")),
    }).collect()
}

#[tauri::command]
pub fn get_library_data_with_meta(include_images: bool, state: State<'_, AppState>) -> Vec<Value> {
    let db = state.db.lock().unwrap();
    db.iter().map(|i| {
        let mut s = i.clone();
        s.insert("duration".into(), Value::String(get_duration_str(s.get("musicFilename"))));
        if include_images { s.insert("imageData".into(), Value::String(get_image_base64(s.get("imageFilename").and_then(|v| v.as_str()).unwrap_or("")))); } 
        else { s.insert("imageData".into(), Value::String("".into())); }
        Value::Object(s)
    }).collect()
}

#[tauri::command]
pub fn get_album_list(state: State<'_, AppState>) -> Vec<String> {
    let db = state.db.lock().unwrap();
    let mut set = HashSet::new();
    for i in db.iter() {
        if let Some(a) = i.get("album").and_then(|v| v.as_str()) {
            let a = a.trim(); if !a.is_empty() { set.insert(a.to_string()); }
        }
    }
    let mut res: Vec<String> = set.into_iter().collect();
    res.sort(); res
}

#[tauri::command]
pub fn get_artist_list(state: State<'_, AppState>) -> Vec<String> {
    let db = state.db.lock().unwrap();
    let mut set = HashSet::new();
    for i in db.iter() {
        if let Some(a) = i.get("artist").and_then(|v| v.as_str()) {
            let a = a.trim(); if !a.is_empty() { set.insert(a.to_string()); }
        }
    }
    let mut res: Vec<String> = set.into_iter().collect();
    res.sort(); res
}

#[tauri::command]
pub fn get_virtual_playlist_details(field: String, value: String, state: State<'_, AppState>) -> Value {
    let db = state.db.lock().unwrap();
    let mut songs = Vec::new();
    let mut music = Vec::new();
    let mut total_sec = 0;
    
    for item in db.iter() {
        if item.get(&field).and_then(|v| v.as_str()) == Some(&value) {
            let mut s = item.clone();
            let mut dur_str = "--:--".to_string();
            if let Some(p) = item.get("musicFilename").and_then(|v| v.as_str()) {
                let abs = get_base_dir().join(p);
                if abs.exists() {
                    if let Ok(d) = mp3_duration::from_path(&abs) {
                        total_sec += d.as_secs();
                        dur_str = format!("{}:{:02}", d.as_secs()/60, d.as_secs()%60);
                    }
                }
                music.push(Value::String(Path::new(p).file_name().unwrap().to_string_lossy().to_string()));
            }
            s.insert("duration".into(), Value::String(dur_str));
            s.insert("imageData".into(), Value::String(get_image_base64(s.get("imageFilename").and_then(|v| v.as_str()).unwrap_or(""))));
            songs.push(Value::Object(s));
        }
    }
    let dur_str = if total_sec < 60 { format!("{}秒", total_sec) } else if total_sec < 3600 { format!("{}分", total_sec / 60) } else { format!("{:.1}時間", total_sec as f64 / 3600.0) };
    
    serde_json::json!({
        "id": format!("virtual_{}_{}", field, value),
        "playlistName": value, "type": "virtual", "sortBy": "title", "sortDesc": false,
        "songs": songs, "music": music, "totalDuration": dur_str
    })
}

#[tauri::command]
pub fn get_library_count(search_query: String, _advanced_conditions: Option<Value>, state: State<'_, AppState>) -> usize {
    state.db.lock().unwrap().iter().filter(|i| if !search_query.is_empty() { match_search(i, &search_query) } else { true }).count()
}

#[tauri::command]
pub fn get_library_chunk(page: usize, limit: usize, sort_field: Option<String>, sort_desc: bool, search_query: String, _advanced_conditions: Option<Value>, state: State<'_, AppState>) -> Vec<serde_json::Map<String, Value>> {
    let mut db = state.db.lock().unwrap().clone();
    db.retain(|i| if !search_query.is_empty() { match_search(i, &search_query) } else { true });
    if let Some(f) = sort_field {
        if f != "duration" {
            db.sort_by(|a, b| {
                let (va, vb) = (a.get(&f).and_then(|v| v.as_str()).unwrap_or("").to_lowercase(), b.get(&f).and_then(|v| v.as_str()).unwrap_or("").to_lowercase());
                if ["track", "disc", "year", "bpm"].contains(&f.as_str()) {
                    let (na, nb): (i32, i32) = (va.parse().unwrap_or(0), vb.parse().unwrap_or(0));
                    if sort_desc { nb.cmp(&na) } else { na.cmp(&nb) }
                } else { if sort_desc { vb.cmp(&va) } else { va.cmp(&vb) } }
            });
        }
    }
    let chunk = if limit > 0 { let s = (page.saturating_sub(1)) * limit; db.into_iter().skip(s).take(limit).collect() } else { db };
    chunk.into_iter().map(|mut i| {
        i.insert("duration".into(), Value::String(get_duration_str(i.get("musicFilename"))));
        i.insert("imageData".into(), Value::String(get_image_base64(i.get("imageFilename").and_then(|v| v.as_str()).unwrap_or(""))));
        i
    }).collect()
}

#[tauri::command]
pub fn update_song_by_id(music_filename: String, field: String, value: String, state: State<'_, AppState>) -> bool {
    let mut db = state.db.lock().unwrap();
    if let Some(i) = db.iter_mut().find(|i| i.get("musicFilename").and_then(|v| v.as_str()) == Some(&music_filename)) {
        i.insert(field, Value::String(value)); return save_db(&db).is_ok();
    } false
}

#[tauri::command]
pub fn update_song_artwork_by_id(music_filename: String, new_art_base64: Option<String>, remove: bool, state: State<'_, AppState>) -> bool {
    use rand::{rng, Rng};
    use rand::distr::Alphanumeric;
    use base64::{Engine as _, engine::general_purpose};
    let mut db = state.db.lock().unwrap();
    if let Some(t) = db.iter_mut().find(|i| i.get("musicFilename").and_then(|v| v.as_str()) == Some(&music_filename)) {
        if let Some(old) = t.get("imageFilename").and_then(|v| v.as_str()) { if !old.contains("default.png") { let _ = fs::remove_file(get_base_dir().join(old)); } }
        if remove { t.insert("imageFilename".into(), Value::String("library/images/default.png".into())); }
        else if let Some(b64) = new_art_base64 {
            let path = format!("library/images/{}.png", rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect::<String>());
            let b = general_purpose::STANDARD.decode(if b64.contains(',') { b64.split(',').nth(1).unwrap() } else { &b64 }).unwrap_or_default();
            if force_save_as_png(&b, &get_base_dir().join(&path)) { t.insert("imageFilename".into(), Value::String(path)); } else { return false; }
        }
        return save_db(&db).is_ok();
    } false
}

#[tauri::command]
pub fn delete_song_by_id(music_filename: String, state: State<'_, AppState>) -> bool {
    let mut db = state.db.lock().unwrap();
    if let Some(p) = db.iter().position(|i| i.get("musicFilename").and_then(|v| v.as_str()) == Some(&music_filename)) {
        let i = db.remove(p);
        if let Some(m) = i.get("musicFilename").and_then(|v| v.as_str()) { let _ = fs::remove_file(get_base_dir().join(m)); }
        if let Some(img) = i.get("imageFilename").and_then(|v| v.as_str()) { if !img.contains("default.png") { let _ = fs::remove_file(get_base_dir().join(img)); } }
        return save_db(&db).is_ok();
    } false
}

#[tauri::command]
pub fn get_common_values_for_selected(filenames: Vec<String>, state: State<'_, AppState>) -> serde_json::Map<String, Value> {
    let db = state.db.lock().unwrap();
    let sel: Vec<_> = db.iter().filter(|i| filenames.contains(&i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").to_string())).collect();
    let mut res = serde_json::Map::new();
    if sel.is_empty() { return res; }
    for k in ["title", "artist", "album", "genre", "year", "track", "disc", "bpm", "composer", "comment", "lyric"] {
        let f = sel[0].get(k).and_then(|v| v.as_str()).unwrap_or("");
        res.insert(k.into(), Value::String(if sel.iter().all(|i| i.get(k).and_then(|v| v.as_str()).unwrap_or("") == f) { f.into() } else { "< 維持 >".into() }));
    }
    res
}

#[tauri::command]
pub fn update_multiple_songs(filenames: Vec<String>, updates: serde_json::Map<String, Value>, state: State<'_, AppState>) -> Value {
    let mut db = state.db.lock().unwrap();
    let mut c = 0;
    let up: Vec<_> = updates.into_iter().filter(|(_, v)| v.as_str() != Some("< 維持 >")).collect();
    for i in db.iter_mut() {
        if filenames.contains(&i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").to_string()) {
            for (k, v) in &up { i.insert(k.clone(), v.clone()); }
            c += 1;
        }
    }
    if c > 0 { let _ = save_db(&db); }
    serde_json::json!({"success": true, "count": c})
}

#[tauri::command]
pub fn delete_multiple_songs(filenames: Vec<String>, state: State<'_, AppState>) -> Value {
    let mut db = state.db.lock().unwrap();
    let mut c = 0;
    db.retain(|i| {
        if filenames.contains(&i.get("musicFilename").and_then(|v| v.as_str()).unwrap_or("").split(&['/', '\\'][..]).last().unwrap_or("").to_string()) {
            if let Some(m) = i.get("musicFilename").and_then(|v| v.as_str()) { let _ = fs::remove_file(get_base_dir().join(m)); }
            if let Some(img) = i.get("imageFilename").and_then(|v| v.as_str()) { if !img.contains("default.png") { let _ = fs::remove_file(get_base_dir().join(img)); } }
            c += 1; false
        } else { true }
    });
    if c > 0 { let _ = save_db(&db); }
    serde_json::json!({"success": true, "count": c})
}

#[tauri::command]
pub fn convert_smart_to_normal_and_remove_songs(pl_id: String, filenames: Vec<String>, state: State<'_, AppState>) -> bool {
    let mut master = load_playlist_master();
    let mut current_music = Vec::new();
    let db = state.db.lock().unwrap();
    
    if let Some(pl) = master.iter_mut().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&pl_id)) {
        if let Some(obj) = pl.as_object_mut() {
            if let Some(cond) = obj.get("conditions") {
                for song in db.iter() {
                    if evaluate_smart_rules(song, cond) {
                        if let Some(p) = song.get("musicFilename").and_then(|v| v.as_str()) {
                            let fname = Path::new(p).file_name().unwrap().to_string_lossy().to_string();
                            current_music.push(fname);
                        }
                    }
                }
            }
            obj.insert("type".into(), Value::String("normal".into()));
            obj.remove("conditions");
        }
        let _ = save_playlist_master(&master);
        current_music.retain(|f| !filenames.contains(f));
        let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
        let _ = fs::write(p_path, serde_json::to_string_pretty(&current_music).unwrap());
        return true;
    }
    false
}

#[tauri::command]
pub fn remove_songs_from_playlist(pl_id: String, filenames: Vec<String>) -> Option<Value> {
    let master = load_playlist_master();
    let pl = master.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&pl_id))?;
    if pl.get("type").and_then(|v| v.as_str()) == Some("smart") { return None; }
    
    let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
    if let Ok(data) = fs::read_to_string(&p_path) {
        if let Ok(mut list) = serde_json::from_str::<Vec<String>>(&data) {
            list.retain(|f| !filenames.contains(f));
            let _ = fs::write(p_path, serde_json::to_string_pretty(&list).unwrap());
        }
    }
    Some(serde_json::json!({"success": true})) // JSで再読込する前提
}

#[tauri::command]
pub fn duplicate_playlist_by_id(pl_id: String) -> Option<Value> {
    use rand::{rng, Rng};
    use rand::distr::Alphanumeric;
    let mut master = load_playlist_master();
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
pub fn delete_playlist_by_id(pl_id: String) -> bool {
    let master = load_playlist_master();
    let new_master: Vec<_> = master.into_iter().filter(|p| p.get("id").and_then(|v| v.as_str()) != Some(&pl_id)).collect();
    let _ = save_playlist_master(&new_master);
    let p_path = get_base_dir().join(format!("userfiles/playlist/{}.json", pl_id));
    let _ = fs::remove_file(p_path);
    true
}

#[tauri::command]
pub fn update_playlist_by_id(pl_id: String, field: String, value: Value) -> Option<Value> {
    let mut master = load_playlist_master();
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