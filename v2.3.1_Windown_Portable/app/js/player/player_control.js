(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    window.PlayerController = {
        init: function() {
            this.audio = document.getElementById('mainAudio');
            this.seekBar = document.getElementById('hpSeekBar');

            // ヘッダーのコントロールボタン
            document.getElementById('hdrBtnPlayPause').addEventListener('click', () => this.togglePlayPause());
            document.getElementById('hdrBtnNext').addEventListener('click', () => this.nextSong());
            document.getElementById('hdrBtnPrev').addEventListener('click', () => this.prevSong());
            document.getElementById('hdrBtnStop').addEventListener('click', () => {
                this.stopPlayback();
                document.getElementById('headerPlayerInfo').style.display = 'none';
                document.getElementById('headerControls').style.display = 'none';
                document.getElementById('headerLogo').style.display = 'flex';
            });

            // Audioイベント
            this.audio.addEventListener('ended', () => this.nextSong());
            
            this.audio.addEventListener('timeupdate', () => {
                if (!s.isSeeking) {
                    const curr = this.audio.currentTime;
                    const dur = this.audio.duration;
                    if (dur) {
                        const ratio = curr / dur;
                        this.seekBar.value = ratio * 1000;
                        this.updateSeekColor(ratio * 100);
                        document.getElementById('hpTimeCurrent').textContent = u.formatTime(curr);
                        document.getElementById('hpTimeTotal').textContent = u.formatTime(dur);
                    }
                }
            });

            // シークバー制御
            this.seekBar.addEventListener('mousedown', () => s.isSeeking = true);
            this.seekBar.addEventListener('input', () => this.updateSeekColor(this.seekBar.value / 10));
            this.seekBar.addEventListener('change', () => {
                if (this.audio.duration) {
                    this.audio.currentTime = (this.seekBar.value / 1000) * this.audio.duration;
                }
                s.isSeeking = false;
            });
            
            this.updateSeekColor(0);

            // キーボードショートカット
            document.addEventListener('keydown', (e) => {
                if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
                if (e.code === 'Space') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (document.getElementById('headerPlayerInfo').style.display !== 'none') {
                            document.getElementById('hdrBtnStop').click();
                        }
                    } else if (s.queue.length > 0) {
                        this.togglePlayPause();
                    }
                }
            });
        },

        startPlaybackSession: function(mode, startIndex = 0) {
            if (s.currentPlaylistIndex === -1 || !s.playlists[s.currentPlaylistIndex]) return;
            const pl = s.playlists[s.currentPlaylistIndex];
            if (!pl || !pl.songs || pl.songs.length === 0) return;

            document.getElementById('headerLogo').style.display = 'none';
            document.getElementById('headerPlayerInfo').style.display = 'flex';
            document.getElementById('headerControls').style.display = 'flex';

            const sortedList = u.sortSongs(pl.songs, pl.sortBy);
            s.originalList = [...sortedList];

            if (mode === 'shuffle') {
                s.isShuffle = true;
                s.loopMode = 'off';
                s.queue = u.shuffleArray([...s.originalList]);
                s.currentIndex = 0;
            } else {
                if (!s.isShuffle) s.queue = [...s.originalList];
                s.currentIndex = startIndex;
                if (s.isShuffle) {
                    const targetSong = s.originalList[startIndex];
                    const qIdx = s.queue.findIndex(x => x.musicFilename === targetSong.musicFilename);
                    if (qIdx !== -1) s.currentIndex = qIdx;
                }
            }
            
            window.HeaderController.updateToggleButtons();
            this.playCurrentIndex();
        },

        playCurrentIndex: function() {
            if (s.queue.length === 0 || s.currentIndex < 0) return;
            const song = s.queue[s.currentIndex];
            if (!song || !song.musicFilename) return;

            // 再生可能なソースがあるか最終チェック
            const fname = song.musicFilename.split(/[\\/]/).pop();
            if (!fname) {
                console.error("Invalid music filename");
                return;
            }

            this.audio.src = `/stream_music/${fname}`;
            this.audio.play().catch(e => {
                console.error("再生エラー:", e);
                // ソースが見つからないエラーへの対策
                if (e.name === 'NotSupportedError') {
                    u.showToast("再生可能なファイルが見つかりません", true);
                }
            });
            s.isPlaying = true;

            window.HeaderController.updateHeaderUI(song);
            window.HeaderController.updatePlayIcons(true);
            window.MainViewController.renderMainView(); 
        },

        togglePlayPause: function() {
            if (s.queue.length === 0 || !this.audio.src) return;
            if (this.audio.paused) {
                this.audio.play();
                s.isPlaying = true;
                window.HeaderController.updatePlayIcons(true);
            } else {
                this.audio.pause();
                s.isPlaying = false;
                window.HeaderController.updatePlayIcons(false);
            }
            window.MainViewController.renderMainView();
        },

        stopPlayback: function() {
            this.audio.pause();
            this.audio.src = ""; // ソースをクリア
            this.audio.currentTime = 0;
            s.isPlaying = false;
            window.HeaderController.updatePlayIcons(false);
            window.MainViewController.renderMainView();
        },

        nextSong: function() {
            if (s.loopMode === 'one') {
                this.audio.currentTime = 0;
                this.audio.play();
                return;
            }
            if (s.currentIndex < s.queue.length - 1) {
                s.currentIndex++;
                this.playCurrentIndex();
            } else {
                if (s.loopMode === 'all') {
                    if (s.isShuffle) s.queue = u.shuffleArray([...s.originalList]);
                    s.currentIndex = 0;
                    this.playCurrentIndex();
                } else {
                    this.stopPlayback();
                }
            }
        },

        prevSong: function() {
            if (this.audio.currentTime > 3) {
                this.audio.currentTime = 0;
                return;
            }
            if (s.currentIndex > 0) {
                s.currentIndex--;
                this.playCurrentIndex();
            } else {
                if (s.loopMode === 'all') {
                    s.currentIndex = s.queue.length - 1;
                    this.playCurrentIndex();
                } else {
                    this.audio.currentTime = 0;
                }
            }
        },

        isSongPlaying: function(song) {
            if (s.queue.length === 0 || s.currentIndex < 0) return false;
            const currentSong = s.queue[s.currentIndex];
            if (!currentSong) return false;
            return currentSong.musicFilename === song.musicFilename;
        },
        
        syncShuffle: function() {},
        
        updateSeekColor: function(p) {
            this.seekBar.style.background = `linear-gradient(to right, var(--primary-color) ${p}%, #e5e7eb ${p}%)`;
        }
    };
})();