(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    window.HeaderController = {
        init: function() {
            this.hpTitleContainer = document.getElementById('hpTitleContainer');
            this.hpSubContainer = document.getElementById('hpSubContainer');
            this.hpArtImg = document.getElementById('hpArtImg');
            this.btnShuffleToggle = document.getElementById('btnShuffleToggle');
            this.btnLoopToggle = document.getElementById('btnLoopToggle');
            this.hdrBtnPlayPause = document.getElementById('hdrBtnPlayPause');
            
            const artWrapper = document.querySelector('.hp-art');
            if (artWrapper) {
                artWrapper.style.cursor = 'pointer';
                artWrapper.title = '小再生ウィンドウを開く';
                artWrapper.addEventListener('click', () => {
                    this.launchMiniPlayer();
                });
            }

            this.btnShuffleToggle.addEventListener('click', () => {
                s.isShuffle = !s.isShuffle;
                window.PlayerController.syncShuffle();
                this.updateToggleButtons();
            });

            this.btnLoopToggle.addEventListener('click', () => {
                if (s.loopMode === 'off') s.loopMode = 'all';
                else if (s.loopMode === 'all') s.loopMode = 'one';
                else s.loopMode = 'off';
                this.updateToggleButtons();
            });

            const btnMore = document.getElementById('btnHeaderMore');
            if (btnMore) {
                btnMore.addEventListener('click', () => this.openQueueLyricsModal());
            }

            this.initModalTabs();
            this.updateToggleButtons();
        },

        launchMiniPlayer: function() {
            const width = 400;
            const height = 960;
            const left = window.screen.width - width - 20;
            const top = 50;

            window.open(
                'mini_player.html',
                'ChordiaMiniPlayer',
                `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`
            );
        },

        initModalTabs: function() {
            const modal = document.getElementById('queueLyricsModal');
            const btnClose = document.getElementById('btnCloseQueueLyrics');
            if (btnClose) btnClose.onclick = () => modal.classList.remove('show');

            const tabs = modal.querySelectorAll('.tab-btn');
            tabs.forEach(btn => {
                btn.onclick = () => {
                    tabs.forEach(b => b.classList.remove('active'));
                    modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    const pane = document.getElementById(btn.dataset.target);
                    if (pane) pane.classList.add('active');
                };
            });
        },

        openQueueLyricsModal: function() {
            const modal = document.getElementById('queueLyricsModal');
            if (!modal) return;

            const queueList = document.getElementById('modalQueueList');
            queueList.innerHTML = '';
            const nextSongsRaw = s.queue.slice(s.currentIndex + 1, s.currentIndex + 52);

            if (nextSongsRaw.length > 0) {
                const displaySongs = nextSongsRaw.slice(0, 50);
                displaySongs.forEach((song) => {
                    const item = document.createElement('div');
                    item.className = 'detail-item';
                    
                    const artSrc = song.imageData || s.DEFAULT_ICON;

                    // ★ 修正: 番号を削除し、アートワーク＋タイトル＋アーティストの表示に変更
                    item.innerHTML = `
                        <img src="${artSrc}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; margin-right: 12px;">
                        <div class="detail-value" style="display: flex; flex-direction: column; justify-content: center; overflow: hidden;">
                            <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1rem;">${u.escapeHtml(song.title)}</strong>
                            <small style="opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem;">${u.escapeHtml(song.artist)}</small>
                        </div>
                    `;
                    queueList.appendChild(item);
                });

                if (nextSongsRaw.length > 50) {
                    const moreMsg = document.createElement('div');
                    moreMsg.className = 'no-lyrics';
                    moreMsg.style.marginTop = '10px';
                    moreMsg.style.padding = '20px 0';
                    moreMsg.style.borderTop = '1px dashed rgba(128,128,128,0.2)';
                    moreMsg.textContent = "再生はまだ続きます";
                    queueList.appendChild(moreMsg);
                }
            } else {
                queueList.innerHTML = '<div class="no-lyrics">次に再生される曲はありません</div>';
            }

            const lyricsView = document.getElementById('modalLyricsView');
            const currentSong = s.queue[s.currentIndex];
            if (currentSong) {
                lyricsView.textContent = currentSong.lyric || "歌詞情報はありません。";
            } else {
                lyricsView.textContent = "";
            }

            modal.querySelector('.tab-btn[data-target="tab-nextup"]').click();
            modal.classList.add('show');
        },

        updateHeaderUI: function(song) {
            this.setTextWithMarquee(this.hpTitleContainer, song.title || 'Unknown', 'hp-title');
            
            const album = song.album || ''; 
            const artist = song.artist || '';
            let subText = "";
            if(album && artist) subText = `${album} - ${artist}`;
            else subText = album || artist;
            this.setTextWithMarquee(this.hpSubContainer, subText, 'hp-sub');

            const artSrc = song.imageData || s.DEFAULT_ICON;
            this.hpArtImg.src = artSrc;
        },

        setTextWithMarquee: function(container, text, className) {
            container.innerHTML = `<div class="${className}">${u.escapeHtml(text)}</div>`;
            const element = container.firstElementChild;
            if (element && element.scrollWidth > container.clientWidth) {
                const escaped = u.escapeHtml(text);
                container.innerHTML = `<div class="marquee-wrapper"><span class="marquee-content">${escaped}</span><span class="marquee-content">${escaped}</span></div>`;
            }
        },

        updatePlayIcons: function(isPlaying) {
            if (this.hdrBtnPlayPause) {
                if (isPlaying) {
                    this.hdrBtnPlayPause.innerHTML = s.SVG_PAUSE;
                    this.hdrBtnPlayPause.title = "一時停止 (Space)";
                } else {
                    this.hdrBtnPlayPause.innerHTML = s.SVG_PLAY;
                    this.hdrBtnPlayPause.title = "再生 (Space)";
                }
            }
        },

        updateToggleButtons: function() {
            if (this.btnShuffleToggle) {
                if (s.isShuffle) this.btnShuffleToggle.classList.add('active');
                else this.btnShuffleToggle.classList.remove('active');
            }

            if (this.btnLoopToggle) {
                this.btnLoopToggle.className = 'btn-icon-toggle';
                if (s.loopMode === 'all') this.btnLoopToggle.classList.add('active');
                else if (s.loopMode === 'one') this.btnLoopToggle.classList.add('active-one');
            }
        }
    };
})();