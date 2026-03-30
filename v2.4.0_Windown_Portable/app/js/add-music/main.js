document.addEventListener('DOMContentLoaded', async () => {
    
    let activeTagsKeys = []; // 保存時のデータ抽出用

    try {
        // --- 動的なタグフォームの生成 ---
        const settings = await eel.get_app_settings()();
        const allTags = await eel.get_available_tags()();
        
        // ユーザーがDB用に有効化しているタグのみ抽出
        const activeTags = allTags.filter(t => settings.active_tags.includes(t.key));
        activeTagsKeys = activeTags.map(t => t.key);

        const container = document.getElementById('dynamicTagsContainer');
        container.innerHTML = '';

        activeTags.forEach(tag => {
            const group = document.createElement('div');
            group.className = 'form-group';
            
            const label = document.createElement('label');
            label.htmlFor = `tag_${tag.key}`;
            // タイトルとアーティストは必須項目にする
            if (tag.key === 'title' || tag.key === 'artist') {
                label.innerHTML = `${tag.label} <span class="required">*</span>`;
            } else {
                label.textContent = tag.label;
            }

            const input = document.createElement('input');
            input.id = `tag_${tag.key}`;
            
            // 数値系タグなら input type="number" にする
            if (['track', 'year', 'disc', 'bpm'].includes(tag.key)) {
                input.type = 'number';
                input.min = "1";
                if (tag.key === 'track') input.placeholder = "1";
            } else {
                input.type = 'text';
                input.placeholder = `${tag.label}を入力`;
            }

            if (tag.key === 'title' || tag.key === 'artist') {
                input.required = true;
            }

            group.appendChild(label);
            group.appendChild(input);
            container.appendChild(group);
        });
        
    } catch(e) {
        console.error("タグの初期化に失敗しました", e);
    }

    // --- コンポーネントの初期化 ---
    window.SourceController.init();
    window.ArtworkController.init();
    window.LyricController.init();

    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    function showLoading(msg) {
        loadingText.textContent = msg;
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    document.getElementById('addMusicForm').onsubmit = async (e) => {
        e.preventDefault();
        
        const u = window.AddMusicUtils;
        const sCtrl = window.SourceController;
        const aCtrl = window.ArtworkController;
        const lCtrl = window.LyricController;

        const sourceType = sCtrl.getSourceType();
        let musicFile = null;
        let videoInfo = null;

        if (sourceType === 'local') {
            musicFile = sCtrl.getMusicFile();
            if (!musicFile) {
                u.showAlert("音源となるファイルを選択してください");
                return;
            }
        } else if (sourceType === 'download') {
            videoInfo = sCtrl.getVideoInfo();
            if (!videoInfo) {
                u.showAlert("動画情報を取得してください");
                return;
            }
        }

        // --- 動的に生成されたタグからデータを収集 ---
        const metaData = {};
        activeTagsKeys.forEach(key => {
            const el = document.getElementById(`tag_${key}`);
            if (el) {
                metaData[key] = el.value.trim();
            }
        });

        // 歌詞は別途取得
        metaData.lyric = document.getElementById('lyric').value.trim();

        // アートワーク情報の取得
        metaData.artwork_data = aCtrl.getArtworkData(); 
        metaData.artwork_type = aCtrl.getActiveTab(); 

        const btnSubmit = document.getElementById('btnSubmitAll');
        btnSubmit.disabled = true;

        try {
            let result = false;

            if (sourceType === 'local') {
                showLoading("ファイルの読み込み中...");
                const b64Music = await u.readFileAsBase64(musicFile);
                
                metaData.music_data = b64Music;
                metaData.music_name = musicFile.name;

                showLoading("ライブラリへ保存中...");
                result = await eel.save_music_data(metaData)();
                
            } else if (sourceType === 'download') {
                showLoading("動画をダウンロード中... (数分かかる場合があります)");
                metaData.video_url = videoInfo.url;
                result = await eel.download_and_save_music(metaData)();
            }

            hideLoading();

            if (result) {
                u.showAlert("楽曲をライブラリに追加しました！");
                
                // フォームのリセット
                document.getElementById('addMusicForm').reset();
                sCtrl.reset();
                aCtrl.resetLocal();
                document.getElementById('lyric').value = '';
                
            } else {
                u.showAlert("保存に失敗しました。");
            }
            
        } catch (error) {
            hideLoading();
            console.error("Save Error:", error);
            u.showAlert("予期せぬエラーが発生しました。\n" + error.message);
        } finally {
            btnSubmit.disabled = false;
        }
    };
});