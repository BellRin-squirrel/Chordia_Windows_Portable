window.BulkController = {
    scannedData:[],
    activeTags:[],
    currentEditIndex: -1,
    
    init: async function() {
        const u = window.AddMusicUtils;
        
        // タブ切り替えの設定
        document.querySelectorAll('.tab-menu .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-menu .tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).style.display = 'block';
            });
        });

        // ボタンイベント
        document.getElementById('btnFetchBulk').addEventListener('click', () => this.fetchPlaylist());
        document.getElementById('btnSubmitBulk').addEventListener('click', () => this.executeBulkImport());

        // モーダルの共通閉じる処理
        const closeModals = () => {
            document.querySelectorAll('.modal-overlay').forEach(m => {
                if (m.classList.contains('show')) {
                    m.classList.remove('show');
                    setTimeout(() => m.style.display = 'none', 300);
                    if (m.id === 'youtubeModal') {
                        document.getElementById('youtubeIframe').src = "";
                    }
                }
            });
        };
        
        const setClose = (id) => { const el = document.getElementById(id); if(el) el.onclick = closeModals; };
        setClose('btnCloseYoutube');
        setClose('btnCancelBulkLyric');
        setClose('btnCloseBulkLyricModalX');
        setClose('btnCancelBulkArt');
        setClose('btnCloseBulkArtModalX');
        setClose('btnCancelBulkDelete');
        
        // 歌詞保存
        document.getElementById('btnSaveBulkLyric').onclick = () => {
            this.scannedData[this.currentEditIndex].lyric = document.getElementById('bulkLyricTextArea').value;
            closeModals();
            u.showToast("反映しました", false);
        };
        
        // 自動歌詞取得 (LRCLIB)
        document.getElementById('btnAutoBulkLyric').onclick = async () => {
            const item = this.scannedData[this.currentEditIndex];
            if(!item.title || !item.artist) { u.showToast("タイトルとアーティストが必要です", true); return; }
            const btn = document.getElementById('btnAutoBulkLyric');
            const orgText = btn.textContent;
            btn.textContent = "検索中..."; btn.disabled = true;
            try {
                const res = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(item.title)}&artist_name=${encodeURIComponent(item.artist)}`);
                const data = await res.json();
                const filtered = data.filter(d => d.plainLyrics);
                if(filtered.length > 0) {
                    document.getElementById('bulkLyricTextArea').value = filtered[0].plainLyrics;
                    u.showToast("歌詞を取得しました", false);
                } else { u.showToast("見つかりませんでした", true); }
            } catch(e) { u.showToast("エラー", true); } finally { btn.textContent = orgText; btn.disabled = false; }
        };

        // アートワーク選択
        const artPreview = document.getElementById('currentBulkArtPreview');
        document.getElementById('newBulkArtInput').onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => artPreview.src = ev.target.result;
            reader.readAsDataURL(file);
        };
        document.getElementById('btnSaveBulkArt').onclick = () => {
            this.scannedData[this.currentEditIndex].artwork_base64 = artPreview.src;
            closeModals();
            this.renderTable();
            u.showToast("反映しました", false);
        };
    },

    updateData: function(idx, key, val) {
        if (this.scannedData[idx]) {
            this.scannedData[idx][key] = val;
        }
    }
};