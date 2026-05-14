use crate::models::*;
use crate::utils::*;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Emitter};
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use base64::{Engine as _, engine::general_purpose};
use ini::Ini;
use walkdir::WalkDir;
use rand::{rng, Rng};
use rand::distr::Alphanumeric;

use std::os::windows::process::CommandExt;
use id3::{Tag, TagLike};

#[tauri::command]
pub async fn open_new_window(app: AppHandle, label: String, url: String, title: String, width: f64, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) { let _ = window.set_focus(); return Ok(()); }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into())).title(title).inner_size(width, height).resizable(true).build().map_err(|e| e.to_string())?; Ok(())
}

#[tauri::command]
pub fn get_app_settings() -> AppSettings {
    let base = get_base_dir();
    if !base.join("userfiles").exists() { let _ = fs::create_dir_all(base.join("userfiles")); }
    let conf = Ini::load_from_file(base.join("userfiles/settings.ini")).unwrap_or_else(|_| Ini::new());
    let get_bool = |sec, key, def| conf.section(Some(sec)).and_then(|s| s.get(key)).map(|v| v.to_lowercase() == "true").unwrap_or(def);
    let get_str = |sec, key, def: &str| conf.section(Some(sec)).and_then(|s| s.get(key)).unwrap_or(def).to_string();
    let get_int = |sec, key, def| conf.section(Some(sec)).and_then(|s| s.get(key)).and_then(|v| v.parse().ok()).unwrap_or(def);
    AppSettings {
        items_per_page: get_int("Database", "items_per_page", 50),
        open_player_new_window: get_bool("Database", "open_player_new_window", false),
        open_manage_new_window: get_bool("Database", "open_manage_new_window", false),
        developer_mode: get_bool("Database", "developer_mode", false),
        lazy_load_playlists: get_bool("Database", "lazy_load_playlists", false),
        primary_color: get_str("Theme", "primary_color", "#4f46e5"),
        background_color: get_str("Theme", "background_color", "#f3f4f6"),
        sub_background_color: get_str("Theme", "sub_background_color", "#ffffff"),
        text_color: get_str("Theme", "text_color", "#1f2937"),
        theme_mode: get_str("Theme", "theme_mode", "light"),
        active_tags: get_str("Tags", "active_tags", "title,artist,album,genre,track").split(',').map(|s| s.trim().to_string()).collect(),
        player_visible_tags: get_str("Tags", "player_visible_tags", "title,artist,album,track").split(',').map(|s| s.trim().to_string()).collect(),
    }
}

#[tauri::command]
pub fn save_app_settings(settings: AppSettings) -> bool {
    let path = get_base_dir().join("userfiles/settings.ini");
    let mut conf = Ini::load_from_file(&path).unwrap_or_else(|_| Ini::new());
    conf.with_section(Some("Database")).set("items_per_page", settings.items_per_page.to_string()).set("open_player_new_window", settings.open_player_new_window.to_string()).set("open_manage_new_window", settings.open_manage_new_window.to_string()).set("developer_mode", settings.developer_mode.to_string()).set("lazy_load_playlists", settings.lazy_load_playlists.to_string());
    conf.with_section(Some("Theme")).set("primary_color", settings.primary_color).set("background_color", settings.background_color).set("sub_background_color", settings.sub_background_color).set("text_color", settings.text_color).set("theme_mode", settings.theme_mode);
    conf.with_section(Some("Tags")).set("active_tags", settings.active_tags.join(",")).set("player_visible_tags", settings.player_visible_tags.join(","));
    conf.write_to_file(path).is_ok()
}

#[tauri::command]
pub fn get_custom_themes() -> Value { fs::read_to_string(get_base_dir().join("userfiles/custom_themes.json")).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or(serde_json::json!({})) }

#[tauri::command]
pub fn save_custom_theme(name: String, colors: Value) -> bool {
    let path = get_base_dir().join("userfiles/custom_themes.json");
    let mut themes: serde_json::Map<String, Value> = fs::read_to_string(&path).ok().and_then(|d| serde_json::from_str(&d).ok()).unwrap_or_default();
    themes.insert(name, colors);
    serde_json::to_string_pretty(&themes).ok().and_then(|s| fs::write(path, s).ok()).is_some()
}

#[tauri::command]
pub fn delete_custom_theme(name: String) -> bool {
    let path = get_base_dir().join("userfiles/custom_themes.json");
    if let Ok(mut themes) = fs::read_to_string(&path).ok().and_then(|d| serde_json::from_str::<serde_json::Map<String, Value>>(&d).ok()).ok_or(()) {
        if themes.remove(&name).is_some() { return serde_json::to_string_pretty(&themes).ok().and_then(|s| fs::write(path, s).ok()).is_some(); }
    } false
}

#[tauri::command]
pub fn get_default_art_url() -> String { get_image_base64("library/images/default.png") }

#[tauri::command]
pub fn update_default_artwork(b64_data: String) -> bool {
    let b64_clean = if b64_data.contains(',') { b64_data.split(',').nth(1).unwrap() } else { &b64_data };
    general_purpose::STANDARD.decode(b64_clean).ok().and_then(|b| Some(force_save_as_png(&b, &get_base_dir().join("library/images/default.png")))).unwrap_or(false)
}

#[tauri::command]
pub fn reset_default_artwork() -> bool { fs::copy(get_base_dir().join("app/icon/Chordia.png"), get_base_dir().join("library/images/default.png")).is_ok() }

#[tauri::command]
pub fn resolve_path(rel_path: String) -> String { get_base_dir().join(rel_path).to_string_lossy().to_string() }

#[tauri::command]
pub fn open_in_explorer(music_filename: String) -> bool {
    let path = get_base_dir().join(music_filename);
    if path.exists() { let _ = std::process::Command::new("explorer").args(&["/select,", path.to_str().unwrap()]).spawn(); return true; }
    false
}

#[tauri::command]
pub fn get_default_export_path() -> String {
    if let Some(desktop) = dirs::desktop_dir() { desktop.join("Chordia_Export.zip").to_string_lossy().to_string() } else { "Chordia_Export.zip".to_string() }
}

#[tauri::command]
pub fn ask_save_path(current_path: String) -> Option<String> {
    let path = PathBuf::from(current_path);
    rfd::FileDialog::new().set_title("保存先を選択").set_directory(path.parent().unwrap_or(Path::new("."))).set_file_name(path.file_name().and_then(|s| s.to_str()).unwrap_or("Chordia_Export.zip")).add_filter("ZIP files", &["zip"]).save_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn execute_export(targets: serde_json::Map<String, Value>, save_path: String) -> serde_json::Value {
    let base = get_base_dir();
    let file = match fs::File::create(&save_path) { Ok(f) => f, Err(e) => return serde_json::json!({"success": false, "message": e.to_string()}), };
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).unix_permissions(0o755);
    
    // ★ 修正: `mut` を外しました
    let add_dir = |zip: &mut zip::ZipWriter<fs::File>, folder_rel: &str, arc_prefix: &str| {
        let folder_abs = base.join(folder_rel);
        if !folder_abs.exists() { return; }
        for entry in WalkDir::new(&folder_abs).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                let arc_path = Path::new(arc_prefix).join(path.strip_prefix(&folder_abs).unwrap());
                let _ = zip.start_file(arc_path.to_string_lossy(), options);
                let _ = fs::read(path).map(|b| zip.write_all(&b));
            }
        }
    };
    
    if targets.get("music").and_then(|v| v.as_bool()).unwrap_or(false) { add_dir(&mut zip, "library/music", "library/music"); }
    if targets.get("images").and_then(|v| v.as_bool()).unwrap_or(false) { add_dir(&mut zip, "library/images", "library/images"); }
    if targets.get("db").and_then(|v| v.as_bool()).unwrap_or(false) { let _ = zip.start_file("userfiles/music.json", options); let _ = fs::read(base.join("userfiles/music.json")).map(|b| zip.write_all(&b)); }
    if targets.get("settings").and_then(|v| v.as_bool()).unwrap_or(false) { let _ = zip.start_file("userfiles/settings.ini", options); let _ = fs::read(base.join("userfiles/settings.ini")).map(|b| zip.write_all(&b)); }
    if targets.get("playlists").and_then(|v| v.as_bool()).unwrap_or(false) { add_dir(&mut zip, "userfiles/playlist", "userfiles/playlist"); }
    match zip.finish() { Ok(_) => serde_json::json!({"success": true, "path": save_path}), Err(e) => serde_json::json!({"success": false, "message": e.to_string()}), }
}

#[tauri::command]
pub fn check_tools_status() -> Value {
    let b = get_base_dir().join("userfiles/bin");
    serde_json::json!({"yt-dlp": b.join("yt-dlp.exe").exists(), "ffmpeg": b.join("ffmpeg.exe").exists(), "deno": b.join("deno.exe").exists()})
}

#[tauri::command]
pub fn fetch_video_info(url: String) -> Value {
    let y = get_base_dir().join("userfiles/bin/yt-dlp.exe");
    std::process::Command::new(y).args(&["--dump-json", "--no-playlist", "--skip-download", &url]).creation_flags(0x08000000).output().ok().and_then(|o| {
        if o.status.success() { serde_json::from_slice::<Value>(&o.stdout).ok().map(|v| serde_json::json!({"status": "success", "title": v.get("title").and_then(|v| v.as_str()).unwrap_or(""), "duration": v.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0), "thumbnail": v.get("thumbnail").and_then(|v| v.as_str()).unwrap_or(""), "uploader": v.get("uploader").and_then(|v| v.as_str()).unwrap_or("")})) } else { None }
    }).unwrap_or(serde_json::json!({"status": "error", "message": "取得失敗"}))
}

#[tauri::command]
pub fn fetch_youtube_playlist(url: String) -> Value {
    let y = get_base_dir().join("userfiles/bin/yt-dlp.exe");
    std::process::Command::new(y).args(&["--dump-json", "--flat-playlist", &url]).creation_flags(0x08000000).output().ok().and_then(|o| {
        if o.status.success() {
            let v: Vec<_> = String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()).map(|i| serde_json::json!({"title": i.get("title").and_then(|v| v.as_str()).unwrap_or(""), "url": i.get("url").and_then(|v| v.as_str()).unwrap_or(""), "thumbnail": i.get("thumbnail").and_then(|v| v.as_str()).unwrap_or(""), "duration": i.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0), "uploader": i.get("uploader").and_then(|v| v.as_str()).unwrap_or("")})).collect();
            Some(serde_json::json!({"status": "success", "videos": v}))
        } else { None }
    }).unwrap_or(serde_json::json!({"status": "error", "message": "取得失敗"}))
}

#[tauri::command]
pub fn fetch_and_crop_thumbnail(url: String) -> Option<String> {
    let u = if url.starts_with("//") { format!("https:{}", url) } else { url };
    let b = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(10)).user_agent("Mozilla/5.0").build().ok()?.get(&u).send().ok()?.bytes().ok()?;
    let i = image::load_from_memory(&b).ok()?;
    let s = std::cmp::min(i.width(), i.height());
    let mut c = i.crop_imm((i.width()-s)/2, (i.height()-s)/2, s, s);
    if c.color().has_alpha() {
        let mut bg = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(c.width(), c.height(), image::Rgba([255, 255, 255, 255])));
        image::imageops::overlay(&mut bg, &c, 0, 0); c = bg;
    }
    let mut buf = std::io::Cursor::new(Vec::new());
    c.write_to(&mut buf, image::ImageFormat::Png).ok()?;
    Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(buf.into_inner())))
}

#[tauri::command]
pub fn fetch_and_crop_image_url(url: String) -> Value {
    fetch_and_crop_thumbnail(url).map(|b| serde_json::json!({"status": "success", "data": b})).unwrap_or(serde_json::json!({"status": "error", "message": "失敗"}))
}

#[tauri::command]
pub fn extract_artwork_from_local_file(b64_music: String) -> Option<String> {
    let b = general_purpose::STANDARD.decode(if b64_music.contains(',') { b64_music.split(',').nth(1).unwrap() } else { &b64_music }).ok()?;
    let t = Tag::read_from2(&mut std::io::Cursor::new(&b)).ok()?;
    let p = t.pictures().next()?;
    let i = image::load_from_memory(&p.data).ok()?;
    let s = std::cmp::min(i.width(), i.height());
    let mut c = i.crop_imm((i.width()-s)/2, (i.height()-s)/2, s, s);
    if c.color().has_alpha() {
        let mut bg = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(c.width(), c.height(), image::Rgba([255, 255, 255, 255])));
        image::imageops::overlay(&mut bg, &c, 0, 0); c = bg;
    }
    let mut buf = std::io::Cursor::new(Vec::new());
    c.write_to(&mut buf, image::ImageFormat::Png).ok()?;
    Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(buf.into_inner())))
}

#[tauri::command]
pub fn download_original_thumbnail(url: String) -> Value {
    if let Some(p) = rfd::FileDialog::new().set_title("保存").add_filter("Image", &["jpg", "png"]).save_file() {
        let u = if url.starts_with("//") { format!("https:{}", url) } else { url };
        if let Some(r) = reqwest::blocking::Client::builder().user_agent("Mozilla/5.0").build().ok().and_then(|c| c.get(&u).send().ok()) {
            if let Ok(b) = r.bytes() { if fs::write(p, b).is_ok() { return serde_json::json!({"status": "success", "message": "保存完了"}); } }
        }
    }
    serde_json::json!({"status": "error"})
}

#[tauri::command]
pub fn download_and_save_music(mut data: serde_json::Map<String, Value>, state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let b = get_base_dir();
    let y = b.join("userfiles/bin/yt-dlp.exe");
    let u = data.get("video_url").and_then(|v| v.as_str()).ok_or("No URL")?;
    let id: String = rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
    let out = b.join(format!("library/music/{}.%(ext)s", id));
    let res = std::process::Command::new(y).args(&["--no-playlist", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--ffmpeg-location", b.join("userfiles/bin").to_str().unwrap(), "-o", out.to_str().unwrap(), u]).creation_flags(0x08000000).output().map_err(|e| e.to_string())?;
    if !res.status.success() { return Err("DL失敗".into()); }
    let mut img = "library/images/default.png".to_string();
    if let Some(a) = data.get("artwork_data").and_then(|v| v.as_str()) {
        let bytes = general_purpose::STANDARD.decode(if a.contains(',') { a.split(',').nth(1).unwrap() } else { a }).unwrap_or_default();
        let p = format!("library/images/{}.png", id);
        if force_save_as_png(&bytes, &b.join(&p)) { img = p; }
    }
    let mut db = state.db.lock().unwrap();
    data.remove("video_url"); data.remove("artwork_data");
    let music_p = format!("library/music/{}.mp3", id);
    if let Ok(mut t) = Tag::read_from_path(b.join(&music_p)) {
        if let Some(val) = data.get("title").and_then(|v| v.as_str()) { t.set_title(val); }
        if let Some(val) = data.get("artist").and_then(|v| v.as_str()) { t.set_artist(val); }
        let _ = t.write_to_path(b.join(&music_p), id3::Version::Id3v24);
    }
    data.insert("musicFilename".into(), Value::String(music_p));
    data.insert("imageFilename".into(), Value::String(img));
    db.push(data.clone()); save_db(&db)?; Ok(true)
}

#[tauri::command]
pub fn parse_list_import(app: AppHandle, content: String, file_type: String) -> serde_json::Value {
    let items: Vec<ImportItem> = if file_type == "json" { serde_json::from_str(&content).unwrap_or_default() } else if file_type == "csv" { let mut rdr = csv::Reader::from_reader(content.as_bytes()); rdr.deserialize().filter_map(|result| result.ok()).collect() } else { return serde_json::json!({"status": "error", "message": "不明なファイル形式"}); };
    let total = items.len();
    let processed: Vec<ImportItem> = items.into_iter().enumerate().map(|(i, mut item)| {
        let _ = app.emit("js_import_progress", serde_json::json!({"current": i + 1, "total": total, "message": "解析中..."}));
        item.id = Some((i + 1) as i32);
        item.status = Some(if item.music_filename.as_ref().map(|p| Path::new(p).exists()).unwrap_or(false) { "ok".into() } else { "error".into() });
        if let Some(img_p) = item.image_filename.as_ref() { if Path::new(img_p).exists() { item.artwork_base64 = Some(get_image_base64(img_p)); } }
        item
    }).collect();
    serde_json::json!({"status": "success", "data": processed})
}

#[tauri::command]
pub fn check_import_duplicates(state: tauri::State<'_, AppState>, import_list: Vec<ImportItem>) -> Vec<serde_json::Value> {
    let db = state.db.lock().unwrap();
    import_list.into_iter().filter(|item| {
        let it = item.title.as_ref().map(|s| s.trim().to_lowercase()).unwrap_or_default();
        let ia = item.artist.as_ref().map(|s| s.trim().to_lowercase()).unwrap_or_default();
        db.iter().any(|db_i| db_i.get("title").and_then(|v| v.as_str()).map(|s| s.trim().to_lowercase()).unwrap_or_default() == it && db_i.get("artist").and_then(|v| v.as_str()).map(|s| s.trim().to_lowercase()).unwrap_or_default() == ia)
    }).map(|item| serde_json::json!({"title": item.title, "artist": item.artist})).collect()
}

#[tauri::command]
pub fn execute_final_list_import(app: AppHandle, state: tauri::State<'_, AppState>, import_data_list: Vec<ImportItem>) -> serde_json::Value {
    let base = get_base_dir();
    let mut success_count = 0;
    let total = import_data_list.len();
    let mut db = state.db.lock().unwrap();
    for (i, item) in import_data_list.into_iter().enumerate() {
        let _ = app.emit("js_import_progress", serde_json::json!({"current": i + 1, "total": total, "message": "登録中..."}));
        if let Some(src_music) = item.music_filename {
            if let Ok(m_bytes) = fs::read(&src_music) {
                let f_id: String = rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
                let ext = Path::new(&src_music).extension().and_then(|s| s.to_str()).unwrap_or("mp3");
                let music_path = format!("library/music/{}.{}", f_id, ext);
                let _ = fs::write(base.join(&music_path), m_bytes);
                let mut img_path = "library/images/default.png".to_string();
                if let Some(b64) = item.artwork_base64 {
                    let b = general_purpose::STANDARD.decode(if b64.contains(',') { b64.split(',').nth(1).unwrap() } else { &b64 }).unwrap_or_default();
                    let p = format!("library/images/{}.png", f_id);
                    if force_save_as_png(&b, &base.join(&p)) { img_path = p; }
                }
                let mut map = serde_json::Map::new();
                map.insert("title".into(), Value::String(item.title.unwrap_or_default()));
                map.insert("artist".into(), Value::String(item.artist.unwrap_or_default()));
                map.insert("album".into(), Value::String(item.album.unwrap_or_default()));
                map.insert("genre".into(), Value::String(item.genre.unwrap_or_default()));
                map.insert("musicFilename".into(), Value::String(music_path));
                map.insert("imageFilename".into(), Value::String(img_path));
                map.insert("lyric".into(), Value::String(item.lyric.unwrap_or_default()));
                db.push(map); success_count += 1;
            }
        }
    }
    let _ = save_db(&db);
    serde_json::json!({"status": "success", "count": success_count})
}

#[tauri::command]
pub fn scan_mp3_zip_from_data(_app: AppHandle, base64_zip: String) -> serde_json::Value {
    let b = general_purpose::STANDARD.decode(if base64_zip.contains(',') { base64_zip.split(',').nth(1).unwrap() } else { &base64_zip }).unwrap_or_default();
    let temp_dir = tempfile::tempdir().unwrap();
    let zip_path = temp_dir.path().join("import.zip");
    if fs::write(&zip_path, b).is_err() { return serde_json::json!({"status": "error", "message": "一時ファイルの書き込みに失敗"}); }
    let file = fs::File::open(&zip_path).unwrap();
    let mut archive = match zip::ZipArchive::new(file) { Ok(a) => a, Err(e) => return serde_json::json!({"status": "error", "message": e.to_string()}), };
    let mut items = Vec::new();
    let extract_to = temp_dir.path().join("extracted");
    fs::create_dir_all(&extract_to).unwrap();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let outpath = extract_to.join(file.name());
        if file.is_dir() { fs::create_dir_all(&outpath).unwrap(); }
        else {
            if let Some(p) = outpath.parent() { fs::create_dir_all(p).unwrap(); }
            let mut outfile = fs::File::create(&outpath).unwrap();
            std::io::copy(&mut file, &mut outfile).unwrap();
            if outpath.extension().and_then(|s| s.to_str()) == Some("mp3") {
                if let Ok(tag) = Tag::read_from_path(&outpath) {
                    items.push(ImportItem {
                        id: Some(items.len() as i32 + 1),
                        status: Some("ok".into()),
                        title: tag.title().map(|s| s.to_string()),
                        artist: tag.artist().map(|s| s.to_string()),
                        album: tag.album().map(|s| s.to_string()),
                        temp_path: Some(outpath.to_string_lossy().to_string()),
                        rel_path: Some(file.name().to_string()),
                        ..Default::default()
                    });
                }
            }
        }
    }
    serde_json::json!({"status": "success", "data": items, "temp_dir": extract_to.to_string_lossy()})
}