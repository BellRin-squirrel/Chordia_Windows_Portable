(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    window.PlayerController = {
        lastMiniPushTime: 0, 

        init: function() {
            this.audio = document.getElementById('mainAudio');
            this.seekBar = document.getElementById('hpSeekBar');
            this.volumeBar = document.getElementById('volumeBar');

            if (this.volumeBar) {
                const savedVolume = localStorage.getItem('player_volume');
                const initialVolume = (savedVolume !== null) ? parseFloat(savedVolume) : 100;
                this.volumeBar.value = initialVolume;
                this.setVolume(initialVolume);

                this.volumeBar.oninput = (e) => {
                    const val = parseFloat(e.target.value);
                    this.setVolume(val);
                    localStorage.setItem('player_volume', val);
                };
            }

            const btnPlayPause = document.getElementById('hdrBtnPlayPause');
            if (btnPlayPause) btnPlayPause.addEventListener('click', () => this.togglePlayPause());
            
            const btnNext = document.getElementById('hdrBtnNext');
            if (btnNext) btnNext.addEventListener('click', () => this.nextSong());
            
            const btnPrev = document.getElementById('hdrBtnPrev');
            if (btnPrev) btnPrev.addEventListener('click', () => this.prevSong());
            
            const btnStop = document.getElementById('hdrBtnStop');
            if (btnStop) btnStop.addEventListener('click', () => {
                this.stopPlayback();
                const info = document.getElementById('headerPlayerInfo');
                const ctrl = document.getElementById('headerControls');
                const logo = document.getElementById('headerLogo');
                if (info) info.style.display = 'none';
                if (ctrl) ctrl.style.display = 'none';
                if (logo) logo.style.display = 'flex';
            });

            if (this.audio) {
                this.audio.addEventListener('ended', () => this.nextSong());
                this.audio.addEventListener('timeupdate', () => {
                    if (!s.isSeeking) {
                        const curr = this.audio.currentTime;
                        const dur = this.audio.duration;
                        if (dur) {
                            const ratio = curr / dur;
                            if (this.seekBar) {
                                this.seekBar.value = ratio * 1000;
                                this.updateSeekColor(ratio * 100);
                            }
                            const curEl = document.getElementById('hpTimeCurrent');
                            const totEl = document.getElementById('hpTimeTotal');
                            if (curEl) curEl.textContent = u.formatTime(curr);
                            if (totEl) totEl.textContent = u.formatTime(dur);
                            
                            const now = Date.now();
                            if (now - this.lastMiniPushTime > 1000) {
                                this.pushStateToMini();
                                this.lastMiniPushTime = now;
                            }
                        }
                    }
                });
            }

            if (this.seekBar) {
                this.seekBar.addEventListener('mousedown', () => s.isSeeking = true);
                this.seekBar.addEventListener('input', () => this.updateSeekColor(this.seekBar.value / 10));
                this.seekBar.addEventListener('change', () => {
                    if (this.audio && this.audio.duration) {
                        this.audio.currentTime = (this.seekBar.value / 1000) * this.audio.duration;
                    }
                    s.isSeeking = false;
                    this.pushStateToMini(true); 
                });
                this.updateSeekColor(0);
            }

            document.addEventListener('keydown', (e) => {
                if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
                if (e.code === 'Space') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        const info = document.getElementById('headerPlayerInfo');
                        if (info && info.style.display !== 'none') {
                            const btn = document.getElementById('hdrBtnStop');
                            if (btn) btn.click();
                        }
                    } else if (s.queue.length > 0) {
                        this.togglePlayPause();
                    }
                }
            });
        },

        pushStateToMini: function(force = false) {
            if (!this.audio) return;
            const state = {
                song: s.queue[s.currentIndex] || null,
                isPlaying: s.isPlaying,
                currentTime: this.audio.currentTime,
                duration: this.audio.duration,
                queue: s.queue.slice(s.currentIndex + 1, s.currentIndex + 52)
            };
            
            if (window.HeaderController && window.HeaderController.miniPlayerWindow) {
                const miniWin = window.HeaderController.miniPlayerWindow;
                if (!miniWin.closed && miniWin.MiniPlayer) {
                    try {
                        miniWin.MiniPlayer.render(state);
                    } catch (e) {}
                }
            }
        },

        setVolume: function(val) {
            if (this.audio) {
                const normalized = val / 100;
                this.audio.volume = normalized;
                if (this.volumeBar) {
                    this.volumeBar.style.background = `linear-gradient(to right, var(--primary-color) ${val}%, rgba(128,128,128,0.2) ${val}%)`;
                }
            }
        },

        startPlaybackSession: function(mode, startIndex = 0) {
            // ★ 修正: 仮想プレイリストか物理プレイリストかを判定
            const isVirtual = s.currentPlaylistType === 'virtual';
            const targetPl = isVirtual ? s.currentVirtualPlaylist : s.playlists[s.currentPlaylistIndex];

            if (!targetPl || !targetPl.songs) return;

            document.getElementById('headerLogo').style.display = 'none';
            document.getElementById('headerPlayerInfo').style.display = 'flex';
            document.getElementById('headerControls').style.display = 'flex';

            const sortedList = u.sortSongs(targetPl.songs, targetPl.sortBy, targetPl.sortDesc);
            s.originalList = [...sortedList];

            if (mode === 'shuffle') {
                s.isShuffle = true;
                s.loopMode = 'off';
                s.queue = u.shuffleArray([...s.originalList]);
                s.currentIndex = 0;
            } else {
                s.isShuffle = false;
                s.loopMode = 'off';
                s.queue = [...s.originalList];
                s.currentIndex = startIndex;
            }
            
            if (window.HeaderController) {
                window.HeaderController.updateToggleButtons();
            }
            
            this.playCurrentIndex();
        },

        playCurrentIndex: function() {
            if (s.queue.length === 0 || s.currentIndex < 0) return;
            const song = s.queue[s.currentIndex];
            if (!song || !song.musicFilename) return;

            const fname = song.musicFilename.split(/[\\/]/).pop();
            
            this.audio.pause();
            this.audio.src = `/stream_music/${fname}`;
            this.audio.load();

            const playPromise = this.audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    s.isPlaying = true;
                    if (window.HeaderController) window.HeaderController.updatePlayIcons(true);
                    this.afterPlayStarted(song);
                }).catch(e => {
                    console.error("Playback failed:", e);
                    s.isPlaying = false;
                    if (window.HeaderController) window.HeaderController.updatePlayIcons(false);
                });
            }
        },

        afterPlayStarted: function(song) {
            if (window.HeaderController) window.HeaderController.updateHeaderUI(song);
            if (window.MainViewController) window.MainViewController.renderMainView(); 
            
            setTimeout(() => {
                eel.record_playback(song)();
                this.pushStateToMini(true);
            }, 10);
        },

        togglePlayPause: function() {
            if (s.queue.length === 0 || !this.audio || !this.audio.src) return;
            if (this.audio.paused) {
                this.audio.play().then(() => {
                    s.isPlaying = true;
                    if (window.HeaderController) window.HeaderController.updatePlayIcons(true);
                    this.pushStateToMini(true);
                });
            } else {
                this.audio.pause();
                s.isPlaying = false;
                if (window.HeaderController) window.HeaderController.updatePlayIcons(false);
                this.pushStateToMini(true);
            }
            if (window.MainViewController) window.MainViewController.renderMainView();
        },

        stopPlayback: function() {
            if (!this.audio) return;
            this.audio.pause();
            this.audio.src = ""; 
            this.audio.currentTime = 0;
            s.isPlaying = false;
            if (window.HeaderController) window.HeaderController.updatePlayIcons(false);
            if (window.MainViewController) window.MainViewController.renderMainView();
            this.pushStateToMini(true); 
        },

        nextSong: function() {
            if (s.loopMode === 'one' && this.audio) {
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
            if (this.audio && this.audio.currentTime > 3) {
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
                } else if (this.audio) {
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
            if (this.seekBar) {
                this.seekBar.style.background = `linear-gradient(to right, var(--primary-color) ${p}%, rgba(128,128,128,0.2) ${p}%)`;
            }
        }
    };
})();