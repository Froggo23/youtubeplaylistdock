let playlistData = [];
let currentTrackIndex = 0;
let playerState = -1;
let currentPage = 1;
const itemsPerPage = 3;
let uiStage = 3;
let currentDuration = 0;

(async function() {
    const container = document.createElement('div');
    container.id = 'ytp-container';
    document.body.appendChild(container);
    const data = await chrome.storage.local.get(['selectedPlaylistId', 'selectedPlaylistTitle']);
    if (data.selectedPlaylistId) {
        initializePlayer(data.selectedPlaylistId, data.selectedPlaylistTitle);
    } else {
        renderInitialButton();
    }
})();

function injectScript(file_path) {
    const script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', file_path);
    (document.head || document.documentElement).appendChild(script);
}

function renderInitialButton() {
    const container = document.getElementById('ytp-container');
    container.innerHTML = `<button id="ytp-connect-btn">Connect and Select Playlist</button>`;
    document.getElementById('ytp-connect-btn').addEventListener('click', handleAuth);
}

function renderPlaylistSelection(playlists) {
    const container = document.getElementById('ytp-container');
    const listItems = playlists.map(p => `<li data-id="${p.id}" data-title="${p.snippet.title}">${p.snippet.title}</li>`).join('');
    container.innerHTML = `<div class="ytp-selection-ui" id="ytp-selection-drag-handle"><h3>Select a Playlist</h3><ul>${listItems}</ul></div>`;
    container.querySelectorAll('li').forEach(item => item.addEventListener('click', handlePlaylistSelection));
    makeElementDraggable('#ytp-selection-drag-handle', '#ytp-container');
}

function renderPlayerUI(playlistName) {
    const container = document.getElementById('ytp-container');
    container.innerHTML = `
        <div class="ytp-ui">
            <div class="ytp-main" id="ytp-player-drag-handle">
                <div class="ytp-window-controls">
                    <button class="ytp-window-btn" id="ytp-close-btn" disabled></button>
                    <button class="ytp-window-btn" id="ytp-min-btn"></button>
                    <button class="ytp-window-btn" id="ytp-max-btn"></button>
                </div>
                <div id="ytp-player-embed" style="position:absolute; top:-9999px; left:-9999px;"></div>
                <div class="ytp-details">
                    <img id="ytp-album-art" src="" alt="Album Art">
                    <div class="ytp-info">
                        <p id="ytp-song-title">Loading...</p><p id="ytp-artist-name"></p>
                        <div id="ytp-progress-bar-container"><div id="ytp-progress-bar"></div></div>
                        <div class="ytp-timestamps"><span id="ytp-current-time">0:00</span><span id="ytp-total-time">0:00</span></div>
                    </div>
                </div>
                <div class="ytp-controls">
                     <button id="ytp-prev-btn" title="Previous" disabled>
                        <svg viewBox="0 0 24 24"><path d="M6 18V6h2v12H6zm3.5-6L18 6v12l-8.5-6z"></path></svg>
                    </button>
                    <button id="ytp-play-pause-btn" title="Play">
                         <svg id="ytp-play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                         <svg id="ytp-pause-icon" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
                    </button>
                    <button id="ytp-next-btn" title="Next" disabled>
                        <svg viewBox="0 0 24 24"><path d="M16 6v12h2V6h-2zm-3.5 6L6 18V6l8.5 6z"></path></svg>
                    </button>
                </div>
            </div>
            <div class="ytp-playlist">
                <div class="ytp-playlist-header">
                    <h3>${playlistName}</h3>
                    <button id="ytp-change-playlist-btn" title="Change Playlist">
                        <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path></svg>
                    </button>
                </div>
                <div id="ytp-song-list"></div>
                <div id="ytp-pagination"></div>
            </div>
        </div>`;
    addEventListeners();
    updatePlaylistDisplay();
}

function handleAuth() {
    chrome.runtime.sendMessage({ action: 'authenticate' }, response => {
        if (response.error) { alert('Authentication failed.'); return; }
        renderPlaylistSelection(response.playlists);
    });
}

function handleChangePlaylist() {
    chrome.runtime.sendMessage({ action: 'getPlaylists' }, response => {
        if (response.error) {
            alert('Could not fetch playlists. Please try authenticating again.');
            renderInitialButton();
            return;
        }
        renderPlaylistSelection(response.playlists);
    });
}

async function handlePlaylistSelection(e) {
    const playlistId = e.target.dataset.id;
    const playlistTitle = e.target.dataset.title;
    await chrome.storage.local.set({ selectedPlaylistId: playlistId, selectedPlaylistTitle: playlistTitle });
    window.location.reload();
}

function initializePlayer(playlistId, playlistTitle) {
    chrome.runtime.sendMessage({ action: 'getPlaylistItems', playlistId }, response => {
        if (response.error || !response.items || !response.items.length) {
            document.getElementById('ytp-container').innerHTML = `<p>Error: Could not load playlist.</p>`;
            return;
        }
        playlistData = response.items;
        const playlistName = playlistTitle || "Your Playlist";
        renderPlayerUI(playlistName);
        updateUIForTrack(playlistData[0]);
        updateNavButtonsState();
        injectScript(chrome.runtime.getURL('player.js'));
    });
}

function addEventListeners() {
    document.getElementById('ytp-play-pause-btn').addEventListener('click', togglePlayPause);
    document.getElementById('ytp-next-btn').addEventListener('click', playNext);
    document.getElementById('ytp-prev-btn').addEventListener('click', playPrev);
    document.getElementById('ytp-change-playlist-btn').addEventListener('click', handleChangePlaylist);

    document.getElementById('ytp-min-btn').addEventListener('click', () => {
        if (uiStage > 1) {
            uiStage--;
            updateUIVisibility();
        }
    });

    document.getElementById('ytp-max-btn').addEventListener('click', () => {
        if (uiStage < 4) {
            uiStage++;
            updateUIVisibility();
        }
    });

    document.getElementById('ytp-progress-bar-container').addEventListener('click', function(e) {
        if (currentDuration > 0) {
            const clickX = e.offsetX;
            const barWidth = this.clientWidth;
            const seekTime = (clickX / barWidth) * currentDuration;
            document.dispatchEvent(new CustomEvent('YTP_Control', {
                detail: { command: 'seekTo', args: { time: seekTime } }
            }));
        }
    });

    makeElementDraggable('#ytp-player-drag-handle', '#ytp-container');

    document.addEventListener('YTP_PlayerReady', () => {
        document.dispatchEvent(new CustomEvent('YTP_PlaylistData', { detail: playlistData }));
    });
    document.addEventListener('YTP_StateChange', (e) => {
        playerState = e.detail.state;
        updatePlayPauseIcon(playerState);
    });
    document.addEventListener('YTP_TimeUpdate', (e) => {
        currentDuration = e.detail.duration;
        updateProgressBar(e.detail.currentTime, e.detail.duration);
    });
    document.addEventListener('YTP_PlayNext', playNext);
}

function updateUIVisibility() {
    const container = document.getElementById('ytp-container');
    const minBtn = document.getElementById('ytp-min-btn');
    const maxBtn = document.getElementById('ytp-max-btn');
    container.classList.remove('minimized', 'medium', 'enlarged');
    switch (uiStage) {
        case 1: container.classList.add('minimized'); break;
        case 2: container.classList.add('medium'); break;
        case 3: break;
        case 4: container.classList.add('enlarged'); break;
    }
    minBtn.disabled = (uiStage === 1);
    maxBtn.disabled = (uiStage === 4);
}

function makeElementDraggable(handleSelector, containerSelector) {
    const dragHandle = document.querySelector(handleSelector);
    const container = document.querySelector(containerSelector);
    if (!dragHandle || !container) return;

    let offsetX, offsetY;
    const onMouseDown = (e) => {
        if (e.target.closest('button, li')) return;
        e.preventDefault();
        const style = window.getComputedStyle(container);
        const matrix = new DOMMatrixReadOnly(style.transform);
        offsetX = e.clientX - matrix.m41;
        offsetY = e.clientY - matrix.m42;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    };
    const onMouseMove = (e) => {
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        container.style.transform = `translate(${newX}px, ${newY}px)`;
    };
    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
    };
    dragHandle.addEventListener('mousedown', onMouseDown);
}

function loadVideo(index, autoplay) {
    currentTrackIndex = index;
    const newPage = Math.floor(currentTrackIndex / itemsPerPage) + 1;
    if (newPage !== currentPage) {
        currentPage = newPage;
    }
    updateUIForTrack(playlistData[index]);
    updateNavButtonsState();
    document.dispatchEvent(new CustomEvent('YTP_Control', {
        detail: { command: 'loadVideo', args: { videoId: playlistData[index].snippet.resourceId.videoId, autoplay } }
    }));
}

function togglePlayPause() {
    const command = (playerState !== 1) ? 'playVideo' : 'pauseVideo';
    document.dispatchEvent(new CustomEvent('YTP_Control', { detail: { command } }));
}

function playNext() {
    if (currentTrackIndex < playlistData.length - 1) {
        loadVideo(currentTrackIndex + 1, true);
    }
}

function playPrev() {
    if (currentTrackIndex > 0) {
        loadVideo(currentTrackIndex - 1, true);
    }
}

function updateUIForTrack(videoData) {
    if (!videoData) return;
    document.getElementById('ytp-song-title').textContent = videoData.snippet.title;
    document.getElementById('ytp-artist-name').textContent = videoData.snippet.videoOwnerChannelTitle;
    document.getElementById('ytp-album-art').src = videoData.snippet.thumbnails.high.url;
    const duration = parseISO8601Duration(videoData.contentDetails.duration);
    document.getElementById('ytp-total-time').textContent = formatTime(duration);
    updatePlaylistDisplay();
}

function updateNavButtonsState() {
    const prevBtn = document.getElementById('ytp-prev-btn');
    const nextBtn = document.getElementById('ytp-next-btn');
    prevBtn.disabled = currentTrackIndex === 0;
    nextBtn.disabled = currentTrackIndex === playlistData.length - 1;
}

function updatePlayPauseIcon(state) {
    const playIcon = document.getElementById('ytp-play-icon');
    const pauseIcon = document.getElementById('ytp-pause-icon');
    if (state === 1) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

function updateProgressBar(currentTime, duration) {
    if (duration > 0 && currentTime >= 0) {
        const progress = (currentTime / duration) * 100;
        document.getElementById('ytp-progress-bar').style.width = `${progress}%`;
        document.getElementById('ytp-current-time').textContent = formatTime(currentTime);
    }
}

function updatePlaylistDisplay() {
    const songList = document.getElementById('ytp-song-list');
    const pagination = document.getElementById('ytp-pagination');
    if (!songList || !pagination) return;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = playlistData.slice(startIndex, endIndex);
    songList.innerHTML = pageItems.map((item, index) => {
        const actualIndex = startIndex + index;
        return `<div class="ytp-song-item ${actualIndex === currentTrackIndex ? 'active' : ''}" data-index="${actualIndex}">
                    <span>${item.snippet.title}</span>
                </div>`;
    }).join('');
    songList.querySelectorAll('.ytp-song-item').forEach(item => {
        item.addEventListener('click', (e) => loadVideo(parseInt(e.currentTarget.dataset.index), true));
    });
    const totalPages = Math.ceil(playlistData.length / itemsPerPage);
    pagination.innerHTML = '';
    if (totalPages <= 1) return;
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&lt;';
    prevButton.classList.add('ytp-page-btn');
    if (currentPage === 1) prevButton.disabled = true;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updatePlaylistDisplay();
        }
    });
    pagination.appendChild(prevButton);
    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.classList.add('ytp-page-btn');
        if (i === currentPage) pageButton.classList.add('active');
        pageButton.addEventListener('click', () => {
            currentPage = i;
            updatePlaylistDisplay();
        });
        pagination.appendChild(pageButton);
    }
    const nextButton = document.createElement('button');
    nextButton.innerHTML = '&gt;';
    nextButton.classList.add('ytp-page-btn');
    if (currentPage === totalPages) nextButton.disabled = true;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updatePlaylistDisplay();
        }
    });
    pagination.appendChild(nextButton);
}

function formatTime(totalSeconds) {
    if (isNaN(totalSeconds)) return "0:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function parseISO8601Duration(durationString) {
    if (!durationString) return 0;
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = durationString.match(regex);
    return (parseInt(matches[1] || 0) * 3600) + (parseInt(matches[2] || 0) * 60) + (parseInt(matches[3] || 0));
}