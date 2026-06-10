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

/* -------------------------------------------------------------------------
   SECTIE 1: CONSTANTEN & DOM-VERWIJZINGEN
   ------------------------------------------------------------------------- */

/** Basis-URL voor alle TheMealDB API-aanroepen */
const API_BASE = 'https://www.themealdb.com/api/json/v1/1';

/** Sleutel voor localStorage: hier slaan we favoriet-IDs op */
const STORAGE_KEY = 'recipeZoeker_favorites';

/** Maximaal aantal zoekresultaten dat getoond wordt */
const MAX_RESULTS = 20;

// DOM-elementen ophalen (eenmalig bij laden van het script)
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

/* -------------------------------------------------------------------------
   SECTIE 2: FAVORITES – LEZEN & SCHRIJVEN UIT LOCALSTORAGE
   ------------------------------------------------------------------------- */

/**
 * Haalt de opgeslagen favoriete recepten op uit localStorage.
 * @returns {Object} Een object met mealId als sleutel en receptdata als waarde.
 *                   Voorbeeld: { "52772": { strMeal: "...", ... } }
 */
function getFavorites() {
   try {
      // Probeer de JSON-string uit localStorage te parsen
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
   } catch (err) {
      // Bij een fout (corrupted data) starten we met een leeg object
      console.warn('Kon favorieten niet lezen uit localStorage:', err);
      return {};
   }
}

/**
 * Slaat het volledige favorieten-object op in localStorage.
 * @param {Object} favorites - Het bijgewerkte favorieten-object.
 */
function saveFavorites(favorites) {
   try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
   } catch (err) {
      console.error('Kon favorieten niet opslaan in localStorage:', err);
   }
}

/**
 * Controleert of een recept (op basis van ID) een favoriet is.
 * @param {string} mealId - Het unieke ID van het recept.
 * @returns {boolean} true als favoriet, anders false.
 */
function isFavorite(mealId) {
   const favorites = getFavorites();
   return Object.prototype.hasOwnProperty.call(favorites, mealId);
}

/**
 * Voegt een recept toe aan of verwijdert het uit de favorieten.
 * Werkt de localStorage bij en herrendert de favorietensectie.
 * @param {Object} meal - Het receptobject van de API.
 */
function toggleFavorite(meal) {
   const favorites = getFavorites();
   const id = meal.idMeal;

   if (isFavorite(id)) {
      // Recept IS al een favoriet → verwijderen
      delete favorites[id];
   } else {
      // Recept is GEEN favoriet → toevoegen
      favorites[id] = meal;
   }

   // Bijgewerkte favorieten opslaan
   saveFavorites(favorites);

   // Favorieten opnieuw renderen op de pagina
   renderFavorites();

   // Alle ster-knoppen op de pagina bijwerken (zowel in grid als in overlay)
   updateAllStarButtons(id);
}

/* -------------------------------------------------------------------------
   SECTIE 3: API – DATA OPHALEN MET FETCH / ASYNC-AWAIT
   ------------------------------------------------------------------------- */

/**
 * Zoekt recepten op basis van een trefwoord via de TheMealDB API.
 * Gebruikt de zoek-endpoint: /search.php?s=<keyword>
 *
 * @param {string} keyword - Het zoekwoord ingegeven door de gebruiker.
 * @returns {Promise<Array>} Een array van receptobjecten (max 20), of leeg array als niets gevonden.
 * @throws {Error} Bij een netwerk- of HTTP-fout.
 */
async function searchMealsByKeyword(keyword) {
   // Encodeer het zoekwoord voor gebruik in de URL
   const url = `${API_BASE}/search.php?s=${encodeURIComponent(keyword)}`;

   // Fetch-aanroep met async/await (verplicht per taakbeschrijving)
   const response = await fetch(url);

   // Controleer of de HTTP-respons succesvol is (statuscode 200-299)
   if (!response.ok) {
      throw new Error(`API-fout: HTTP ${response.status} – ${response.statusText}`);
   }

   // Parseer de JSON-respons
   const data = await response.json();

   // De API geeft null terug als er geen resultaten zijn
   if (!data.meals) {
      return [];
   }

   // Beperk de resultaten tot MAX_RESULTS (20)
   return data.meals.slice(0, MAX_RESULTS);
}

/**
 * Haalt de volledige details van één recept op via zijn ID.
 * Gebruikt de lookup-endpoint: /lookup.php?i=<id>
 *
 * @param {string} mealId - Het unieke ID van het recept.
 * @returns {Promise<Object|null>} Het receptobject met alle details, of null als niet gevonden.
 * @throws {Error} Bij een netwerk- of HTTP-fout.
 */
async function getMealById(mealId) {
   const url = `${API_BASE}/lookup.php?i=${encodeURIComponent(mealId)}`;
   const response = await fetch(url);

   if (!response.ok) {
      throw new Error(`API-fout: HTTP ${response.status} – ${response.statusText}`);
   }

   const data = await response.json();

   // Geef het eerste (en enige) resultaat terug, of null
   return data.meals ? data.meals[0] : null;
}

/* -------------------------------------------------------------------------
   SECTIE 4: INGREDIËNTEN EXTRAHEREN UIT RECEPTOBJECT
   ------------------------------------------------------------------------- */

/**
 * Extraheert de ingrediënten en hoeveelheden uit een receptobject.
 *
 * De TheMealDB API slaat ingrediënten op als losse velden:
 *   strIngredient1 t/m strIngredient20
 *   strMeasure1    t/m strMeasure20
 *
 * @param {Object} meal - Het receptobject van de API.
 * @returns {Array<{ingredient: string, measure: string}>} Lijst van niet-lege ingrediënten.
 */
function extractIngredients(meal) {
   const ingredients = [];

   // Loop door alle 20 mogelijke ingrediëntsloten
   for (let i = 1; i <= 20; i++) {
      const ingredient = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];

      // Alleen toevoegen als het ingrediëntveld niet leeg is
      if (ingredient && ingredient.trim() !== '') {
         ingredients.push({
            ingredient: ingredient.trim(),
            measure: measure ? measure.trim() : ''
         });
      }
   }

   return ingredients;
}

/* -------------------------------------------------------------------------
   SECTIE 5: HTML-GENERATIE – RECEPTKAARTEN
   ------------------------------------------------------------------------- */

/**
 * Maakt de HTML-string voor één receptkaart aan.
 * De kaart bevat: afbeelding, naam, ster-knop, categorie, gebied, detail-knop.
 *
 * @param {Object} meal     - Het receptobject.
 * @param {boolean} isFav  - Of het recept momenteel een favoriet is.
 * @returns {string} HTML-string voor de kaart.
 */
function createRecipeCardHTML(meal, isFav) {
   // Escape de receptnaam voor gebruik in data-attributen (vermijdt XSS/problemen met aanhalingstekens)
   const safeName = escapeAttr(meal.strMeal);

   // Bepaal de sterstatus: gevuld (★) of leeg (☆)
   const starClass = isFav ? 'favorite-btn active' : 'favorite-btn';
   const starSymbol = isFav ? '★' : '☆';
   const starLabel = isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten';

   // Gebruik een noodafbeelding als de API geen afbeelding geeft
   const imgSrc = meal.strMealThumb
      ? `${meal.strMealThumb}/preview`
      : 'https://via.placeholder.com/300x180?text=Geen+afbeelding';

   return `
        <article class="recipe-card" data-meal-id="${meal.idMeal}">
            <!-- Receptafbeelding -->
            <img
                class="recipe-card-img"
                src="${imgSrc}"
                alt="Foto van ${safeName}"
                loading="lazy"
                onerror="this.src='https://via.placeholder.com/300x180?text=Geen+afbeelding'"
            />

            <!-- Kaart inhoud -->
            <div class="recipe-card-body">

                <!-- Koptekst: naam + ster -->
                <div class="recipe-card-header">
                    <h3 class="recipe-card-title">${escapeHTML(meal.strMeal)}</h3>
                    <button
                        class="${starClass}"
                        data-meal-id="${meal.idMeal}"
                        aria-label="${starLabel}"
                        title="${starLabel}"
                    >${starSymbol}</button>
                </div>

                <!-- Badges: categorie en/of gebied -->
                <div class="recipe-card-meta">
                    ${meal.strCategory ? `<span class="badge">🍴 ${escapeHTML(meal.strCategory)}</span>` : ''}
                    ${meal.strArea ? `<span class="badge">🌍 ${escapeHTML(meal.strArea)}</span>` : ''}
                </div>

            </div>

            <!-- Detail-knop onderaan de kaart -->
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

/* -------------------------------------------------------------------------
   SECTIE 6: HTML-GENERATIE – DETAILPAGINA
   ------------------------------------------------------------------------- */

/**
 * Rendert de volledige detailpagina van een recept in de overlay.
 * Bevat: afbeelding, naam+ster, badges, ingrediënten, instructies, YouTube-link.
 *
 * @param {Object} meal - Het gedetailleerde receptobject van de API.
 */
function renderDetailPage(meal) {
   const isFav = isFavorite(meal.idMeal);
   const starClass = isFav ? 'favorite-btn active' : 'favorite-btn';
   const starSymbol = isFav ? '★' : '☆';
   const starLabel = isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten';

   // Haal ingrediënten op
   const ingredients = extractIngredients(meal);

   // Bouw de ingrediëntenlijst als HTML
   const ingredientsHTML = ingredients
      .map(({ ingredient, measure }) => {
         // Thumbnail-URL voor het ingrediënt (TheMealDB voorziet dit)
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

   // YouTube-knop (alleen als de API een link geeft)
   const youtubeHTML = meal.strYoutube
      ? `<a href="${escapeAttr(meal.strYoutube)}" target="_blank" rel="noopener" class="youtube-btn">
               ▶ Bekijk op YouTube
           </a>`
      : '';

   // Tags weergeven als ze beschikbaar zijn
   const tagsHTML = meal.strTags
      ? meal.strTags.split(',')
         .map(t => `<span class="detail-badge">${escapeHTML(t.trim())}</span>`)
         .join('')
      : '';

   // Bouw de volledige HTML samen
   detailContent.innerHTML = `
        <!-- Hero-afbeelding -->
        <img
            class="detail-img"
            src="${escapeAttr(meal.strMealThumb)}"
            alt="Foto van ${escapeAttr(meal.strMeal)}"
            onerror="this.style.display='none'"
        />

        <!-- Titel + favorietster -->
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

        <!-- Badges: categorie, gebied, tags -->
        <div class="detail-badges">
            ${meal.strCategory ? `<span class="detail-badge">🍴 ${escapeHTML(meal.strCategory)}</span>` : ''}
            ${meal.strArea ? `<span class="detail-badge">🌍 ${escapeHTML(meal.strArea)}</span>` : ''}
            ${tagsHTML}
        </div>

        <!-- INGREDIËNTEN -->
        <h3 class="detail-section-title">🧂 Ingrediënten</h3>
        <ul class="ingredients-list">
            ${ingredientsHTML || '<li>Geen ingrediënten beschikbaar.</li>'}
        </ul>

        <!-- BEREIDINGSINSTRUCTIES -->
        <h3 class="detail-section-title">📋 Bereiding</h3>
        <p class="instructions-text">${escapeHTML(meal.strInstructions || 'Geen instructies beschikbaar.')}</p>

        <!-- YouTube link (optioneel) -->
        ${youtubeHTML}
    `;

   // Voeg event listener toe aan de ster-knop in de detail-overlay
   const detailStarBtn = detailContent.querySelector('.favorite-btn');
   if (detailStarBtn) {
      detailStarBtn.addEventListener('click', () => toggleFavorite(meal));
   }
}

/* -------------------------------------------------------------------------
   SECTIE 7: UI-HULPFUNCTIES
   ------------------------------------------------------------------------- */

/**
 * Toont of verbergt de laadspinner.
 * @param {boolean} show - true = tonen, false = verbergen.
 */
function setLoading(show) {
   if (show) {
      loadingSpinner.classList.remove('hidden');
      errorMessage.classList.add('hidden'); // Verberg eventuele foutmelding
   } else {
      loadingSpinner.classList.add('hidden');
   }
}

/**
 * Toont een foutmelding aan de gebruiker.
 * @param {string} message - De te tonen foutmelding.
 */
function showError(message) {
   errorMessage.textContent = message;
   errorMessage.classList.remove('hidden');
}

/**
 * Verbergt de foutmelding.
 */
function hideError() {
   errorMessage.classList.add('hidden');
}

/**
 * Werkt alle ster-knoppen op de pagina bij voor een specifiek recept-ID.
 * Dit zorgt voor synchronisatie tussen de favorietenlijst, zoekresultaten en overlay.
 *
 * @param {string} mealId - Het recept-ID waarvoor de sterren bijgewerkt moeten worden.
 */
function updateAllStarButtons(mealId) {
   const fav = isFavorite(mealId);

   // Selecteer ALLE ster-knoppen op de pagina met dit meal-ID
   const allStarBtns = document.querySelectorAll(`.favorite-btn[data-meal-id="${mealId}"]`);

   allStarBtns.forEach(btn => {
      if (fav) {
         // Activeer de ster (geel)
         btn.classList.add('active');
         btn.textContent = '★';
         btn.setAttribute('aria-label', 'Verwijder uit favorieten');
         btn.setAttribute('title', 'Verwijder uit favorieten');
      } else {
         // Deactiveer de ster (grijs)
         btn.classList.remove('active');
         btn.textContent = '☆';
         btn.setAttribute('aria-label', 'Voeg toe aan favorieten');
         btn.setAttribute('title', 'Voeg toe aan favorieten');
      }
   });
}

/**
 * Opent de fullscreen detail-overlay.
 * Blokkeert ook het scrollen van de achtergrond.
 */
function openDetailOverlay() {
   detailOverlay.classList.remove('hidden');
   document.body.style.overflow = 'hidden'; // Voorkom scrollen van achtergrondpagina
   detailOverlay.scrollTop = 0; // Scroll naar boven in de overlay
   backBtn.focus(); // Zet focus op terug-knop (toegankelijkheid)
}

/**
 * Sluit de fullscreen detail-overlay.
 * Herstelt het scrollen van de achtergrond.
 */
function closeDetailOverlay() {
   detailOverlay.classList.add('hidden');
   document.body.style.overflow = ''; // Herstel scrollen
}

/* -------------------------------------------------------------------------
   SECTIE 8: RENDEREN – FAVORIETEN & ZOEKRESULTATEN
   ------------------------------------------------------------------------- */

/**
 * Rendert de favorietensectie opnieuw op basis van de opgeslagen favorieten.
 * Toont een bericht als er geen favorieten zijn.
 */
function renderFavorites() {
   const favorites = getFavorites();
   const mealList = Object.values(favorites); // Array van receptobjecten

   if (mealList.length === 0) {
      // Geen favorieten: toon het informatieve bericht
      noFavoritesMsg.classList.remove('hidden');
      favoritesGrid.innerHTML = '';
   } else {
      // Favorieten aanwezig: verberg het bericht en render de kaarten
      noFavoritesMsg.classList.add('hidden');
      favoritesGrid.innerHTML = mealList
         .map(meal => createRecipeCardHTML(meal, true))
         .join('');

      // Voeg event listeners toe aan de kaarten in de favorietenlijst
      attachCardEventListeners(favoritesGrid);
   }
}

/**
 * Rendert de zoekresultaten in het resultaten-grid.
 *
 * @param {Array}  meals   - Array van receptobjecten van de API.
 * @param {string} keyword - Het gebruikte zoekwoord (voor de sectietitel).
 */
function renderResults(meals, keyword) {
   // Toon de sectietitel met zoekwoord
   resultsTitle.textContent = `🔎 Resultaten voor "${keyword}" (${meals.length} gevonden)`;
   resultsTitle.classList.remove('hidden');

   if (meals.length === 0) {
      // Geen resultaten gevonden
      resultsGrid.innerHTML = `
            <p style="color: var(--color-text-muted); font-style: italic; grid-column: 1/-1;">
                Geen recepten gevonden voor "<strong>${escapeHTML(keyword)}</strong>".
                Probeer een ander zoekwoord.
            </p>
        `;
      return;
   }

   // Render de receptkaarten
   resultsGrid.innerHTML = meals
      .map(meal => createRecipeCardHTML(meal, isFavorite(meal.idMeal)))
      .join('');

   // Voeg event listeners toe
   attachCardEventListeners(resultsGrid);
}

/* -------------------------------------------------------------------------
   SECTIE 9: EVENT LISTENERS OP RECEPTKAARTEN
   ------------------------------------------------------------------------- */

/**
 * Voegt event listeners toe aan alle ster-knoppen en detail-knoppen binnen een grid.
 * Wordt aangeroepen na het renderen van kaarten.
 *
 * @param {HTMLElement} gridElement - Het grid-element dat de receptkaarten bevat.
 */
function attachCardEventListeners(gridElement) {
   // ── Ster-knoppen: favoriet toevoegen/verwijderen ──
   gridElement.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async(e) => {
         e.stopPropagation(); // Voorkom dat het klikken op de kaart zelf ook reageert

         const mealId = btn.dataset.mealId;

         if (isFavorite(mealId)) {
            // Recept al in favorieten: direct verwijderen (geen API-call nodig)
            const favorites = getFavorites();
            toggleFavorite(favorites[mealId]);
         } else {
            /*
                 * Recept nog NIET in favorieten:
                 * We moeten de VOLLEDIGE receptdata ophalen zodat we alles
                 * (inclusief ingrediënten) kunnen bewaren in localStorage.
                 * Dit is nodig omdat de zoekresultaten niet altijd alle velden bevatten.
                 */
            try {
               // Laad de volledige data op via de API
               const fullMeal = await getMealById(mealId);
               if (fullMeal) {
                  toggleFavorite(fullMeal);
               }
            } catch (err) {
               console.error('Kon receptdetails niet ophalen voor favoriet:', err);

               // Fallback: gebruik de beschikbare data op de kaart
               const card = btn.closest('.recipe-card');
               if (card) {
                  // Minimal object met beschikbare kaartdata
                  const minimalMeal = { idMeal: mealId, strMeal: card.querySelector('.recipe-card-title')?.textContent || '' };
                  toggleFavorite(minimalMeal);
               }
            }
         }
      });
   });

   // ── Detail-knoppen: open fullscreen overlay ──
   gridElement.querySelectorAll('.detail-btn').forEach(btn => {
      btn.addEventListener('click', async() => {
         const mealId = btn.dataset.mealId;
         await openMealDetail(mealId);
      });
   });
}

/* -------------------------------------------------------------------------
   SECTIE 10: DETAILPAGINA OPENEN
   ------------------------------------------------------------------------- */

/**
 * Haalt de volledige receptdetails op en toont de overlay.
 * @param {string} mealId - Het unieke ID van het recept.
 */
async function openMealDetail(mealId) {
   try {
      // Toon de overlay alvast (met laadtekst)
      detailContent.innerHTML = '<p style="text-align:center; padding: 3rem;">Laden...</p>';
      openDetailOverlay();

      // Haal de volledige data op via de API
      const meal = await getMealById(mealId);

      if (!meal) {
         detailContent.innerHTML = '<p style="text-align:center; color: #e74c3c;">Recept niet gevonden.</p>';
         return;
      }

      // Render de detailpagina
      renderDetailPage(meal);
   } catch (err) {
      // Toon een foutmelding in de overlay
      detailContent.innerHTML = `
            <p style="text-align:center; color: #e74c3c; padding: 2rem;">
                ⚠️ Fout bij ophalen van details: ${escapeHTML(err.message)}
            </p>
        `;
      console.error('Fout bij openMealDetail:', err);
   }
}

/* -------------------------------------------------------------------------
   SECTIE 11: ZOEKFUNCTIE – HOOFD EVENT HANDLER
   ------------------------------------------------------------------------- */

/**
 * Verwerkt het zoekformulier: valideert invoer, roept de API aan en rendert resultaten.
 * @param {Event} e - Het submit-event van het formulier.
 */
async function handleSearch(e) {
   // Voorkom de standaard formulier-submit (pagina herladen)
   e.preventDefault();

   const keyword = searchInput.value.trim();

   // Valideer: zoekwoord mag niet leeg zijn
   if (!keyword) {
      showError('Voer een zoekwoord in om recepten te vinden.');
      return;
   }

   // Verberg eventuele vorige foutmeldingen
   hideError();

   // Toon laadspinner
   setLoading(true);

   // Verberg vorige resultaten tijdens het laden
   resultsGrid.innerHTML = '';
   resultsTitle.classList.add('hidden');

   try {
      // ── API-AANROEP: zoek recepten ──
      const meals = await searchMealsByKeyword(keyword);

      // Resultaten weergeven
      renderResults(meals, keyword);

      // Scroll naar de resultaten
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
   } catch (err) {
      // Netwerkfout of API-fout: toon foutmelding
      showError(`⚠️ Fout bij het zoeken: ${err.message}. Controleer je internetverbinding.`);
      console.error('Zoekfout:', err);
   } finally {
      // Verberg de laadspinner (altijd, ook bij fouten)
      setLoading(false);
   }
}

/* -------------------------------------------------------------------------
   SECTIE 12: BEVEILIGINGSHULPFUNCTIES (XSS-preventie)
   ------------------------------------------------------------------------- */

/**
 * Escapet HTML-speciale tekens om XSS te voorkomen bij het invoegen in innerHTML.
 * @param {string} str - De te escapen string.
 * @returns {string} De geëscapete string.
 */
function escapeHTML(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

/**
 * Escapet string voor gebruik in HTML-attribuutwaarden.
 * @param {string} str - De te escapen string.
 * @returns {string} De geëscapete string.
 */
function escapeAttr(str) {
   if (!str) return '';
   return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/* -------------------------------------------------------------------------
   SECTIE 13: INITIALISATIE – OPSTART VAN DE APPLICATIE
   ------------------------------------------------------------------------- */

/**
 * Initialiseert de applicatie:
 *   1. Koppelt het zoekformulier aan de zoekfunctie
 *   2. Koppelt de terug-knop aan het sluiten van de overlay
 *   3. Laadt en toont de bestaande favorieten
 */
function init() {
   // ── Zoekformulier submit ──
   searchForm.addEventListener('submit', handleSearch);

   // ── Terug-knop in de detail-overlay ──
   backBtn.addEventListener('click', closeDetailOverlay);

   // ── Toetsenbord: Escape-toets sluit de overlay ──
   document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !detailOverlay.classList.contains('hidden')) {
         closeDetailOverlay();
      }
   });

   // ── Laad en toon opgeslagen favorieten bij pagina-initialisatie ──
   renderFavorites();

   console.log('✅ RecipeZoeker geïnitialiseerd. Klaar voor gebruik.');
}

// Start de applicatie zodra het script geladen is (ES module: DOM altijd klaar)
init();
