window.SourceController = {
    sourceType: 'local',
    musicFile: null,
    fetchedVideoInfo: null,

    init: function() {
        const u = window.AddMusicUtils;
        if (!u) { console.error("AddMusicUtils not loaded"); return; }

        // ラジオボタン切り替え
        const sourceRadios = document.getElementsByName('sourceType');
        const sourceLocalArea = document.getElementById('sourceLocalArea');
        const sourceDownloadArea = document.getElementById('sourceDownloadArea');

        sourceRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sourceType = e.target.value;
                if (this.sourceType === 'local') {
                    sourceLocalArea.classList.add('active');
                    sourceDownloadArea.classList.remove('active');
                } else {
                    sourceLocalArea.classList.remove('active');
                    sourceDownloadArea.classList.add('active');
                }
                
                this.validateArtworkTab();
            });
        });

        // ローカルファイル処理
        const fileInput = document.getElementById('fileInput');
        const fileDropZone = document.getElementById('fileDropZone');

        if(fileInput) fileInput.addEventListener('change', (e) => this.handleMusic(e.target.files[0]));
        
        if(fileDropZone) {
            u.setupDragAndDrop(fileDropZone, (file) => this.handleMusic(file));
        }

        // 動画ダウンロード処理
        const btnFetch = document.getElementById('btnFetchVideoInfo');
        const btnCancel = document.getElementById('btnCancelVideo');
        if(btnFetch) btnFetch.addEventListener('click', () => this.fetchVideo());
        if(btnCancel) btnCancel.addEventListener('click', () => this.cancelVideo());
    },

    validateArtworkTab: function() {
        if (!window.ArtworkController) return;
        const u = window.AddMusicUtils;
        const activeTab = window.ArtworkController.getActiveTab();

        if (this.sourceType === 'local' && activeTab === 'art-thumb1') {
            u.showAlert("音源がローカルファイルに変更されたため、アルバムアートを「ローカル」にリセットしました。");
            this.resetToLocalArtworkTab();
        }
        
        if (this.sourceType === 'download' && activeTab === 'art-extract') {
            u.showAlert("音源が動画ダウンロードに変更されたため、アルバムアートを「ローカル」にリセットしました。");
            this.resetToLocalArtworkTab();
        }
    },

    resetToLocalArtworkTab: function() {
        const localTabBtn = document.querySelector('.art-tab-btn[data-target="art-local"]');
        if (localTabBtn) {
            localTabBtn.click();
        }
    },

    handleMusic: function(file) {
        const u = window.AddMusicUtils;
        if (!file) return;
        const name = file.name.toLowerCase();
        
        if (!name.endsWith('.mp3') && !name.endsWith('.mp4')) {
            u.showToast('MP3またはMP4ファイルのみ対応しています', true);
            return;
        }
        
        this.musicFile = file;
        const display = document.getElementById('fileName');
        if(display) {
            display.textContent = `選択中: ${file.name}`;
            display.style.color = 'var(--primary-color)';
        }
    },

    reset: function() {
        this.musicFile = null;
        this.fetchedVideoInfo = null;
        this.cancelVideo(); 
        
        const fileInput = document.getElementById('fileInput');
        const fileName = document.getElementById('fileName');
        if(fileInput) fileInput.value = '';
        if(fileName) {
            fileName.textContent = "MP3 / MP4 ファイルをドラッグ＆ドロップ";
            fileName.style.color = "var(--text-main)";
        }
        
        const radioLocal = document.querySelector('input[name="sourceType"][value="local"]');
        if(radioLocal) {
            radioLocal.checked = true;
            radioLocal.dispatchEvent(new Event('change'));
        }
    },

    fetchVideo: async function() {
        const u = window.AddMusicUtils;
        const urlInput = document.getElementById('videoUrl');
        const btn = document.getElementById('btnFetchVideoInfo');
        const url = urlInput.value.trim();
        
        if (!url) { u.showToast("URLを入力してください", true); return; }

        const originalText = btn.textContent;
        btn.textContent = "取得中...";
        btn.disabled = true;

        try {
            const res = await eel.fetch_video_info(url)();
            if (res.status === 'success') {
                this.fetchedVideoInfo = res;
                // 追加データのプロパティとして元のURLを保持しておく（ダウンロード時に必要）
                this.fetchedVideoInfo.url = url;
                this.updateVideoUI(res);
                
                // ★自動入力処理を削除しました

                if (window.ArtworkController) {
                    btn.textContent = "サムネイル処理中...";
                    await window.ArtworkController.preloadThumbnail(res.thumbnail);
                }

            } else {
                u.showToast("取得に失敗しました: " + res.message, true);
            }
        } catch (e) {
            console.error(e);
            u.showToast("エラーが発生しました", true);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    },

    updateVideoUI: function(info) {
        const u = window.AddMusicUtils;
        document.getElementById('urlInputGroup').style.display = 'none';
        document.getElementById('videoInfoDisplay').style.display = 'block';
        document.getElementById('videoThumb').src = info.thumbnail;
        document.getElementById('videoDuration').textContent = u.formatDuration(info.duration);
        document.getElementById('videoTitleDisplay').textContent = info.title;
    },

    cancelVideo: function() {
        this.fetchedVideoInfo = null;
        const urlInput = document.getElementById('videoUrl');
        if(urlInput) urlInput.value = '';
        
        document.getElementById('urlInputGroup').style.display = 'block';
        document.getElementById('videoInfoDisplay').style.display = 'none';
        
        if (window.ArtworkController) window.ArtworkController.resetThumbnail();
    },

    getMusicFile: function() { return this.musicFile; },
    getVideoInfo: function() { return this.fetchedVideoInfo; },
    getSourceType: function() { return this.sourceType; }
};