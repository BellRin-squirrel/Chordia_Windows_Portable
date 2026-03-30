(function() {
    const s = window.ManageState;
    const u = window.ManageUtils;

    window.ModalController = {
        currentLyricMusicId: null,
        currentSelectedLyric: "",

        init: function() {
            // アートワーク編集関連
            document.getElementById('btnCloseArtModalX').addEventListener('click', this.closeArtModal);
            document.getElementById('btnCancelArt').addEventListener('click', this.closeArtModal);
            document.getElementById('artModal').addEventListener('click', (e) => {
                if (e.target === document.getElementById('artModal')) this.closeArtModal();
            });

            document.getElementById('newArtInput').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const preview = document.getElementById('currentArtPreview');
                    preview.src = ev.target.result;
                    preview.style.display = 'block';
                    document.getElementById('artStatusText').textContent = "変更後の画像";
                    s.newArtBase64 = ev.target.result;
                };
                reader.readAsDataURL(file);
            });

            document.getElementById('btnExecRemoveArt').addEventListener('click', async () => {
                const item = s.libraryData[s.editingIndex];
                const success = await eel.update_song_artwork_by_id(item.musicFilename, null, true)();
                if (success) { u.showToast("削除しました", false); await window.TableController.fetchChunk(); }
                else { u.showToast("失敗しました", true); }
                this.closeArtModal();
            });

            document.getElementById('btnSaveArt').addEventListener('click', async () => {
                if (!s.newArtBase64) { this.closeArtModal(); return; }
                const item = s.libraryData[s.editingIndex];
                const success = await eel.update_song_artwork_by_id(item.musicFilename, s.newArtBase64, false)();
                if (success) { u.showToast("更新しました", false); await window.TableController.fetchChunk(); }
                else { u.showToast("失敗しました", true); }
                this.closeArtModal();
            });

            // 削除モーダル関連 (個別・一括共用)
            document.getElementById('btnCancelDelete').addEventListener('click', () => {
                document.getElementById('deleteModal').classList.remove('show');
            });

            document.getElementById('btnExecDelete').addEventListener('click', async () => {
                if (s.isSelectionMode && s.selectedIds.size > 0) {
                    const basenames = Array.from(s.selectedIds);
                    const result = await eel.delete_multiple_songs(basenames)();
                    if (result.success) {
                        u.showToast(`${result.count}曲を削除しました`, false);
                        s.selectedIds.clear();
                        window.TableController.toggleSelectionMode(); 
                        await window.TableController.fetchChunk();
                    } else {
                        u.showToast("削除に失敗しました", true);
                    }
                } else {
                    const item = s.libraryData[s.editingIndex];
                    const success = await eel.delete_song_by_id(item.musicFilename)();
                    if (success) {
                        u.showToast("削除しました", false);
                        if (s.currentPlayingIndex === s.editingIndex) {
                            window.PlayerController.stopPreview();
                            document.getElementById('playerBar').classList.remove('active');
                            s.currentPlayingIndex = -1;
                        }
                        await window.TableController.fetchChunk();
                    } else { 
                        u.showToast("失敗しました", true); 
                    }
                }
                document.getElementById('deleteModal').classList.remove('show');
            });

            // 一括変更モーダル関連
            document.getElementById('btnCancelBulkEdit').addEventListener('click', () => {
                document.getElementById('bulkEditModal').classList.remove('show');
            });

            document.getElementById('btnExecBulkEdit').addEventListener('click', async () => {
                const container = document.getElementById('bulkFormContainer');
                const inputs = container.querySelectorAll('input');
                const updates = {};
                
                inputs.forEach(input => {
                    const key = input.dataset.key;
                    updates[key] = input.value;
                });

                const basenames = Array.from(s.selectedIds);
                const btn = document.getElementById('btnExecBulkEdit');
                btn.disabled = true;
                btn.textContent = "処理中...";

                const result = await eel.update_multiple_songs(basenames, updates)();
                
                btn.disabled = false;
                btn.textContent = "すべて変更";

                if (result.success) {
                    u.showToast(`${result.count}曲の情報を更新しました`, false);
                    document.getElementById('bulkEditModal').classList.remove('show');
                    s.selectedIds.clear();
                    window.TableController.toggleSelectionMode(); 
                    await window.TableController.fetchChunk();
                } else {
                    u.showToast("更新に失敗しました", true);
                }
            });

            // 歌詞編集関連
            document.getElementById('btnCloseLyricModalX').addEventListener('click', this.closeLyricModal);
            document.getElementById('btnCancelLyric').addEventListener('click', this.closeLyricModal);
            document.getElementById('lyricModal').addEventListener('click', (e) => {
                if (e.target === document.getElementById('lyricModal')) this.closeLyricModal();
            });

            document.getElementById('btnSaveLyric').addEventListener('click', async () => {
                const text = document.getElementById('lyricTextArea').value;
                const item = s.libraryData[s.editingIndex];
                const success = await eel.save_lyrics_for_song(item.musicFilename, text)();
                if (success) {
                    u.showToast("歌詞を保存しました", false);
                    await window.TableController.fetchChunk(); 
                    this.closeLyricModal();
                } else {
                    u.showToast("保存に失敗しました", true);
                }
            });

            // 歌詞自動取得 (LRCLIB) 関連
            const btnAutoLyric = document.getElementById('btnAutoLyricManage');
            if (btnAutoLyric) btnAutoLyric.addEventListener('click', () => this.searchLyrics());

            const btnCancelLyricSearch = document.getElementById('btnCancelLyricSearchManage');
            if(btnCancelLyricSearch) btnCancelLyricSearch.addEventListener('click', () => {
                document.getElementById('lyricSearchModalManage').classList.remove('show');
            });

            const btnBackToResult = document.getElementById('btnBackToResultManage');
            if(btnBackToResult) btnBackToResult.addEventListener('click', () => {
                document.getElementById('lyricSearchDetailViewManage').style.display = 'none';
                document.getElementById('lyricSearchListViewManage').style.display = 'flex';
            });

            const btnApplyLyric = document.getElementById('btnApplyLyricManage');
            if(btnApplyLyric) btnApplyLyric.addEventListener('click', () => {
                const textArea = document.getElementById('lyricTextArea');
                if(textArea) textArea.value = this.currentSelectedLyric;
                document.getElementById('lyricSearchModalManage').classList.remove('show');
                u.showToast("歌詞を適用しました", false);
            });

            // ★追加: 高度な検索モーダルの初期化
            this.initAdvancedSearch();
        },

        openArtModal: function(index) {
            s.editingIndex = index;
            const item = s.libraryData[index];
            const currentSrc = item.imageData || s.DEFAULT_ICON;
            s.newArtBase64 = null;
            document.getElementById('newArtInput').value = '';
            const preview = document.getElementById('currentArtPreview');
            preview.src = currentSrc; preview.style.display = 'block';
            document.getElementById('artStatusText').textContent = item.imageFilename ? "現在の画像" : "画像なし (デフォルト)";
            document.getElementById('artModal').classList.add('show');
        },

        closeArtModal: function() {
            document.getElementById('artModal').classList.remove('show');
        },

        openLyricModal: async function(index) {
            s.editingIndex = index;
            const item = s.libraryData[index];
            const textArea = document.getElementById('lyricTextArea');
            
            if (this.currentLyricMusicId !== item.musicFilename) {
                this.currentLyricMusicId = item.musicFilename;
                let lyrics = item.lyric;
                if (!lyrics) {
                    lyrics = await eel.get_lyrics(item.musicFilename)();
                }
                textArea.value = lyrics || "";
            }

            document.getElementById('lyricTargetTitle').textContent = `${item.title} - ${item.artist}`;
            document.getElementById('lyricModal').classList.add('show');
        },

        closeLyricModal: function() {
            document.getElementById('lyricModal').classList.remove('show');
        },

        openDeleteModal: function(index) {
            s.editingIndex = index;
            const item = s.libraryData[index];
            document.getElementById('deleteTargetName').textContent = item.title;
            document.getElementById('deleteModal').classList.add('show');
        },

        openBulkDeleteModal: function() {
            if (s.selectedIds.size === 0) return;
            s.editingIndex = -1;
            document.getElementById('deleteTargetName').textContent = `選択された ${s.selectedIds.size} 曲`;
            document.getElementById('deleteModal').classList.add('show');
        },

        openBulkEditModal: async function() {
            if (s.selectedIds.size === 0) return;
            
            const basenames = Array.from(s.selectedIds);
            const commonValues = await eel.get_common_values_for_selected(basenames)();
            
            const container = document.getElementById('bulkFormContainer');
            container.innerHTML = '';

            const keysToEdit = [
                { key: 'title', label: 'タイトル' },
                { key: 'artist', label: 'アーティスト' },
                { key: 'album', label: 'アルバム' },
                { key: 'genre', label: 'ジャンル' },
                { key: 'track', label: 'トラック' },
                { key: 'lyric', label: '歌詞' }
            ];

            keysToEdit.forEach(def => {
                const val = commonValues[def.key];
                const isKeep = (val === "__KEEP__");
                const displayVal = isKeep ? "< 維持 >" : (val || "");

                const div = document.createElement('div');
                div.className = 'bulk-field';
                div.innerHTML = `
                    <label>${def.label}</label>
                    <input type="text" data-key="${def.key}" class="${isKeep ? 'keep-value' : ''}" value="${displayVal}">
                `;

                const input = div.querySelector('input');
                input.addEventListener('focus', () => {
                    if (input.classList.contains('keep-value')) {
                        input.value = '';
                        input.classList.remove('keep-value');
                    }
                });
                
                input.addEventListener('blur', () => {
                    if (input.value.trim() === '') {
                        input.value = "< 維持 >";
                        input.classList.add('keep-value');
                    }
                });

                container.appendChild(div);
            });

            document.getElementById('bulkEditModal').classList.add('show');
        },

        searchLyrics: async function() {
            const item = s.libraryData[s.editingIndex];
            const title = item.title || "";
            const artist = item.artist || "";
            const btn = document.getElementById('btnAutoLyricManage');

            if (!title || !artist) { 
                u.showToast("タイトルとアーティストが設定されていません", true); 
                return; 
            }

            const orgText = btn.textContent;
            btn.textContent = "検索中...";
            btn.disabled = true;

            try {
                const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error("API Error");
                const data = await res.json();
                const validData = data.filter(item => item.plainLyrics);
                
                if (validData.length === 0) {
                    u.showToast("見つかりませんでした", true);
                } else {
                    this.renderLyricResults(validData);
                    const modal = document.getElementById('lyricSearchModalManage');
                    document.getElementById('lyricSearchListViewManage').style.display = 'flex';
                    document.getElementById('lyricSearchDetailViewManage').style.display = 'none';
                    modal.classList.add('show');
                }
            } catch (e) {
                console.error(e);
                u.showToast("検索エラー", true);
            } finally {
                btn.textContent = orgText;
                btn.disabled = false;
            }
        },

        renderLyricResults: function(results) {
            const list = document.getElementById('lyricResultListManage');
            list.innerHTML = '';
            results.forEach(item => {
                const li = document.createElement('li');
                li.className = 'lyric-result-item';
                li.innerHTML = `
                    <div class="lyric-item-title">${u.escapeHtml(item.trackName)}</div>
                    <div class="lyric-item-artist">${u.escapeHtml(item.artistName)}</div>
                `;
                li.onclick = () => {
                    this.currentSelectedLyric = item.plainLyrics;
                    document.getElementById('lyricPreviewTextManage').textContent = item.plainLyrics;
                    document.getElementById('lyricSearchListViewManage').style.display = 'none';
                    document.getElementById('lyricSearchDetailViewManage').style.display = 'flex';
                };
                list.appendChild(li);
            });
        },

        // ==========================================
        // ★追加: 高度な検索ロジック
        // ==========================================
        initAdvancedSearch: function() {
            const container = document.getElementById('advSearchRowsContainer');
            if (!container) return;

            const btnApply = document.getElementById('btnApplyAdvSearch');
            const btnClear = document.getElementById('btnClearAdvSearch');
            
            // 初期の1行を作成
            this.addAdvSearchRow();

            btnApply.addEventListener('click', () => {
                const conditions = [];
                const rows = container.querySelectorAll('.adv-search-row');
                
                rows.forEach(row => {
                    const field = row.querySelector('.adv-field-select').value;
                    const operator = row.querySelector('.adv-operator-select').value;
                    let value;

                    if (operator === 'range') {
                        const inputs = row.querySelectorAll('input');
                        value = [inputs[0].value, inputs[1].value];
                    } else {
                        value = row.querySelector('input').value;
                    }

                    // 空文字はスキップ
                    if (Array.isArray(value)) {
                        if(value[0] !== "" || value[1] !== "") conditions.push({ field, operator, value });
                    } else {
                        if (value.trim() !== "") conditions.push({ field, operator, value });
                    }
                });

                if (conditions.length > 0) {
                    window.TableController.execAdvancedSearch(conditions);
                    document.getElementById('advancedSearchModal').classList.remove('show');
                } else {
                    u.showToast("検索条件を入力してください", true);
                }
            });

            btnClear.addEventListener('click', () => {
                // 条件をリセットして全件表示に戻す
                container.innerHTML = '';
                this.addAdvSearchRow(); // 1行だけに戻す
                window.TableController.execAdvancedSearch(null); // クリア
                document.getElementById('advancedSearchModal').classList.remove('show');
            });
        },

        addAdvSearchRow: function() {
            const container = document.getElementById('advSearchRowsContainer');
            const row = document.createElement('div');
            row.className = 'adv-search-row';

            // 1. フィールド（タグ）のセレクトボックス作成
            let fieldOptions = '';
            s.activeTags.forEach(tag => {
                const selected = tag === 'artist' ? 'selected' : '';
                fieldOptions += `<option value="${tag}" ${selected}>${s.tagLabels[tag] || tag}</option>`;
            });
            // 歌詞も検索対象に加える
            fieldOptions += `<option value="lyric">歌詞</option>`;

            const numFields = ['track', 'disc', 'year', 'bpm'];

            row.innerHTML = `
                <select class="adv-field-select">${fieldOptions}</select>
                <span class="adv-text">が</span>
                <div class="adv-input-container"></div>
                <select class="adv-operator-select"></select>
                <button class="adv-btn-circle adv-btn-remove" title="行を削除">ー</button>
                <button class="adv-btn-circle adv-btn-add" title="条件を追加">＋</button>
            `;

            const fieldSelect = row.querySelector('.adv-field-select');
            const operatorSelect = row.querySelector('.adv-operator-select');
            const inputContainer = row.querySelector('.adv-input-container');

            // フィールド変更時にオペレーターと入力欄を切り替える関数
            const updateRowUI = () => {
                const isNum = numFields.includes(fieldSelect.value);
                const currentOp = operatorSelect.value;
                
                let opOptions = '';
                if (isNum) {
                    opOptions = `
                        <option value="equals">と完全一致する</option>
                        <option value="not_equals">と完全一致しない</option>
                        <option value="greater">より大きい</option>
                        <option value="less">より小さい</option>
                        <option value="range">の範囲内</option>
                    `;
                } else {
                    opOptions = `
                        <option value="contains" selected>を含む</option>
                        <option value="not_contains">を含まない</option>
                        <option value="equals">と完全一致する</option>
                        <option value="not_equals">と完全一致しない</option>
                        <option value="startswith">で始まる</option>
                        <option value="endswith">で終わる</option>
                    `;
                }
                operatorSelect.innerHTML = opOptions;

                // 範囲指定の場合は2つの入力欄
                if (isNum && operatorSelect.value === 'range') {
                    inputContainer.innerHTML = `
                        <input type="number" placeholder="最小">
                        <span class="adv-text">～</span>
                        <input type="number" placeholder="最大">
                    `;
                } else {
                    inputContainer.innerHTML = `<input type="${isNum ? 'number' : 'text'}" placeholder="検索ワード">`;
                }
            };

            fieldSelect.addEventListener('change', updateRowUI);
            operatorSelect.addEventListener('change', updateRowUI);

            // 初期化
            updateRowUI();

            // ボタンのイベント
            const btnRemove = row.querySelector('.adv-btn-remove');
            btnRemove.addEventListener('click', () => {
                row.remove();
                this.updateAdvRemoveButtons();
            });

            const btnAdd = row.querySelector('.adv-btn-add');
            btnAdd.addEventListener('click', () => {
                this.addAdvSearchRow();
            });

            container.appendChild(row);
            this.updateAdvRemoveButtons();
        },

        updateAdvRemoveButtons: function() {
            const rows = document.querySelectorAll('.adv-search-row');
            rows.forEach(row => {
                const btn = row.querySelector('.adv-btn-remove');
                // 行が1つしかない場合は削除ボタンを無効化
                btn.disabled = rows.length === 1;
            });
        }
    };
})();