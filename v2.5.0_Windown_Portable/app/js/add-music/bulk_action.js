(function() {
    const u = window.AddMusicUtils;

    Object.assign(window.BulkController, {
        fetchPlaylist: async function() {
            const url = document.getElementById('bulkPlaylistUrl').value.trim();
            if (!url) { u.showToast("URLを入力してください", true); return; }

            const btn = document.getElementById('btnFetchBulk');
            const orgText = btn.textContent;
            btn.textContent = "取得中...";
            btn.disabled = true;

            try {
                const toolsStatus = await eel.check_tools_status()();
                if (!toolsStatus['yt-dlp'] || !toolsStatus['ffmpeg'] || !toolsStatus['deno']) {
                    u.showToast("動画機能を利用するには拡張機能（yt-dlp, ffmpeg, deno）をインストールしてください", true);
                    return;
                }

                const settings = await eel.get_app_settings()();
                const allTags = await eel.get_available_tags()();
                this.activeTags = allTags.filter(t => settings.active_tags.includes(t.key));

                const res = await eel.fetch_youtube_playlist(url)();
                if (res.status === 'success') {
                    this.scannedData = res.videos.map((v, idx) => {
                        const item = { id: idx + 1, url: v.url, title: v.title, artist: v.uploader, thumbnail: v.thumbnail, lyric: '', artwork_base64: '' };
                        this.activeTags.forEach(t => { if(t.key !== 'title' && t.key !== 'artist') item[t.key] = ''; });
                        return item;
                    });
                    
                    document.getElementById('bulkResultArea').style.display = 'block';
                    this.renderTable();
                    this.processThumbnailsBackground();
                } else {
                    u.showAlert(res.message);
                }
            } catch(e) {
                u.showToast("通信エラーが発生しました", true);
            } finally {
                btn.textContent = orgText;
                btn.disabled = false;
            }
        },

        processThumbnailsBackground: async function() {
            for (let i = 0; i < this.scannedData.length; i++) {
                if (this.scannedData[i].thumbnail && !this.scannedData[i].artwork_base64) {
                    try {
                        const b64 = await eel.fetch_and_crop_thumbnail(this.scannedData[i].thumbnail)();
                        if (b64) {
                            this.scannedData[i].artwork_base64 = b64;
                            const imgEl = document.getElementById(`bulk-art-${i}`);
                            if (imgEl) imgEl.src = b64;
                        }
                    } catch(e) {}
                }
            }
        },

        executeBulkImport: async function() {
            const btn = document.getElementById('btnSubmitBulk');
            const overlay = document.getElementById('loadingOverlay');
            const text = document.getElementById('loadingText');
            
            overlay.style.display = 'flex';
            btn.disabled = true;

            let successCount = 0;
            let failCount = 0;
            const total = this.scannedData.length;

            for (let i = 0; i < total; i++) {
                const item = this.scannedData[i];
                text.textContent = `一括追加中... ${i + 1} / ${total}`;
                
                const payload = {
                    video_url: item.url,
                    artwork_data: item.artwork_base64,
                    lyric: item.lyric,
                    title: item.title,
                    artist: item.artist
                };
                this.activeTags.forEach(t => {
                    if (t.key !== 'title' && t.key !== 'artist') {
                        payload[t.key] = item[t.key] || "";
                    }
                });

                try {
                    const res = await eel.download_and_save_music(payload)();
                    if (res) successCount++;
                    else failCount++;
                } catch(e) {
                    failCount++;
                }
            }

            overlay.style.display = 'none';
            btn.disabled = false;

            u.showAlert(`${successCount}曲の追加が完了しました。\n(失敗: ${failCount}曲)`);
            if (successCount > 0) {
                this.scannedData = [];
                document.getElementById('bulkResultArea').style.display = 'none';
                document.getElementById('bulkPlaylistUrl').value = '';
            }
        }
    });
})();