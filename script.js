const TMDB_API_KEY = 'eecb39fda32865ef3e751f0b2ee79cdd'; 
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const supabaseUrl = 'https://kasckwaquxvafkrltblo.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthc2Nrd2FxdXh2YWZrcmx0YmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTEyMzksImV4cCI6MjA5MjI4NzIzOX0.fCp_eqlMQk7bWp3ltJYdX7S5eJd8X7897jfqZfXGaww';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const ACCESS_CODES = { "777": { role: "me", name: "я" }, "888": { role: "any", name: "сашок-петушок" } };
let currentUser = localStorage.getItem('userRole'), currentUserName = localStorage.getItem('userName'), allMovies = [], currentMovieId = null, isEditMode = false;
let tempExternalRating = null; 

function checkAuth() {
    const authScreen = document.getElementById('auth-screen'), userBadge = document.getElementById('user-display');
    if (!currentUser) { authScreen.style.display = 'flex'; } 
    else { authScreen.style.display = 'none'; userBadge.innerText = currentUserName; fetchMovies(); }
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const d = new Date(dateString);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function login() {
    const code = document.getElementById('secret-code').value;
    if (ACCESS_CODES[code]) {
        currentUser = ACCESS_CODES[code].role; currentUserName = ACCESS_CODES[code].name;
        localStorage.setItem('userRole', currentUser); localStorage.setItem('userName', currentUserName);
        checkAuth();
    } else { alert("Код неверен."); }
}

function logout() { localStorage.clear(); location.reload(); }

async function fetchMovies() {
    const { data, error } = await supabaseClient.from('movies').select('*');
    if (error) console.error(error); else { allMovies = data; updateFilterOptions(); applyFilters(); }
}

function updateFilterOptions() {
    const genres = new Set(), producers = new Set();
    allMovies.forEach(m => {
        if (m.genre) {
            m.genre.split(',').forEach(g => {
                let formattedGenre = g.trim();
                if (formattedGenre) {
                    formattedGenre = formattedGenre.charAt(0).toUpperCase() + formattedGenre.slice(1).toLowerCase();
                    genres.add(formattedGenre);
                }
            });
        }
        if (m.producer) producers.add(m.producer.trim());
    });
    fillSelect('filter-genre', genres, 'жанры'); 
    fillSelect('filter-producer', producers, 'режиссеры');
}

function fillSelect(id, set, label) {
    const s = document.getElementById(id);
    let shortLabel = label;
    if (label === 'жанры') shortLabel = 'жанры';
    if (label === 'режиссеры') shortLabel = 'режиссеры';
    s.innerHTML = `<option value="">Все ${shortLabel}</option>`;
    Array.from(set).sort().forEach(i => { s.innerHTML += `<option value="${i}">${i}</option>`; });
}

function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const genre = document.getElementById('filter-genre').value;
    const prod = document.getElementById('filter-producer').value;
    const assessment = document.getElementById('filter-assessment').value; 
    const sort = document.getElementById('sort-select').value;

    let filtered = allMovies.filter(m => {
        // Проверка поиска, жанра и режиссера
        const matchesSearch = m.title.toLowerCase().includes(search);
        const matchesGenre = !genre || (m.genre && m.genre.toLowerCase().includes(genre.toLowerCase()));
        const matchesProd = !prod || m.producer === prod;

        // ЛОГИКА ФИЛЬТРАЦИИ ПО СТАТУСУ И ОЦЕНКАМ
        const hasMe = (Number(m.plot_me || 0) + Number(m.ending_me || 0) + Number(m.actors_me || 0)) > 0;
        const hasAny = (Number(m.plot_any || 0) + Number(m.ending_any || 0) + Number(m.actors_any || 0)) > 0;
        const isWatched = m.status === 'Просмотрено';

        let matchesAssessment = true;

        // 1. Если выбран фильтр "Не просмотрено"
        if (assessment === 'not_watched') {
            matchesAssessment = (m.status === 'Не просмотрено');
        } 
        // 2. Если выбрано "Все просмотренные" или любой фильтр по оценкам
        else {
            // Если фильм не просмотрен — убираем его из всех списков, кроме "not_watched"
            if (!isWatched) return false;

            if (assessment === 'both') matchesAssessment = hasMe && hasAny;
            else if (assessment === 'only_me') matchesAssessment = hasMe && !hasAny;
            else if (assessment === 'only_any') matchesAssessment = !hasMe && hasAny;
            else if (assessment === 'none') matchesAssessment = !hasMe && !hasAny;
            // для "all" matchesAssessment остается true (так как проверку на isWatched мы прошли выше)
        }

        return matchesSearch && matchesGenre && matchesProd && matchesAssessment;
    });

    filtered.sort((a, b) => {
        if (sort === 'rating-desc') return calculateRating(b).total - calculateRating(a).total;
        if (sort === 'title-asc') return a.title.localeCompare(b.title);
        return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });

    renderMovies(filtered);
}

function renderMovies(movies) {
    const grid = document.getElementById('movie-grid'); 
    grid.innerHTML = ''; 
    
    movies.forEach((m, index) => {
        const r = calculateRating(m);

        // Проверяем: если СУММА всех оценок человека больше 0, значит он оценивал
        const hasMe = (Number(m.plot_me || 0) + Number(m.ending_me || 0) + Number(m.actors_me || 0) + Number(m.reviewability_me || 0) + Number(m.atmosphere_me || 0) + Number(m.music_me || 0)) > 0;
        const hasAny = (Number(m.plot_any || 0) + Number(m.ending_any || 0) + Number(m.actors_any || 0) + Number(m.reviewability_any || 0) + Number(m.atmosphere_any || 0) + Number(m.music_any || 0)) > 0;

        let badgeStyle = "";

        if (hasMe && hasAny) {
            // Оба оценили
            badgeStyle = "background-color: #c0c0c0; color: #111;";
        } else if (hasMe || hasAny) {
            // Оценил только один (неважно кто)
            badgeStyle = "background: linear-gradient(90deg, #c0c0c0 50%, rgba(40, 40, 40, 0.9) 50%); color: #fff; border: none;";
        } else {
            // Никто не оценил
            badgeStyle = "background-color: #1a1a1a; color: #555;";
        }
        // ------------------------------------

        const dateToShow = m.updated_at || m.created_at;
        const viewedBadge = m.status === 'Просмотрено' ? `<div class="viewed-badge">Просмотрено</div>` : '';
        
        const card = document.createElement('div');
        card.className = 'card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.onclick = () => openModalById(m.id);
        
        card.innerHTML = `
            ${viewedBadge}
            <img src="${m.poster || 'https://via.placeholder.com/180x260?text=No+Poster'}">
            <div class="card-info">
                <div class="card-top-content">
                    <h3 style="margin: 0 0 8px 0; font-size: 0.9rem; line-height: 1.2;">${m.title}</h3>
                    <span class="rating-badge" style="${badgeStyle}">${r.total.toFixed(1)}</span>
                </div>
                <div class="card-date">Обновлено: ${formatDate(dateToShow)}</div>
            </div>`;
            
        grid.appendChild(card);
    });
}

function calculateRating(m) {
    const w = { plot: 0.40, end: 0.25, rev: 0.15, act: 0.10, atm: 0.05, mus: 0.05 };
    const v = (val) => parseFloat(val) || 0;
    const getS = (u) => v(m['plot_'+u])*w.plot + v(m['ending_'+u])*w.end + v(m['reviewability_'+u])*w.rev + v(m['actors_'+u])*w.act + v(m['atmosphere_'+u])*w.atm + v(m['music_'+u])*w.mus;
    const me = getS('me'), any = getS('any');
    return { me, any, total: (me + any) / 2 };
}

function openModalById(id) {
    const movie = allMovies.find(m => m.id == id);
    if (!movie) return;
    currentMovieId = movie.id;
    isEditMode = false;
    renderModalContent(movie);
    document.getElementById('movie-modal').style.display = 'block';
}

function renderModalContent(m) {
    const body = document.getElementById('modal-body'), r = calculateRating(m);
    const dateToShow = m.updated_at || m.created_at;
    const isViewed = m.status === 'Просмотрено';

    body.innerHTML = `
        <div style="display:flex; gap:20px; margin-bottom:20px; position: relative;">
            <img src="${m.poster || ''}" style="width:120px; height:180px; object-fit:cover; border-radius:10px; border:1px solid #333;">
            <div style="flex:1">
                ${isEditMode ? `
                    <input type="text" id="edit-title" value="${m.title}" placeholder="Название">
                    <input type="text" id="edit-poster" value="${m.poster || ''}" placeholder="URL постера">
                    <input type="text" id="edit-year" value="${m.year || ''}" placeholder="Год">
                    <input type="number" id="edit-duration" value="${m.duration || ''}" placeholder="Длительность (мин)">
                    <input type="text" id="edit-genre" value="${m.genre || ''}" placeholder="Жанр">
                    <input type="text" id="edit-producer" value="${m.producer || ''}" placeholder="Режиссер">
                    <input type="text" id="edit-actors" value="${m.actors || ''}" placeholder="Актеры">
                    <input type="text" id="edit-external-rating" value="${m.external_rating || ''}" placeholder="Рейтинг TMDB">
                    <div class="score-group">
                        <label style="font-size: 0.7rem; color: #666; display: block; margin-bottom: 5px;">РЕЙТИНГ КИНОПОИСКА</label>
                        <input type="number" id="edit-kp-rating" value="${m.kp_rating || ''}" step="0.1" style="margin-bottom: 0;">
                    </div>
                ` : `
                    <h2 style="margin:0;">${m.title}</h2>
                    <p style="color:#888; font-size:0.8rem; margin:5px 0;">${m.year || ''} • ${m.genre || ''} ${m.duration ? '• ' + m.duration + ' мин' : ''}</p>
                    <div style="display: flex; align-items: center; gap: 8px; margin: 5px 0;">
                        <span style="background: #E1B22E; color: #000; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.6rem;">TMDB</span>
                        <span style="font-size: 0.9rem; color: #fff;">${m.external_rating || '—'}</span>
                        <span style="background: #ef7f1a; color: #000; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.6rem;">КП</span>
                        <span style="font-size: 0.9rem; color: #fff;">${m.kp_rating || '—'}</span>
                    </div>
                    <p style="color:#666; font-size:0.7rem; margin:2px 0;">Режиссер: ${m.producer || '—'}</p>
                    <p style="color:#666; font-size:0.7rem; margin:2px 0;">В ролях: ${m.actors || '—'}</p>
                `}

                <div id="status-toggle" 
                     onclick="toggleMovieStatus()" 
                     style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 12px; border-radius: 20px; 
                            border: 1px solid ${isViewed ? '#ccc' : '#444'}; 
                            background: ${isViewed ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}; 
                            box-shadow: ${isViewed ? '0 0 15px rgba(255, 255, 255, 0.05)' : 'none'};
                            margin-top: 10px; transition: all 0.3s ease;">
                    <span id="status-icon" style="color: ${isViewed ? '#ccc' : '#666'}; font-size: 1.1rem;">
                        ${isViewed ? '✓' : '○'}
                    </span>
                    <span id="status-text" style="font-size: 0.75rem; color: ${isViewed ? '#fff' : '#888'}; 
                            font-weight: ${isViewed ? 'bold' : 'normal'}; text-transform: uppercase; letter-spacing: 1px;">
                        ${isViewed ? 'Просмотрено' : 'Не просмотрено'}
                    </span>
                    <input type="hidden" id="edit-status" value="${m.status}">
                </div>

                <br>
                <button onclick='toggleEditMode()' style="font-size:0.6rem; background:none; border:1px solid #333; color:#555; cursor:pointer; padding:4px 8px; border-radius:4px; margin-top:10px;">
                    ${isEditMode ? 'ОТМЕНИТЬ ПРАВКУ' : 'ИЗМЕНИТЬ ДАННЫЕ'}
                </button>
            </div>
        </div>


        <div class="total-score-big" style="text-align: center;">
            <h2 id="total-val">${r.total.toFixed(1)}</h2>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
            <div class="${currentUser !== 'me' ? 'locked-group' : ''}">
                <p style="text-align:center; font-size:0.7rem; color:#c0c0c0; text-transform:uppercase; margin-bottom:10px;">ОЦЕНКА УМНОГО: ${r.me.toFixed(1)}</p>
                ${renderSliders(m, 'me')}
            </div>
            <div style="border-top: 1px solid #222; padding-top: 20px;" class="${currentUser !== 'any' ? 'locked-group' : ''}">
                <p style="text-align:center; font-size:0.7rem; color:#c0c0c0; text-transform:uppercase; margin-bottom:10px;">ОЦЕНКА НЕ УМНОГО: ${r.any.toFixed(1)}</p>
                ${renderSliders(m, 'any')}
            </div>
        </div>

        <textarea id="review-common" placeholder="Общий комментарий..." style="margin-top:20px;">${m.review_common || ''}</textarea>
        <button onclick="saveRatings()" class="save-btn">СОХРАНИТЬ</button>
        <button onclick="deleteMovie()" style="background:none; color:#333; border:none; width:100%; margin-top:10px; cursor:pointer; font-size:0.7rem;">УДАЛИТЬ ФИЛЬМ</button>
        
        <div style="text-align:center; color:#333; font-size:0.6rem; margin-top:15px; text-transform:uppercase; letter-spacing:1px;">
            Последнее изменение: ${formatDate(dateToShow)}
        </div>
    `;
}

function toggleMovieStatus() {
    const statusInput = document.getElementById('edit-status');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const toggleBtn = document.getElementById('status-toggle');

    statusIcon.style.transform = 'rotate(360deg) scale(1.2)';
    setTimeout(() => { statusIcon.style.transform = 'rotate(0deg) scale(1)'; }, 300);

    if (statusInput.value === 'Просмотрено') {
        statusInput.value = 'Не просмотрено';
        statusIcon.innerText = '○';
        statusIcon.style.color = '#666';
        statusText.innerText = 'Не просмотрено';
        statusText.style.color = '#888';
        statusText.style.fontWeight = 'normal';
        toggleBtn.style.borderColor = '#444';
        toggleBtn.style.background = 'transparent';
        toggleBtn.style.boxShadow = 'none';
    } else {
        statusInput.value = 'Просмотрено';
        statusIcon.innerText = '✓';
        statusIcon.style.color = '#ccc';
        statusText.innerText = 'Просмотрено';
        statusText.style.color = '#fff';
        statusText.style.fontWeight = 'bold';
        toggleBtn.style.borderColor = '#ccc';
        toggleBtn.style.background = 'rgba(255, 255, 255, 0.08)';
        toggleBtn.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.05)';
    }
}

function renderSliders(m, role) {
    const isLocked = (role !== currentUser);
    const fields = ['plot', 'ending', 'reviewability', 'actors', 'atmosphere', 'music'];
    const labels = ['СЮЖЕТ', 'КОНЦОВКА', 'ПЕРЕСМ.', 'АКТЕРЫ', 'АТМОСФЕРА', 'ЗВУК'];
    return fields.map((f, i) => {
        const v = m[f + '_' + role] || 0;
        return `
            <div class="score-group" style="margin-bottom:12px; background: #111; padding: 10px; border-radius: 8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="font-size:0.7rem; color:#777; letter-spacing:1px;">${labels[i]}</span>
                    <span id="val-${f}_${role}" style="font-weight:bold; color:#c0c0c0; font-size:0.9rem;">${v}</span>
                </div>
                <input type="range" min="0" max="10" step="1" value="${v}" 
                    ${isLocked ? 'disabled' : ''} 
                    style="width:100%;" 
                    oninput="document.getElementById('val-${f}_${role}').innerText=this.value; updateLiveRating();" 
                    id="input-${f}_${role}">
            </div>`;
    }).join('');
}

function updateLiveRating() {
    const v = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const w = { plot: 0.35, end: 0.20, rev: 0.15, act: 0.10, atm: 0.10, mus: 0.10 };
    const getScore = (role) => {
        return v(`input-plot_${role}`)*w.plot + v(`input-ending_${role}`)*w.end + v(`input-reviewability_${role}`)*w.rev + v(`input-actors_${role}`)*w.act + v(`input-atmosphere_${role}`)*w.atm + v(`input-music_${role}`)*w.mus;
    };
    const scoreMe = getScore('me');
    const scoreAny = getScore('any');
    document.getElementById('total-val').innerText = ((scoreMe + scoreAny) / 2).toFixed(1);
}

async function saveRatings() {
    const updateData = { 
        review_common: document.getElementById('review-common').value, 
        status: document.getElementById('edit-status').value,
        updated_at: new Date().toISOString()
    };
    if (isEditMode) {
        updateData.title = document.getElementById('edit-title').value;
        updateData.poster = document.getElementById('edit-poster').value;
        updateData.year = document.getElementById('edit-year').value;
        updateData.duration = parseInt(document.getElementById('edit-duration').value) || 0;
        updateData.genre = document.getElementById('edit-genre').value;
        updateData.producer = document.getElementById('edit-producer').value;
        updateData.actors = document.getElementById('edit-actors').value;
        updateData.external_rating = document.getElementById('edit-external-rating').value;
        updateData.kp_rating = document.getElementById('edit-kp-rating').value; // Сохранение КП
    }
    ['plot', 'ending', 'reviewability', 'actors', 'atmosphere', 'music'].forEach(f => {
        const input = document.getElementById(`input-${f}_${currentUser}`);
        if (input) updateData[`${f}_${currentUser}`] = parseInt(input.value) || 0;
    });
    const { error } = await supabaseClient.from('movies').update(updateData).eq('id', currentMovieId);
    if (error) alert(error.message); else location.reload();
}

async function deleteMovie() { if(confirm("Удалить?")) { await supabaseClient.from('movies').delete().eq('id', currentMovieId); location.reload(); } }

function toggleEditMode() { 
    isEditMode = !isEditMode; 
    const movie = allMovies.find(m => m.id == currentMovieId);
    renderModalContent(movie); 
}

function toggleForm() { const f = document.getElementById('form-container'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; }

function closeModal() {
    const modal = document.getElementById('movie-modal');
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.add('closing');
    modal.classList.add('fade-out');
    setTimeout(() => {
        modal.style.display = 'none';
        modalContent.classList.remove('closing');
        modal.classList.remove('fade-out');
        modal.style.opacity = '1';
    }, 300);
}

async function searchMovieData() {
    const titleInput = document.getElementById('new-title'), title = titleInput.value, searchBtn = document.querySelector('button[onclick="searchMovieData()"]');
    if (!title) return alert("Введите название фильма");
    const originalBtnText = searchBtn.innerText;
    searchBtn.innerText = "ПОИСК..."; searchBtn.style.opacity = "0.5"; searchBtn.disabled = true;
    try {
        const searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ru-RU`);
        const searchData = await searchRes.json();
        if (searchData.results.length === 0) return alert("Фильм не найден");
        const details = await (await fetch(`https://api.themoviedb.org/3/movie/${searchData.results[0].id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=ru-RU`)).json();
        document.getElementById('new-title').value = details.title;
        document.getElementById('new-poster').value = details.poster_path ? TMDB_IMAGE_BASE + details.poster_path : '';
        document.getElementById('new-year').value = details.release_date ? details.release_date.split('-')[0] : '';
        document.getElementById('new-duration').value = details.runtime || '';
        document.getElementById('new-genre').value = details.genres.map(g => g.name).join(', ');
        tempExternalRating = details.vote_average ? details.vote_average.toFixed(1) : '0.0';
        const director = details.credits.crew.find(person => person.job === 'Director');
        document.getElementById('new-producer').value = director ? director.name : '';
        document.getElementById('new-actors').value = details.credits.cast.slice(0, 3).map(a => a.name).join(', ');
        alert(`Данные подгружены! Рейтинг TMDB: ${tempExternalRating}`);
    } catch (err) { alert("Ошибка при поиске данных"); } 
    finally { searchBtn.innerText = originalBtnText; searchBtn.style.opacity = "1"; searchBtn.disabled = false; }
}

document.getElementById('add-movie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = { 
        title: document.getElementById('new-title').value, 
        poster: document.getElementById('new-poster').value, 
        year: document.getElementById('new-year').value, 
        duration: parseInt(document.getElementById('new-duration').value) || 0,
        genre: document.getElementById('new-genre').value, 
        producer: document.getElementById('new-producer').value, 
        actors: document.getElementById('new-actors').value, 
        external_rating: tempExternalRating,
        kp_rating: document.getElementById('new-kp-rating') ? document.getElementById('new-kp-rating').value : null, // Добавление КП
        status: document.getElementById('new-status').value, 
        updated_at: new Date().toISOString() 
    };
    await supabaseClient.from('movies').insert([n]); location.reload();
});

function setupRouletteView() {
    const isMobile = window.innerWidth <= 600;
    
    if (isMobile) {
        // Прячем всё для ПК
        document.getElementById('roulette-container').style.display = 'none';
        document.getElementById('pc-spin-controls').style.display = 'none';
        
        // Показываем мобильное
        document.getElementById('mobile-roulette-container').style.display = 'block';
        
        prepareDrum(); // Заполняем барабан названиями
    } else {
        // Показываем ПК версию
        document.getElementById('roulette-container').style.display = 'block';
        document.getElementById('pc-spin-controls').style.display = 'block';
        
        // Прячем мобильное
        document.getElementById('mobile-roulette-container').style.display = 'none';
        
        // Только ТУТ запускаем отрисовку колеса
        if (typeof initCanvasWheel === "function") initCanvasWheel(); 
    }
}

function generateStatistics() {
    const container = document.getElementById('stats-container'), viewed = allMovies.filter(m => m.status === 'Просмотрено');
    if (!viewed.length) { container.innerHTML = "<p style='text-align:center; color:#555;'>Нет данных.</p>"; return; }
    
    const avgScore = (viewed.reduce((acc, m) => acc + calculateRating(m).total, 0) / viewed.length).toFixed(1);
    const totalMinutes = viewed.reduce((acc, m) => acc + (parseInt(m.duration) || 0), 0);
    const totalMoviesCount = viewed.length;
    
    const longest = viewed.reduce((p, c) => (parseInt(c.duration || 0) > parseInt(p.duration || 0)) ? c : p);
    const oldest = viewed.reduce((p, c) => (parseInt(c.year || 3000) < parseInt(p.year || 3000)) ? c : p);
    const controversial = viewed.reduce((p, c) => (Math.abs(calculateRating(c).me - calculateRating(c).any) > Math.abs(calculateRating(p).me - calculateRating(p).any)) ? c : p);
    const maxDiff = Math.abs(calculateRating(controversial).me - calculateRating(controversial).any).toFixed(1);

    const genreData = {};
    viewed.forEach(m => {
        if (m.genre) {
            m.genre.split(',').forEach(g => {
                const name = g.trim();
                if (!genreData[name]) genreData[name] = { count: 0, totalScore: 0 };
                genreData[name].count++;
                genreData[name].totalScore += calculateRating(m).total;
            });
        }
    });

    const sortedGenres = Object.entries(genreData)
        .map(([name, data]) => ({
            name,
            count: data.count,
            avg: data.totalScore / data.count,
            score: (data.totalScore / data.count) * (1 + Math.log10(data.count))
        }))
        .sort((a, b) => b.score - a.score);

    const renderMiniList = (movies, label, isBest = false) => `
        <div style="background:#161616; padding:20px; border-radius:15px; border:1px solid #2a2a2a; height: 100%;">
            <h3 style="font-size:0.7rem; color:#555; text-transform:uppercase; letter-spacing:2px; margin:0 0 15px 0;">${label}</h3>
            ${movies.map((m, i) => {
                let bS = "background: #2a2a2a; color: #fff;"; 
                if (isBest && i === 0) bS = "background: linear-gradient(145deg, #bf953f, #fcf6ba, #b38728); color: #000;";
                else if (isBest && i === 1) bS = "background: linear-gradient(145deg, #959595, #ffffff, #707070); color: #000;";
                else if (isBest && i === 2) bS = "background: linear-gradient(145deg, #804a00, #ecaa7e, #a45d10); color: #fff;";
                return `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:0.85rem;">
                    <span style="color:#555; font-weight:bold; width:15px;">${i+1}.</span>
                    <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0 10px;">${m.title}</span>
                    <span style="${bS} padding:3px 8px; border-radius:6px; font-weight:900; font-size:0.75rem;">${calculateRating(m).total.toFixed(1)}</span>
                </div>`;
            }).join('')}
        </div>`;

    container.innerHTML = `
        <style>
            .stats-group-title { text-align: center; color: #555; font-size: 0.7rem; letter-spacing: 2px; margin: 30px 0 15px; text-transform: uppercase; }
            .stats-grid-main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
            .stats-grid-records { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 30px; }
            .stats-grid-tops { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .record-card { background:#111; padding:15px; border-radius:12px; border:1px solid #222; text-align:center; min-height:100px; display:flex; flex-direction:column; justify-content:center; }
            .record-card span { display: block; color: #c0c0c0; font-size: 0.7rem; margin-top: 5px; opacity: 0.7; }
            
            .genre-bar-container { background: #161616; padding: 20px; border-radius: 15px; border: 1px solid #2a2a2a; margin-bottom: 30px; }
            .genre-item { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .genre-name { font-size: 0.75rem; width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #aaa; text-transform: uppercase; }
            .genre-track { flex: 1; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
            .genre-fill { height: 100%; background: linear-gradient(90deg, #333, #666); border-radius: 4px; transition: width 0.5s ease; }
            .genre-info { font-size: 0.7rem; color: #555; min-width: 70px; text-align: right; }

            @media (max-width: 600px) { 
                .stats-grid-main, .stats-grid-records, .stats-grid-tops { grid-template-columns: 1fr !important; }
                .genre-name { width: 80px; }
            }
        </style>

        <h3 class="stats-group-title">ОБЩАЯ СТАТИСТИКА</h3>
        <div class="stats-grid-main">
            <div style="background:#161616; padding:15px; border-radius:20px; text-align:center; border:1px solid #2a2a2a;">
                <p style="color:#555; font-size:0.6rem; margin:0;">ФИЛЬМОВ</p>
                <h2 style="font-size:1.8rem; margin:5px 0;">${totalMoviesCount}</h2>
            </div>
            <div style="background:#161616; padding:15px; border-radius:20px; text-align:center; border:1px solid #2a2a2a;">
                <p style="color:#555; font-size:0.6rem; margin:0;">СРЕДНИЙ БАЛЛ</p>
                <h2 style="font-size:1.8rem; margin:5px 0;">${avgScore}</h2>
            </div>
            <div style="background:#161616; padding:15px; border-radius:20px; text-align:center; border:1px solid #2a2a2a;">
                <p style="color:#555; font-size:0.6rem; margin:0;">ВРЕМЯ В КИНО</p>
                <h2 style="font-size:1.8rem; margin:5px 0;">${Math.floor(totalMinutes/60)}<span style="font-size:0.8rem;">ч</span> ${totalMinutes%60}<span style="font-size:0.8rem;">м</span></h2>
            </div>
        </div>

        <h3 class="stats-group-title">ИНТЕРЕСНО, ЧТО...</h3>
        <div class="stats-grid-records">
            <div class="record-card">
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">САМЫЙ ДОЛГИЙ</p>
                <div style="font-size:0.85rem;">${longest.title}</div>
                <span>${longest.duration || 0} мин</span>
            </div>
            <div class="record-card">
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">САМЫЙ СТАРЫЙ</p>
                <div style="font-size:0.85rem;">${oldest.title}</div>
                <span>${oldest.year || '—'} год</span>
            </div>
            <div class="record-card">
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">МАКС. РАЗНИЦА</p>
                <div style="font-size:0.85rem;">${controversial.title}</div>
                <span>Разница: ${maxDiff}</span>
            </div>
        </div>

        <h3 class="stats-group-title">РЕЙТИНГ ЖАНРОВ</h3>
        <div class="genre-bar-container">
            ${sortedGenres.map(g => {
                const percent = (g.avg * 10);
                return `
                    <div class="genre-item">
                        <div class="genre-name">${g.name}</div>
                        <div class="genre-track">
                            <div class="genre-fill" style="width: ${percent}%; opacity: ${0.2 + (g.count/totalMoviesCount) * 0.8}"></div>
                        </div>
                        <div class="genre-info">${g.avg.toFixed(1)} ★ (${g.count})</div>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="stats-grid-tops">
            ${renderMiniList([...viewed].sort((a,b)=>calculateRating(b).total-calculateRating(a).total).slice(0,5), "🔥 ТОП ЛУЧШИХ", true)}
            ${renderMiniList([...viewed].sort((a,b)=>calculateRating(a).total-calculateRating(b).total).slice(0,5), "💀 ТОП ХУДШИХ", false)}
        </div>`;
}


// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
let currentRouletteMovies = [];
let isSpinning = false;
let wheelAngle = 0;

// 2. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
function switchTab(tab) {
    const screens = ['main-view', 'stats-container', 'roulette-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetScreen = document.getElementById(tab === 'grid' ? 'main-view' : (tab === 'stats' ? 'stats-container' : 'roulette-screen'));
    const targetBtn = document.getElementById(`tab-${tab}`);
    
    if (targetScreen) targetScreen.style.display = 'block';
    if (targetBtn) targetBtn.classList.add('active');

    // Логика для статистики
    if (tab === 'stats' && typeof generateStatistics === "function") {
        generateStatistics();
    }

    // ЛОГИКА ДЛЯ РУЛЕТКИ (Обновлено)
    if (tab === 'roulette') {
        const isMobile = window.innerWidth <= 600;
        
        if (isMobile) {
            // Если мобилка — настраиваем вид барабана
            if (typeof setupRouletteView === "function") {
                setupRouletteView();
            }
        } else {
            // Если ПК — настраиваем вид колеса и рисуем его
            const mobileContainer = document.getElementById('mobile-roulette-container');
            const pcContainer = document.getElementById('roulette-container');
            const pcControls = document.getElementById('pc-spin-controls');
            
            if (mobileContainer) mobileContainer.style.display = 'none';
            if (pcContainer) pcContainer.style.display = 'block';
            if (pcControls) pcControls.style.display = 'block';
            
            if (typeof drawWheel === "function") drawWheel();
        }
    }
}

// 3. ИНИЦИАЛИЗАЦИЯ СПИСКА
function initRoulette() {
    if (isSpinning) return;
    const maxTime = parseInt(document.getElementById('time-filter').value) || 999;
    
    currentRouletteMovies = allMovies.filter(m => 
        m.status === 'Не просмотрено' && 
        (parseInt(m.duration) || 0) <= maxTime
    );

    if (currentRouletteMovies.length < 2) {
        alert("Добавьте хотя бы 2 фильма в 'Не просмотрено'!");
        return;
    }

    localStorage.setItem('roulette_session', JSON.stringify(currentRouletteMovies));
    
    const spinBtn = document.getElementById('spin-button');
    spinBtn.disabled = false;
    spinBtn.style.opacity = "1";
    spinBtn.style.cursor = "pointer";
    
    document.getElementById('winner-display').innerText = `Список готов: ${currentRouletteMovies.length} поз.`;
    wheelAngle = 0; 
    drawWheel();
}

function drawWheel() {
    if (window.innerWidth <= 600) return; 

    // ... твой остальной код отрисовки колеса ...

    const canvas = document.getElementById('wheelCanvas');
    if (!canvas || currentRouletteMovies.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.parentElement.offsetWidth;
    
    if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
    }

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 30; 
    const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;

    ctx.clearRect(0, 0, size, size);

    // Рисуем основное колесо
    renderSectors(ctx, centerX, centerY, radius, sliceAngle, wheelAngle, 1);
}

// Вынесли отрисовку в отдельную функцию для чистоты
function renderSectors(ctx, centerX, centerY, radius, sliceAngle, angleOffset, opacity) {
    currentRouletteMovies.forEach((movie, i) => {
        const angle = angleOffset + i * sliceAngle;
        
        ctx.globalAlpha = opacity;
        
        // Градиент сектора
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        if (i % 3 === 0) { gradient.addColorStop(0, '#1a1a1a'); gradient.addColorStop(1, '#0a0a0a'); }
        else if (i % 3 === 1) { gradient.addColorStop(0, '#2a2a2a'); gradient.addColorStop(1, '#151515'); }
        else { gradient.addColorStop(0, '#111111'); gradient.addColorStop(1, '#050505'); }
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Линии
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Текст
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle + sliceAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(204, 204, 204, ${opacity})`;
        ctx.font = `600 ${Math.max(11, 700 / 55)}px 'Segoe UI', sans-serif`;
        const shortTitle = movie.title.length > 25 ? movie.title.substring(0, 22) + '...' : movie.title;
        ctx.fillText(shortTitle, radius - 35, 5);
        ctx.restore();
    });

    // Хаб (всегда четкий)
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
    const hubGrad = ctx.createRadialGradient(centerX - 4, centerY - 4, 2, centerX, centerY, 15);
    hubGrad.addColorStop(0, '#ffffff');
    hubGrad.addColorStop(1, '#444444');
    ctx.fillStyle = hubGrad;
    ctx.fill();
}

function spinRoulette() {
    if (isSpinning || currentRouletteMovies.length < 2) return;

    isSpinning = true;
    const duration = (parseFloat(document.getElementById('spin-duration-input').value) || 5) * 1000;
    const startAngle = wheelAngle;
    const extraSpins = 8 + Math.random() * 5; 
    const targetAngle = startAngle + (extraSpins * 2 * Math.PI) + Math.random() * (2 * Math.PI);
    
    let startTime = null;
    const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;

    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easing = 1 - Math.pow(1 - progress, 4);
        const oldAngle = wheelAngle;
        wheelAngle = startAngle + (targetAngle - startAngle) * easing;
        
        const delta = wheelAngle - oldAngle;

        // ЗВУК ТРЕЩОТКИ: Срабатывает точно при пересечении границы сектора
        // Мы проверяем, изменился ли номер текущего сектора под указателем
        const currentSector = Math.floor((1.5 * Math.PI - wheelAngle) / sliceAngle);
        const lastSector = Math.floor((1.5 * Math.PI - oldAngle) / sliceAngle);
        
        if (currentSector !== lastSector) {
            playTickSound();
        }

        const canvas = document.getElementById('wheelCanvas');
        const ctx = canvas.getContext('2d');
        const size = canvas.parentElement.offsetWidth;
        ctx.clearRect(0, 0, size, size);

        if (delta > 0.05) {
            renderSectors(ctx, size/2, size/2, size/2 - 30, sliceAngle, wheelAngle - delta * 0.5, 0.4);
        }
        renderSectors(ctx, size/2, size/2, size/2 - 30, sliceAngle, wheelAngle, 1);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            drawWheel(); 
            finalizeSpin();
        }
    }
    requestAnimationFrame(animate);
}

// 6. ЗАВЕРШЕНИЕ (ФИНАЛЬНАЯ ЛОГИКА ТЕКСТА)
function finalizeSpin() {
    isSpinning = false;
    const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;
    const normalizedAngle = (1.5 * Math.PI - (wheelAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let winningIndex = Math.floor(normalizedAngle / sliceAngle);
    
    if (winningIndex >= currentRouletteMovies.length) winningIndex = currentRouletteMovies.length - 1;
    
    const winner = currentRouletteMovies[winningIndex];
    const display = document.getElementById('winner-display');
    const mode = document.getElementById('spin-mode').value;

    // Универсальная функция показа оверлея
    const showWinnerOverlay = (header, title) => {
        const overlay = document.getElementById('winner-overlay');
        document.querySelector('#winner-overlay span').innerText = header;
        document.getElementById('overlay-movie-title').innerText = title;
        
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto'; 
        setTimeout(() => overlay.style.opacity = '1', 10);
        triggerWinAnimation();
    };

    if (mode === 'elimination') {
        // Мгновенно удаляем и перерисовываем
        currentRouletteMovies.splice(winningIndex, 1);
        localStorage.setItem('roulette_session', JSON.stringify(currentRouletteMovies));
        
        playFadeSound();
        drawWheel();

        // Если осталось больше одного фильма — просто обновляем текст внизу
        if (currentRouletteMovies.length > 1) {
            display.innerText = `ВЫБЫЛ: ${winner.title}`;
            display.style.color = "#ff4d4d"; // Можно подсветить красным для наглядности
        } 
        // Если остался ПОСЛЕДНИЙ — вот тут включаем триумфальный оверлей
        else if (currentRouletteMovies.length === 1) {
            const finalWinner = currentRouletteMovies[0];
            display.innerText = `ПОБЕДИТЕЛЬ: ${finalWinner.title}`;
            display.style.color = "#fff";
            
            setTimeout(() => {
                showWinnerOverlay("ВЫИГРАЛ ФИЛЬМ:", finalWinner.title);
            }, 400); 
        }
    } else {
        // В обычном режиме показываем всё сразу
        display.innerText = `ВЫБРАНО: ${winner.title}`;
        display.style.color = "#fff";
        showWinnerOverlay("ВЫИГРАЛ ФИЛЬМ:", winner.title);
    }
}

// 7. ЗВУКИ И ИВЕНТЫ
function playTickSound() {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.frequency.setValueAtTime(700, actx.currentTime);
    gain.gain.setValueAtTime(0.03, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + 0.05);
}

function playFadeSound() {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.frequency.setValueAtTime(300, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, actx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.1, actx.currentTime);
    gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + 0.8);
}

function triggerWinAnimation() {
    const canvas = document.getElementById('wheelCanvas');
    canvas.style.transition = "transform 0.3s ease-out, filter 0.3s ease-out";
    
    // Эффект "вспышки"
    canvas.style.transform = "scale(1.05)";
    canvas.style.filter = "drop-shadow(0 0 30px rgba(255, 255, 255, 0.5))";
    
    // Звук фанфар (простой синтезированный вариант)
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // Аккорд до-мажор
    notes.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.frequency.setValueAtTime(freq, actx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.1, actx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + i * 0.1 + 0.5);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(actx.currentTime + i * 0.1);
        osc.stop(actx.currentTime + i * 0.1 + 0.5);
    });

    setTimeout(() => {
        canvas.style.transform = "scale(1)";
        canvas.style.filter = "drop-shadow(0 0 12px rgba(255, 255, 255, 0.1))";
    }, 500);
}

function closeWinnerOverlay() {
    const overlay = document.getElementById('winner-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 500);
}

window.addEventListener('resize', drawWheel);

function prepareDrum() {
    const list = document.getElementById('drum-list');
    const maxDuration = parseInt(document.getElementById('time-filter').value) || 999;

    // Фильтруем по статусу И по времени
    const filteredMovies = allMovies.filter(m => 
        m.status === 'Не просмотрено' && 
        (parseInt(m.duration) || 0) <= maxDuration
    );

    if (filteredMovies.length === 0) {
        list.innerHTML = '<div class="drum-item">Нет подходящих фильмов</div>';
        return;
    }

    let drumHTML = '';
    // Создаем достаточно элементов для долгой прокрутки
    for (let i = 0; i < 15; i++) {
        filteredMovies.forEach(movie => {
            drumHTML += `<div class="drum-item">${movie.title}</div>`;
        });
    }
    list.innerHTML = drumHTML;
    list.style.transition = 'none';
    list.style.transform = 'translateY(0)';
}

function spinDrum(velocity = 1, direction = 1) {
    const list = document.getElementById('drum-list');
    const items = list.querySelectorAll('.drum-item');
    if (items.length === 0) return;

    items.forEach(item => item.classList.remove('winner-highlight'));

    const itemHeight = 50;
    const maxDuration = parseInt(document.getElementById('time-filter').value) || 999;
    const filteredMovies = allMovies.filter(m => 
        m.status === 'Не просмотрено' && (parseInt(m.duration) || 0) <= maxDuration
    );
    
    const movieCount = filteredMovies.length;
    
    // ВЛИЯНИЕ СКОРОСТИ: чем выше velocity, тем больше кругов (от 5 до 15)
    const speedMultiplier = Math.min(Math.max(velocity * 5, 5), 15);
    
    // Выбираем случайный индекс в пределах "мощности" броска
    let randomIndex = Math.floor(Math.random() * movieCount) + Math.floor(movieCount * speedMultiplier);

    // НАПРАВЛЕНИЕ: если direction -1, мы должны крутить "назад"
    // Но так как у нас список конечен сверху, "назад" будет просто короткой прокруткой
    // Для полноценного реверса в обе стороны нужна бесконечная лента в обе стороны.
    // Сейчас реализуем логику: свайп вниз — крутим далеко вперед, свайп вверх — крутим слабо.
    if (direction === -1) {
        randomIndex = Math.floor(Math.random() * movieCount) + movieCount; // Недалеко
    }

    const offset = randomIndex * itemHeight;

    list.style.transition = 'none';
    list.style.transform = 'translateY(0)';

    setTimeout(() => {
        // Время анимации тоже можно чуть менять от скорости
        const animTime = Math.min(Math.max(velocity * 2, 3), 6); 
        list.style.transition = `transform ${animTime}s cubic-bezier(0.15, 0, 0.15, 1)`;
        list.style.transform = `translateY(-${offset}px)`;

        setTimeout(() => {
            const winnerItem = items[randomIndex];
            if (winnerItem) {
                winnerItem.classList.add('winner-highlight');
                setTimeout(() => showWinnerOverlay(winnerItem.innerText), 1000);
            }
        }, animTime * 1000);
    }, 50);
}

function showWinner(title) {
    const overlay = document.getElementById('winner-overlay');
    const titleElement = document.getElementById('overlay-movie-title');
    
    if (overlay && titleElement) {
        titleElement.innerText = title;
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.opacity = '1', 10);
    } else {
        alert("Сегодня смотрим: " + title);
    }
}


let touchStartY = 0;
let touchStartTime = 0;

const drumWrapper = document.querySelector('.drum-wrapper');

if (drumWrapper) {
    drumWrapper.addEventListener('touchstart', e => {
        touchStartY = e.changedTouches[0].screenY;
        touchStartTime = Date.now(); // Фиксируем время начала касания
    }, { passive: false });

    drumWrapper.addEventListener('touchend', e => {
        const touchEndY = e.changedTouches[0].screenY;
        const touchEndTime = Date.now();
        
        const distance = touchStartY - touchEndY; // Положительное, если свайп вверх
        const duration = touchEndTime - touchStartTime; // Время в мс

        if (Math.abs(distance) > 30) {
            if (e.cancelable) e.preventDefault();
            
            // Вычисляем скорость (пиксели в миллисекунду)
            const velocity = Math.abs(distance) / duration;
            
            // Определяем направление: 
            // Если distance > 0 (свайп вверх) -> крутим назад (direction = -1)
            // Если distance < 0 (свайп вниз) -> крутим вперед (direction = 1)
            const direction = distance > 0 ? -1 : 1;

            spinDrum(velocity, direction);
        }
    }, { passive: false });
}

checkAuth();