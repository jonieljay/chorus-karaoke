// Chorus Karaoke V2 - phone-first music browser
// Loaded after the base app. Keeps the original host player, QR pairing, and live queue.
(() => {
  'use strict';
  const FAVORITES_KEY = `${storagePrefix}playlist-v2`;
  const validVideoId = id => /^[A-Za-z0-9_-]{11}$/.test(id || '');
  const browser = { tab: 'search', query: '', results: [], charts: null };
  iconPaths['playlist-add'] = '<path d="M4 6h11M4 11h11M4 16h7M18 13v8M14 17h8"/>';
  iconPaths['chart'] = '<path d="M4 19V13M9 19V9M14 19V5M19 19V2M2 21h20"/>';
  iconPaths['bookmark'] = '<path d="M6 3h12v18l-6-4-6 4V3Z"/>';

  function favorites() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter(s => validVideoId(s?.videoId)).slice(0, 100) : [];
    } catch (_) { return []; }
  }
  function saveFavorites(songs) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(songs.slice(0, 100))); }
    catch (_) { toast('Unable to save your playlist on this device.', true); }
    updateFavoriteCount();
  }
  function updateFavoriteCount() {
    const label = $('#playlist-count');
    if (label) label.textContent = favorites().length || '';
  }
  function queuedIds() {
    return new Set([...(state.room?.queue || []), state.room?.current].filter(Boolean).map(s => s.videoId));
  }
  function cleanSong(song) {
    const videoId = String(song?.videoId || '');
    if (!validVideoId(videoId)) return null;
    return { videoId, title: String(song.title || 'Karaoke song').slice(0, 180), channel: String(song.channel || 'YouTube').slice(0, 85) };
  }
  function songTile(song, index, showRemove = false) {
    const id = song.videoId;
    const title = escapeHTML(song.title);
    const channel = escapeHTML(song.channel);
    const isSaved = favorites().some(s => s.videoId === id);
    const isQueued = queuedIds().has(id);
    const locked = state.room?.locked && state.role !== 'host';
    return `<article class="music-result" data-video-row="${id}">
      <span class="music-cover"><img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" width="72" height="72" loading="lazy" alt="Thumbnail for ${title}"/><span class="music-video-badge">${icon('play','small')}</span></span>
      <div class="music-meta"><strong title="${title}">${title}</strong><span class="music-artist">${channel}</span><small class="music-source">${icon('mic','small')} YouTube karaoke</small></div>
      <div class="music-actions">
        <button type="button" class="music-add ${isQueued ? 'is-queued' : ''}" data-action="add-result" data-video="${id}" title="Add song to queue" aria-label="Add ${title} to the queue" ${locked || isQueued ? 'disabled' : ''}>${icon(isQueued ? 'check' : 'plus')}</button>
        <button type="button" class="music-save ${isSaved ? 'is-saved' : ''}" data-action="${isSaved || showRemove ? 'remove-favorite' : 'save-favorite'}" data-video="${id}" title="${isSaved || showRemove ? 'Remove from playlist' : 'Save to playlist'}" aria-label="${isSaved || showRemove ? 'Remove' : 'Save'} ${title} ${isSaved || showRemove ? 'from' : 'to'} playlist">${icon(isSaved || showRemove ? 'bookmark' : 'playlist-add')}</button>
      </div>
    </article>`;
  }
  function songsView(songs, type) {
    const list = Array.isArray(songs) ? songs.map(cleanSong).filter(Boolean) : [];
    state.songsById = new Map(list.map(s => [s.videoId, s]));
    const target = $('#search-results');
    if (!target) return;
    target.innerHTML = list.length
      ? list.map((song, index) => songTile(song, index, type === 'playlist')).join('')
      : `<div class="music-empty">${icon('music','big')}<strong>${type === 'playlist' ? 'Your playlist is empty' : 'No karaoke results found'}</strong><p>${type === 'playlist' ? 'Save songs using the list button beside a search result.' : 'Try a different song title or artist.'}</p></div>`;
    const count = $('#result-count');
    if (count) count.textContent = list.length ? `${list.length} ${type === 'playlist' ? 'saved songs' : 'results'}` : '';
  }
  function setTab(tab) {
    if (!['search','playlist','chart'].includes(tab)) return;
    browser.tab = tab;
    state.searchSequence++;
    document.querySelectorAll('[data-action="browser-tab"]').forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const searchArea = $('#browser-search-area');
    if (searchArea) searchArea.hidden = tab !== 'search';
    const paste = $('#paste-form');
    if (paste) paste.hidden = tab !== 'search';
    const footnote = $('#search-footnote');
    if (footnote) footnote.hidden = tab !== 'search';
    const title = $('#browser-list-title');
    if (title) title.textContent = tab === 'playlist' ? 'Saved to your playlist' : tab === 'chart' ? 'Popular karaoke picks' : 'YouTube karaoke results';
    const note = $('#browser-list-note');
    if (note) note.textContent = tab === 'playlist' ? 'Saved only on this device' : tab === 'chart' ? 'YouTube suggestions · not an official chart' : 'Choose a track and add it to the party queue';
    updateFavoriteCount();
    if (tab === 'playlist') songsView(favorites(), 'playlist');
    else if (tab === 'chart') loadPopularPicks();
    else if (browser.results.length && browser.query === ($('#song-search')?.value || '').trim()) songsView(browser.results, 'search');
    else renderSearchPlaceholder();
  }
  function noApiMessage(query) {
    const q = (query || '').trim();
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent((q || 'karaoke hits') + ' karaoke')}`;
    return `<div class="music-empty no-key">${icon('youtube','big')}<strong>Turn on YouTube song search</strong><p>Set <code>YOUTUBE_API_KEY</code> in Render → Environment to show real song results, thumbnails, and one-tap add buttons here.</p><a class="music-external" href="${ytUrl}" target="_blank" rel="noopener noreferrer">Search on YouTube ${icon('external','small')}</a><small>You can still paste any YouTube link below.</small></div>`;
  }

  searchPanel = function () {
    return `<section class="panel search-panel search-panel-v2" id="find-songs">
      <div class="browser-intro"><div><h2>Pick your next song <span>✦</span></h2><p>Search karaoke tracks and take the mic.</p></div><span class="browser-youtube">${icon('youtube','small')} YouTube</span></div>
      <div class="browser-tabs" role="tablist" aria-label="Browse karaoke songs">
        <button type="button" data-action="browser-tab" data-tab="playlist" role="tab" aria-selected="false">${icon('list','small')} <span>Playlist</span><small id="playlist-count"></small></button>
        <button type="button" class="active" data-action="browser-tab" data-tab="search" role="tab" aria-selected="true">${icon('search','small')} <span>Search</span></button>
        <button type="button" data-action="browser-tab" data-tab="chart" role="tab" aria-selected="false">${icon('chart','small')} <span>Hit Chart</span></button>
      </div>
      <div id="browser-search-area">
        <div class="search-wrap browser-search-box">${icon('search')}<input id="song-search" type="search" autocomplete="off" placeholder="Search title, artist, or singer..." aria-label="Search karaoke songs"/><button type="button" id="search-clear" class="browser-clear" data-action="clear-song-search" title="Clear search" aria-label="Clear song search" hidden>${icon('x','small')}</button><button type="button" id="search-submit" class="search-button">Search</button></div>
        <div class="search-tips browser-chips"><span>TRY</span><button type="button" class="topic-chip" data-action="fill-search" data-query="Datu's Tribe">Datu's Tribe</button><button type="button" class="topic-chip" data-action="fill-search" data-query="OPM love songs">OPM love songs</button><button type="button" class="topic-chip" data-action="fill-search" data-query="90s karaoke">90s karaoke</button></div>
      </div>
      <div class="browser-list-heading"><div><strong id="browser-list-title">YouTube karaoke results</strong><span id="browser-list-note">Choose a track and add it to the party queue</span></div><small id="result-count"></small></div>
      <div class="search-results browser-results" id="search-results" aria-live="polite"></div>
      <form class="paste-group browser-paste" id="paste-form"><span class="link-mark">${icon('link')}</span><input id="youtube-link" class="field" autocomplete="off" placeholder="Or paste a YouTube video link" aria-label="Paste YouTube video link" required/><button type="submit" id="paste-button" class="btn btn-dark">${icon('plus','small')} Add</button></form>
      <p class="search-footnote" id="search-footnote">Your phone requests songs. Playback stays on the host TV or computer.</p>
    </section>`;
  };

  renderSearchPlaceholder = function () {
    const target = $('#search-results');
    if (!target) return;
    if (browser.tab === 'playlist') return songsView(favorites(), 'playlist');
    if (browser.tab === 'chart') return;
    if (!state.config.searchEnabled) target.innerHTML = noApiMessage($('#song-search')?.value);
    else target.innerHTML = `<div class="music-empty">${icon('search','big')}<strong>What would you like to sing?</strong><p>Type a song title or artist above. We'll find karaoke versions on YouTube.</p></div>`;
    const count = $('#result-count'); if (count) count.textContent = '';
  };

  searchSongs = async function () {
    const input = $('#song-search');
    if (!input) return;
    const query = input.value.trim();
    browser.query = query;
    browser.tab = 'search';
    const clear = $('#search-clear'); if (clear) clear.hidden = !query;
    const seq = ++state.searchSequence;
    const target = $('#search-results');
    if (!query || query.length < 2) { browser.results = []; renderSearchPlaceholder(); return; }
    if (!state.config.searchEnabled) { browser.results = []; target.innerHTML = noApiMessage(query); return; }
    target.innerHTML = `<div class="music-empty"><span class="spinner"></span><strong>Searching YouTube...</strong><p>Finding karaoke versions of ${escapeHTML(query)}.</p></div>`;
    const count = $('#result-count'); if (count) count.textContent = '';
    try {
      const data = await request(`/api/search?q=${encodeURIComponent(query)}`);
      if (seq !== state.searchSequence || browser.tab !== 'search') return;
      browser.results = data.results || [];
      songsView(browser.results, 'search');
    } catch (error) {
      if (seq !== state.searchSequence || browser.tab !== 'search') return;
      browser.results = [];
      target.innerHTML = `<div class="music-empty">${icon('search','big')}<strong>Search unavailable</strong><p>${escapeHTML(error.message)}</p><small>You can still paste a YouTube link below.</small></div>`;
    }
  };

  async function loadPopularPicks() {
    const target = $('#search-results'); if (!target) return;
    if (!state.config.searchEnabled) { target.innerHTML = noApiMessage('popular OPM hits'); return; }
    if (browser.charts) { songsView(browser.charts, 'chart'); return; }
    const seq = ++state.searchSequence;
    target.innerHTML = `<div class="music-empty"><span class="spinner"></span><strong>Finding popular picks...</strong></div>`;
    try {
      const data = await request('/api/search?q=popular%20OPM%20hits');
      if (seq !== state.searchSequence || browser.tab !== 'chart') return;
      browser.charts = data.results || [];
      songsView(browser.charts, 'chart');
    } catch (error) {
      if (seq !== state.searchSequence || browser.tab !== 'chart') return;
      target.innerHTML = `<div class="music-empty"><strong>Popular picks are unavailable</strong><p>${escapeHTML(error.message)}</p></div>`;
    }
  }

  const oldRenderRoomShell = renderRoomShell;
  renderRoomShell = function () {
    document.body.classList.toggle('chorus-remote-v2', state.role === 'guest');
    browser.tab = 'search';
    oldRenderRoomShell();
    updateFavoriteCount();
    $('#song-search')?.addEventListener('input', event => { const x = $('#search-clear'); if (x) x.hidden = !event.target.value; });
  };

  const oldRenderQueue = renderQueue;
  renderQueue = function () {
    oldRenderQueue();
    const blocked = state.room?.locked && state.role !== 'host';
    const queue = queuedIds();
    document.querySelectorAll('.music-result').forEach(row => {
      const id = row.dataset.videoRow;
      const button = row.querySelector('.music-add');
      if (!button) return;
      const added = queue.has(id);
      button.classList.toggle('is-queued', added);
      button.innerHTML = icon(added ? 'check' : 'plus');
      button.disabled = Boolean(blocked || added);
    });
  };

  const oldHandleRoomClick = handleRoomClick;
  handleRoomClick = async function (event) {
    const button = event.target.closest('[data-action]');
    if (!button) return oldHandleRoomClick(event);
    const action = button.dataset.action;
    if (action === 'browser-tab') return setTab(button.dataset.tab);
    if (action === 'clear-song-search') {
      const input = $('#song-search'); if (input) { input.value = ''; input.focus(); }
      browser.results = []; browser.query = ''; state.searchSequence++;
      button.hidden = true; renderSearchPlaceholder(); return;
    }
    if (action === 'save-favorite' || action === 'remove-favorite') {
      const id = button.dataset.video;
      const list = favorites();
      const song = cleanSong(state.songsById.get(id));
      if (action === 'save-favorite' && song && !list.some(s => s.videoId === id)) {
        list.unshift(song); saveFavorites(list); toast('Saved to your playlist.');
      } else if (action === 'remove-favorite') {
        saveFavorites(list.filter(s => s.videoId !== id)); toast('Removed from playlist.');
      }
      if (browser.tab === 'playlist') songsView(favorites(), 'playlist');
      else if (browser.tab === 'chart') songsView(browser.charts || [], 'chart');
      else songsView(browser.results, 'search');
      return;
    }
    if (action === 'add-result') {
      const song = state.songsById.get(button.dataset.video);
      if (!song || button.disabled) return;
      button.disabled = true;
      try {
        await addSong(song);
        button.innerHTML = icon('check');
        button.classList.add('is-queued');
      } catch (error) {
        toast(error.message, true);
        button.disabled = Boolean(state.room?.locked && state.role !== 'host');
      }
      return;
    }
    return oldHandleRoomClick(event);
  };
})();
