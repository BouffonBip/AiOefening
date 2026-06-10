/**
 * app.js – Hoofdlogica voor RecipeZoeker
 * =========================================================================
 * Student  : Odisee Toegepaste Informatica
 * API      : TheMealDB (https://www.themealdb.com/api.php) – API-sleutel '1'
 *
 * Functies :
 *   - Zoeken op trefwoord → eerste 20 resultaten als receptkaarten
 *   - Detailweergave (fullscreen overlay) met ingrediënten + instructies
 *   - Favorieten opslaan in localStorage (persisterend)
 *   - Ster togglen op zowel kaart als detailpagina
 *
 * Technologie: Vanilla JavaScript (ES6+), Fetch API met async/await
 * =========================================================================
 */

const API_BASE = 'https://www.themealdb.com/api/json/v1/1';
const STORAGE_KEY = 'recipeZoeker_favorites';
const MAX_RESULTS = 20;

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const errorMessage = document.getElementById('error-message');
const loadingSpinner = document.getElementById('loading-spinner');
const favoritesSection = document.getElementById('favorites-section');
const noFavoritesMsg = document.getElementById('no-favorites-msg');
const favoritesGrid = document.getElementById('favorites-grid');
const resultsDivider = document.getElementById('results-divider');
const resultsSection = document.getElementById('results-section');
const resultsTitle = document.getElementById('results-title');
const resultsGrid = document.getElementById('results-grid');
const detailOverlay = document.getElementById('detail-overlay');
const backBtn = document.getElementById('back-btn');
const detailContent = document.getElementById('detail-content');

function getFavorites() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
   } catch (err) {
      console.warn('Kon favorieten niet lezen uit localStorage:', err);
      return {};
   }
}

function saveFavorites(favorites) {
   try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
   } catch (err) {
      console.error('Kon favorieten niet opslaan in localStorage:', err);
   }
}

function isFavorite(mealId) {
   const favorites = getFavorites();
   return Object.prototype.hasOwnProperty.call(favorites, mealId);
}

function toggleFavorite(meal) {
   const favorites = getFavorites();
   const id = meal.idMeal;
   if (isFavorite(id)) {
      delete favorites[id];
   } else {
      favorites[id] = meal;
   }
   saveFavorites(favorites);
   renderFavorites();
   updateAllStarButtons(id);
}

async function searchMealsByKeyword(keyword) {
   const url = `${API_BASE}/search.php?s=${encodeURIComponent(keyword)}`;
   const response = await fetch(url);
   if (!response.ok) {
      throw new Error(`API-fout: HTTP ${response.status} – ${response.statusText}`);
   }
   const data = await response.json();
   if (!data.meals) {
      return [];
   }
   return data.meals.slice(0, MAX_RESULTS);
}

async function getMealById(mealId) {
   const url = `${API_BASE}/lookup.php?i=${encodeURIComponent(mealId)}`;
   const response = await fetch(url);
   if (!response.ok) {
      throw new Error(`API-fout: HTTP ${response.status} – ${response.statusText}`);
   }
   const data = await response.json();
   return data.meals ? data.meals[0] : null;
}

function extractIngredients(meal) {
   const ingredients = [];
   for (let i = 1; i <= 20; i++) {
      const ingredient = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];
      if (ingredient && ingredient.trim() !== '') {
         ingredients.push({
            ingredient: ingredient.trim(),
            measure: measure ? measure.trim() : ''
         });
      }
   }
   return ingredients;
}

function createRecipeCardHTML(meal, isFav) {
   const safeName = escapeAttr(meal.strMeal);
   const starClass = isFav ? 'favorite-btn active' : 'favorite-btn';
   const starSymbol = isFav ? '★' : '☆';
   const starLabel = isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten';
   const imgSrc = meal.strMealThumb
      ? `${meal.strMealThumb}/preview`
      : 'https://via.placeholder.com/300x180?text=Geen+afbeelding';

   return `
        <article class="recipe-card" data-meal-id="${meal.idMeal}">
            <img
                class="recipe-card-img"
                src="${imgSrc}"
                alt="Foto van ${safeName}"
                loading="lazy"
                onerror="this.src='https://via.placeholder.com/300x180?text=Geen+afbeelding'"
            />
            <div class="recipe-card-body">
                <div class="recipe-card-header">
                    <h3 class="recipe-card-title">${escapeHTML(meal.strMeal)}</h3>
                    <button
                        class="${starClass}"
                        data-meal-id="${meal.idMeal}"
                        aria-label="${starLabel}"
                        title="${starLabel}"
                    >${starSymbol}</button>
                </div>
                <div class="recipe-card-meta">
                    ${meal.strCategory ? `<span class="badge">🍴 ${escapeHTML(meal.strCategory)}</span>` : ''}
                    ${meal.strArea ? `<span class="badge">🌍 ${escapeHTML(meal.strArea)}</span>` : ''}
                </div>
            </div>
            <div class="recipe-card-footer">
                <button
                    class="detail-btn"
                    data-meal-id="${meal.idMeal}"
                    aria-label="Meer details over ${safeName}"
                >
                    📖 Meer details
                </button>
            </div>
        </article>
    `;
}

function renderDetailPage(meal) {
   const isFav = isFavorite(meal.idMeal);
   const starClass = isFav ? 'favorite-btn active' : 'favorite-btn';
   const starSymbol = isFav ? '★' : '☆';
   const starLabel = isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten';
   const ingredients = extractIngredients(meal);
   const ingredientsHTML = ingredients
      .map(({ ingredient, measure }) => {
         const thumbUrl = `https://www.themealdb.com/images/ingredients/${encodeURIComponent(ingredient)}-small.png`;
         return `
                <li class="ingredient-item">
                    <img
                        class="ingredient-thumb"
                        src="${thumbUrl}"
                        alt="${escapeAttr(ingredient)}"
                        loading="lazy"
                        onerror="this.style.display='none'"
                    />
                    <span><strong>${escapeHTML(measure)}</strong> ${escapeHTML(ingredient)}</span>
                </li>
            `;
      })
      .join('');
   const youtubeHTML = meal.strYoutube
      ? `<a href="${escapeAttr(meal.strYoutube)}" target="_blank" rel="noopener" class="youtube-btn">
               ▶ Bekijk op YouTube
           </a>`
      : '';
   const tagsHTML = meal.strTags
      ? meal.strTags.split(',')
         .map(t => `<span class="detail-badge">${escapeHTML(t.trim())}</span>`)
         .join('')
      : '';
   detailContent.innerHTML = `
        <img
            class="detail-img"
            src="${escapeAttr(meal.strMealThumb)}"
            alt="Foto van ${escapeAttr(meal.strMeal)}"
            onerror="this.style.display='none'"
        />
        <div class="detail-title-row">
            <h2 class="detail-title">${escapeHTML(meal.strMeal)}</h2>
            <button
                class="${starClass}"
                data-meal-id="${meal.idMeal}"
                aria-label="${starLabel}"
                title="${starLabel}"
                style="font-size: 1.8rem;"
            >${starSymbol}</button>
        </div>
        <div class="detail-badges">
            ${meal.strCategory ? `<span class="detail-badge">🍴 ${escapeHTML(meal.strCategory)}</span>` : ''}
            ${meal.strArea ? `<span class="detail-badge">🌍 ${escapeHTML(meal.strArea)}</span>` : ''}
            ${tagsHTML}
        </div>
        <h3 class="detail-section-title">🧂 Ingrediënten</h3>
        <ul class="ingredients-list">
            ${ingredientsHTML || '<li>Geen ingrediënten beschikbaar.</li>'}
        </ul>
        <h3 class="detail-section-title">📋 Bereiding</h3>
        <p class="instructions-text">${escapeHTML(meal.strInstructions || 'Geen instructies beschikbaar.')}</p>
        ${youtubeHTML}
    `;
   const detailStarBtn = detailContent.querySelector('.favorite-btn');
   if (detailStarBtn) {
      detailStarBtn.addEventListener('click', () => toggleFavorite(meal));
   }
}

function setLoading(show) {
   if (show) {
      loadingSpinner.classList.remove('hidden');
      errorMessage.classList.add('hidden');
   } else {
      loadingSpinner.classList.add('hidden');
   }
}

function showError(message) {
   errorMessage.textContent = message;
   errorMessage.classList.remove('hidden');
}

function hideError() {
   errorMessage.classList.add('hidden');
}

function updateAllStarButtons(mealId) {
   const fav = isFavorite(mealId);
   const allStarBtns = document.querySelectorAll(`.favorite-btn[data-meal-id="${mealId}"]`);
   allStarBtns.forEach(btn => {
      if (fav) {
         btn.classList.add('active');
         btn.textContent = '★';
         btn.setAttribute('aria-label', 'Verwijder uit favorieten');
         btn.setAttribute('title', 'Verwijder uit favorieten');
      } else {
         btn.classList.remove('active');
         btn.textContent = '☆';
         btn.setAttribute('aria-label', 'Voeg toe aan favorieten');
         btn.setAttribute('title', 'Voeg toe aan favorieten');
      }
   });
}

function openDetailOverlay() {
   detailOverlay.classList.remove('hidden');
   document.body.style.overflow = 'hidden';
   detailOverlay.scrollTop = 0;
   backBtn.focus();
}

function closeDetailOverlay() {
   detailOverlay.classList.add('hidden');
   document.body.style.overflow = '';
}

function renderFavorites() {
   const favorites = getFavorites();
   const mealList = Object.values(favorites);
   if (mealList.length === 0) {
      noFavoritesMsg.classList.remove('hidden');
      favoritesGrid.innerHTML = '';
   } else {
      noFavoritesMsg.classList.add('hidden');
      favoritesGrid.innerHTML = mealList
         .map(meal => createRecipeCardHTML(meal, true))
         .join('');
      attachCardEventListeners(favoritesGrid);
   }
}

function renderResults(meals, keyword) {
   resultsTitle.textContent = `🔎 Resultaten voor "${keyword}" (${meals.length} gevonden)`;
   resultsTitle.classList.remove('hidden');
   if (meals.length === 0) {
      resultsGrid.innerHTML = `
            <p style="color: var(--color-text-muted); font-style: italic; grid-column: 1/-1;">
                Geen recepten gevonden voor "<strong>${escapeHTML(keyword)}</strong>".
                Probeer een ander zoekwoord.
            </p>
        `;
      return;
   }
   resultsGrid.innerHTML = meals
      .map(meal => createRecipeCardHTML(meal, isFavorite(meal.idMeal)))
      .join('');
   attachCardEventListeners(resultsGrid);
}

function attachCardEventListeners(gridElement) {
   gridElement.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async(e) => {
         e.stopPropagation();
         const mealId = btn.dataset.mealId;
         if (isFavorite(mealId)) {
            const favorites = getFavorites();
            toggleFavorite(favorites[mealId]);
         } else {
            try {
               const fullMeal = await getMealById(mealId);
               if (fullMeal) {
                  toggleFavorite(fullMeal);
               }
            } catch (err) {
               console.error('Kon receptdetails niet ophalen voor favoriet:', err);
               const card = btn.closest('.recipe-card');
               if (card) {
                  const minimalMeal = { idMeal: mealId, strMeal: card.querySelector('.recipe-card-title')?.textContent || '' };
                  toggleFavorite(minimalMeal);
               }
            }
         }
      });
   });
   gridElement.querySelectorAll('.detail-btn').forEach(btn => {
      btn.addEventListener('click', async() => {
         const mealId = btn.dataset.mealId;
         await openMealDetail(mealId);
      });
   });
}

async function openMealDetail(mealId) {
   try {
      detailContent.innerHTML = '<p style="text-align:center; padding: 3rem;">Laden...</p>';
      openDetailOverlay();
      const meal = await getMealById(mealId);
      if (!meal) {
         detailContent.innerHTML = '<p style="text-align:center; color: #e74c3c;">Recept niet gevonden.</p>';
         return;
      }
      renderDetailPage(meal);
   } catch (err) {
      detailContent.innerHTML = `
            <p style="text-align:center; color: #e74c3c; padding: 2rem;">
                ⚠️ Fout bij ophalen van details: ${escapeHTML(err.message)}
            </p>
        `;
      console.error('Fout bij openMealDetail:', err);
   }
}

async function handleSearch(e) {
   e.preventDefault();
   const keyword = searchInput.value.trim();
   if (!keyword) {
      showError('Voer een zoekwoord in om recepten te vinden.');
      return;
   }
   hideError();
   setLoading(true);
   resultsGrid.innerHTML = '';
   resultsTitle.classList.add('hidden');
   try {
      const meals = await searchMealsByKeyword(keyword);
      renderResults(meals, keyword);
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
   } catch (err) {
      showError(`⚠️ Fout bij het zoeken: ${err.message}. Controleer je internetverbinding.`);
      console.error('Zoekfout:', err);
   } finally {
      setLoading(false);
   }
}

function escapeHTML(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
   if (!str) return '';
   return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function init() {
   searchForm.addEventListener('submit', handleSearch);
   backBtn.addEventListener('click', closeDetailOverlay);
   document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !detailOverlay.classList.contains('hidden')) {
         closeDetailOverlay();
      }
   });
   renderFavorites();
   console.log('✅ RecipeZoeker geïnitialiseerd. Klaar voor gebruik.');
}

init();
