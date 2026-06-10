// ==========================================
// 1. SUPABASE DATABASE VERBINDING
// ==========================================
const SUPABASE_URL = 'https://blvyjmuczormousztpiv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsdnlqbXVjem9ybW91c3p0cGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTA4OTAsImV4cCI6MjA5NjU4Njg5MH0.aJUpJaxO77pZxy9nLXt9iX6R_DZtUcwNer0pGbe2YZs';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase succesvol geïnitialiseerd!", supabaseClient);


// ==========================================
// 2. CODE VOOR DE BOODSCHAPPENLIJST
// ==========================================
const inputVeld = document.getElementById('boodschapInput');
const knop = document.getElementById('voegToeKnop');
const lijst = document.getElementById('boodschappenLijst');

async function laadBoodschappenUitCloud() {
    const { data, error } = await supabaseClient
        .from('boodschappen')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Fout bij ophalen boodschappen:", error);
        return;
    }
    lijst.innerHTML = "";
    if (data) {
        data.forEach(item => {
            maakNieuwLijstItem(item.id, item.tekst, item.afgevinkt);
        });
    }
}

function maakNieuwLijstItem(id, tekst, isAfgevinkt) {
    const nieuwItem = document.createElement('li');
    nieuwItem.style.cursor = 'pointer';
    nieuwItem.setAttribute('data-id', id);

    const tekstKnoop = document.createTextNode(tekst);
    nieuwItem.appendChild(tekstKnoop);

    const verwijderKnop = document.createElement('button');
    verwijderKnop.textContent = '❌';
    verwijderKnop.className = 'verwijder-btn';
    verwijderKnop.style.marginLeft = '15px';

    if (isAfgevinkt) {
        nieuwItem.style.textDecoration = 'line-through';
        nieuwItem.style.opacity = '0.5';
    }

    nieuwItem.appendChild(verwijderKnop);
    lijst.appendChild(nieuwItem);
}

knop.addEventListener('click', function() {
    const tekst = inputVeld.value.trim();
    if (tekst !== "") {
        supabaseClient
            .from('boodschappen')
            .insert([{ tekst: tekst, afgevinkt: false }])
            .select()
            .then(result => {
                if (result.error) console.error(result.error);
                else {
                    const nieuweRij = result.data[0];
                    maakNieuwLijstItem(nieuweRij.id, nieuweRij.tekst, nieuweRij.afgevinkt);
                    inputVeld.value = "";
                }
            });
    }
});

lijst.addEventListener('click', async function(event) {
    const itemElement = event.target.closest('li');
    if (!itemElement) return;
    const databaseId = itemElement.getAttribute('data-id');

    if (event.target.classList.contains('verwijder-btn')) {
        const { error } = await supabaseClient.from('boodschappen').delete().eq('id', databaseId);
        if (!error) itemElement.remove();
    } else if (event.target.tagName === 'LI') {
        const huidigeStatus = itemElement.style.textDecoration === 'line-through';
        const nieuweStatus = !huidigeStatus;
        const { error } = await supabaseClient.from('boodschappen').update({ afgevinkt: nieuweStatus }).eq('id', databaseId);
        if (!error) {
            itemElement.style.textDecoration = nieuweStatus ? 'line-through' : 'none';
            itemElement.style.opacity = nieuweStatus ? '0.5' : '1';
        }
    }
});

// Realtime Boodschappen
supabaseClient
    .channel('boodschappen-wijzigingen')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'boodschappen' }, (payload) => {
        if (payload.eventType === 'INSERT') {
            if (!document.querySelector(`li[data-id="${payload.new.id}"]`)) {
                maakNieuwLijstItem(payload.new.id, payload.new.tekst, payload.new.afgevinkt);
            }
        }
        if (payload.eventType === 'UPDATE') {
            const schermItem = document.querySelector(`li[data-id="${payload.new.id}"]`);
            if (schermItem) {
                schermItem.style.textDecoration = payload.new.afgevinkt ? 'line-through' : 'none';
                schermItem.style.opacity = payload.new.afgevinkt ? '0.5' : '1';
            }
        }
        if (payload.eventType === 'DELETE') {
            const schermItem = document.querySelector(`li[data-id="${payload.old.id}"]`);
            if (schermItem) schermItem.remove();
        }
    }).subscribe();


// ==========================================
// 3. CODE VOOR DE KALENDER & WEEKPLANNER
// ==========================================

// HTML-elementen oppakken
const taakInput = document.getElementById('taakInput');
const tijdInput = document.getElementById('tijdInput');
const eindTijdInput = document.getElementById('eindTijdInput');
const datumInput = document.getElementById('datumInput');
const persoonSelect = document.getElementById('persoonSelect');
const plannerKnop = document.getElementById('voegTaakToeKnop');

const weekTitel = document.getElementById('weekTitel');
const vorigeWeekKnop = document.getElementById('vorigeWeekKnop');
const volgendeWeekKnop = document.getElementById('volgendeWeekKnop');

// Elementen voor de Bewerk-Pop-up (Modal)
const bewerkModal = document.getElementById('bewerkModal');
const bewerkId = document.getElementById('bewerkId');
const bewerkTaakInput = document.getElementById('bewerkTaakInput');
const bewerkTijdInput = document.getElementById('bewerkTijdInput');
const bewerkEindTijdInput = document.getElementById('bewerkEindTijdInput');
const bewerkDatumInput = document.getElementById('bewerkDatumInput');
const sluitModalKnop = document.getElementById('sluitModalKnop');
const opslaanModalKnop = document.getElementById('opslaanModalKnop');

const kleurMappen = {
    'Algemeen': '#64748b',
    'Peter': '#4a90e2',
    'Amy': '#e91e63',
    'Alysha': '#4caf50',
    'Ruben': '#ff9800'
};

let huidigeMaandag = getMaandagVanDezeWeek(new Date()); 
let weekDatums = {}; 

function getMaandagVanDezeWeek(d) {
    const datum = new Date(d);
    const dagVanDeWeek = datum.getDay(); 
    const verschil = datum.getDate() - dagVanDeWeek + (dagVanDeWeek === 0 ? -6 : 1); 
    return new Date(datum.setDate(verschil));
}

function updateKalenderDatums() {
    const opties = { month: 'short', day: 'numeric' };
    const dagenNamen = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    let loopDatum = new Date(huidigeMaandag);

    dagenNamen.forEach((dag, index) => {
        const jaar = loopDatum.getFullYear();
        const maand = String(loopDatum.getMonth() + 1).padStart(2, '0');
        const dagNr = String(loopDatum.getDate()).padStart(2, '0');
        weekDatums[dag] = `${jaar}-${maand}-${dagNr}`;

        const kop = document.getElementById(`kop-${dag}`);
        if (kop) {
            kop.textContent = `${dag.charAt(0).toUpperCase() + dag.slice(1)} (${loopDatum.toLocaleDateString('nl-NL', opties)})`;
        }
        loopDatum.setDate(loopDatum.getDate() + 1);
    });

    const tijdelijkeDatum = new Date(huidigeMaandag);
    tijdelijkeDatum.setHours(0, 0, 0, 0);
    tijdelijkeDatum.setDate(tijdelijkeDatum.getDate() + 3 - (tijdelijkeDatum.getDay() + 6) % 7);
    const week1 = new Date(tijdelijkeDatum.getFullYear(), 0, 4);
    const weekNummer = 1 + Math.round(((tijdelijkeDatum.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);

    weekTitel.textContent = `Week ${weekNummer} (${huidigeMaandag.getFullYear()})`;
    
    if (!datumInput.value) {
        datumInput.value = weekDatums['maandag'];
    }
}

async function laadPlannerUitCloud() {
    updateKalenderDatums();
    const startDatum = weekDatums['maandag'];
    const eindDatum = weekDatums['zondag'];

    const { data, error } = await supabaseClient
        .from('planner')
        .select('*')
        .gte('datum', startDatum)
        .lte('datum', eindDatum)
        .order('tijd', { ascending: true });

    if (error) {
        console.error("Fout bij ophalen planner:", error);
        return;
    }

    const alleDagen = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    alleDagen.forEach(dag => {
        const dagLijst = document.getElementById(`lijst-${dag}`);
        if (dagLijst) dagLijst.innerHTML = "";
    });

    if (data) {
        data.forEach(item => {
            const dagenNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
            const datumObject = new Date(item.datum);
            const dagNaam = dagenNamen[datumObject.getDay()];
            
            maakNieuwPlannerItem(item.id, item.tekst, dagNaam, item.persoon, item.kleur, item.tijd, item.eindtijd, item.datum);
        });
    }
}

function maakNieuwPlannerItem(id, tekst, dagNaam, persoon, kleur, vanTijd, totTijd, exacteDatum) {
    const dagLijst = document.getElementById(`lijst-${dagNaam}`);
    if (!dagLijst) return;

    const taakElement = document.createElement('li');
    taakElement.className = 'planner-item';
    taakElement.style.backgroundColor = kleur;
    taakElement.style.color = 'white';
    taakElement.style.padding = '10px';
    taakElement.style.marginBottom = '8px';
    taakElement.style.borderRadius = '8px';
    taakElement.style.position = 'relative';
    taakElement.style.listStyle = 'none';
    taakElement.style.cursor = 'pointer'; // Handje tonen bij hoveren
    taakElement.setAttribute('data-id', id);
    taakElement.setAttribute('data-datum', exacteDatum);
    taakElement.setAttribute('data-tekst', tekst);
    taakElement.setAttribute('data-tijd', vanTijd || "");
    taakElement.setAttribute('data-eindtijd', totTijd || "");

    let tijdWeergave = "";
    if (vanTijd) {
        tijdWeergave = ` <span style="font-size: 0.85rem; opacity: 0.95; font-weight: 500;">(${vanTijd}${totTijd ? ' - ' + totTijd : ''})</span>`;
    }

    taakElement.innerHTML = `<div class="taak-klik-zone"><strong>${persoon}:</strong> <span class="taak-tekst-vlak">${tekst}</span>${tijdWeergave}</div>`;

    const wisKnop = document.createElement('span');
    wisKnop.textContent = '❌';
    wisKnop.style.position = 'absolute';
    wisKnop.style.right = '10px';
    wisKnop.style.top = '10px';
    wisKnop.style.cursor = 'pointer';
    wisKnop.className = 'wis-taak-btn';

    taakElement.appendChild(wisKnop);
    dagLijst.appendChild(taakElement);
}

// Invoeren nieuwe taak (Nu met wekelijkse herhaling!)
plannerKnop.addEventListener('click', function() {
    const tekst = taakInput.value.trim();
    const gekozenDatumString = datumInput.value; 
    const persoon = persoonSelect.value;
    const vanTijd = tijdInput.value;
    const totTijd = eindTijdInput.value;
    const kleur = kleurMappen[persoon] || '#777777';
    const moetHerhalen = document.getElementById('herhaalCheckbox').checked; // NIEUW

    if (tekst === "" || gekozenDatumString === "") {
        alert("Vul een taak in én kies een datum!");
        return;
    }

    // Array om alle rijen in te verzamelen die we gaan opslaan
    let takenOmOpTeSlaan = [];
    
    // We bepalen hoeveel weken we vooruit schrijven (1 eenmalig, of 12 weken bij herhaling)
    const aantalWeken = moetHerhalen ? 12 : 1;
    
    let basisDatum = new Date(gekozenDatumString);
    const dagenNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

    for (let i = 0; i < aantalWeken; i++) {
        // Formateer de datum netjes als JJJJ-MM-DD voor Supabase
        const jaar = basisDatum.getFullYear();
        const maand = String(basisDatum.getMonth() + 1).padStart(2, '0');
        const dagNr = String(basisDatum.getDate()).padStart(2, '0');
        const loopDatumString = `${jaar}-${maand}-${dagNr}`;
        
        // Bepaal de dagnaam (maandag, dinsdag, etc.)
        const dagNaam = dagenNamen[basisDatum.getDay()];

        // Voeg dit item toe aan onze verzamellijst
        takenOmOpTeSlaan.push({
            tekst: tekst,
            datum: loopDatumString,
            dag: dagNaam,
            persoon: persoon,
            kleur: kleur,
            tijd: vanTijd,
            eindtijd: totTijd
        });

        // Belangrijk: Tel 7 dagen op bij de datum voor de volgende ronde in de loop!
        basisDatum.setDate(basisDatum.getDate() + 7);
    }

    // Stuur de hele lijst in één keer (bulk-insert) naar Supabase!
    supabaseClient
        .from('planner')
        .insert(takenOmOpTeSlaan)
        .select()
        .then(result => {
            if (result.error) {
                console.error("Fout bij opslaan herhalende taak:", result.error);
                alert("Er ging iets mis bij het opslaan.");
            } else {
                // Herlaad de planner op het scherm, zodat de taak direct zichtbaar is 
                // als de gekozen datum in de huidige week viel
                laadPlannerUitCloud();
                
                // Formulier leegmaken en checkbox resetten
                taakInput.value = "";
                tijdInput.value = "";
                eindTijdInput.value = "";
                document.getElementById('herhaalCheckbox').checked = false;
            }
        });
});

// NIEUW: Klikken in de week-container (Wissen óf Bewerken openen)
document.querySelector('.week-container').addEventListener('click', async function(event) {
    // Geval A: Er is op het kruisje geklikt (Wissen)
    if (event.target.classList.contains('wis-taak-btn')) {
        event.stopPropagation(); // Voorkom dat ook het bewerkscherm opent
        const taakElement = event.target.closest('.planner-item');
        const databaseId = taakElement.getAttribute('data-id');

        const { error } = await supabaseClient.from('planner').delete().eq('id', databaseId);
        if (!error) taakElement.remove();
    } 
    // Geval B: Er is op de taak zelf geklikt (Bewerken openen)
    else {
        const taakElement = event.target.closest('.planner-item');
        if (!taakElement) return;

        // Gegevens uit het element lezen en in de pop-up stoppen
        bewerkId.value = taakElement.getAttribute('data-id');
        bewerkTaakInput.value = taakElement.getAttribute('data-tekst');
        bewerkTijdInput.value = taakElement.getAttribute('data-tijd');
        bewerkEindTijdInput.value = taakElement.getAttribute('data-einditjd') || taakElement.getAttribute('data-eindtijd');
        bewerkDatumInput.value = taakElement.getAttribute('data-datum');

        // Toon het bewerkscherm
        bewerkModal.style.display = 'flex';
    }
});

// Sluitknop van pop-up
sluitModalKnop.addEventListener('click', () => { bewerkModal.style.display = 'none'; });

// Opslaan-knop in de pop-up
opslaanModalKnop.addEventListener('click', async function() {
    const id = bewerkId.value;
    const nieuweTekst = bewerkTaakInput.value.trim();
    const nieuweVanTijd = bewerkTijdInput.value;
    const nieuweTotTijd = bewerkEindTijdInput.value;
    const nieuweDatum = bewerkDatumInput.value;

    if (nieuweTekst === "" || nieuweDatum === "") {
        alert("Vul een tekst en datum in!");
        return;
    }

    const { error } = await supabaseClient
        .from('planner')
        .update({
            tekst: nieuweTekst,
            tijd: nieuweVanTijd,
            eindtijd: nieuweTotTijd,
            datum: nieuweDatum
        })
        .eq('id', id);

    if (error) {
        alert("Kon wijziging niet opslaan");
        console.error(error);
    } else {
        bewerkModal.style.display = 'none';
        laadPlannerUitCloud(); // Ververs het overzicht direct lokaal
    }
});

// REALTIME KALENDER SYNCHRONISATIE (Aangevuld met UPDATE)
supabaseClient
    .channel('planner-wijzigingen')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'planner' }, (payload) => {
        // Iemand voegt iets toe
        if (payload.eventType === 'INSERT') {
            const n = payload.new;
            if (n.datum >= weekDatums['maandag'] && n.datum <= weekDatums['zondag']) {
                if (!document.querySelector(`.planner-item[data-id="${n.id}"]`)) {
                    const dagenNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
                    const dagNaam = dagenNamen[new Date(n.datum).getDay()];
                    maakNieuwPlannerItem(n.id, n.tekst, dagNaam, n.persoon, n.kleur, n.tijd, n.eindtijd, n.datum);
                }
            }
        }
        // NIEUW: Iemand past een taak aan (Herlaad de week om verspringen/verplaatsen op te vangen)
        if (payload.eventType === 'UPDATE') {
            laadPlannerUitCloud(); 
        }
        // Iemand wist iets
        if (payload.eventType === 'DELETE') {
            const schermItem = document.querySelector(`.planner-item[data-id="${payload.old.id}"]`);
            if (schermItem) schermItem.remove();
        }
    }).subscribe();

// ==========================================
// 4. INITIALISATIE (STARTPUNTEN)
// ==========================================
laadBoodschappenUitCloud();
laadPlannerUitCloud();
laadVensterbankUitCloud();


// ==========================================
// CODE VOOR DE LIVE PLANTEN-API & VENSTERBANK
// ==========================================

const PLANT_API_KEY = 'esk-QwoW6a296461437b218093'; // Jouw Perenual sleutel

const plantZoekInput = document.getElementById('plantZoekInput');
const zoekPlantKnop = document.getElementById('zoekPlantKnop');
const plantResultaatDiv = document.getElementById('plantResultaat');
const plantNaam = document.getElementById('plantNaam');
const plantWaterInfo = document.getElementById('plantWaterInfo');
const plantZonInfo = document.getElementById('plantZonInfo');
const opslaanPlantKnop = document.getElementById('opslaanPlantKnop');
const vensterbankLijst = document.getElementById('vensterbankLijst');

// Globale variabelen om de data van de momenteel gezochte plant tijdelijk vast te houden
let tijdelijkePlantData = null;
let vensterbankTimers = {}; // Object om alle lopende klokjes per plant in te bewaren

/ 1. Zoeken naar een plant via de API (Geoptimaliseerd voor het gratis abonnement!)
zoekPlantKnop.addEventListener('click', async function() {
    const zoekTerm = plantZoekInput.value.trim().toLowerCase();
    if (zoekTerm === "") return alert("Typ eerst een plantennaam in!");

    zoekPlantKnop.textContent = "Zoeken... 🪴";
    zoekPlantKnop.disabled = true;

    try {
        // We doen nu nog maar 1 verzoek in plaats van 2 achter elkaar!
        const zoekUrl = `https://perenual.com/api/species-list?key=${PLANT_API_KEY}&q=${zoekTerm}`;
        const antwoord = await fetch(zoekUrl);
        
        // Als we een 429 fout krijgen, vangen we dat nu netjes op met een duidelijke melding
        if (antwoord.status === 429) {
            alert("De planten-database is even overprikkeld (Limiet bereikt). Wacht een minuutje en probeer het nog eens!");
            return;
        }

        const resultaat = await antwoord.json();

        if (!resultaat.data || resultaat.data.length === 0) {
            alert(`Geen plant gevonden voor '${zoekTerm}'. Probeer het in het Engels!`);
            return;
        }

        // We pakken de data direct uit de eerste zoeklijst, hier zit al genoeg in!
        const gevondenPlant = resultaat.data[0];

        plantResultaatDiv.style.display = 'block';
        const naamMooi = gevondenPlant.common_name ? gevondenPlant.common_name.toUpperCase() : zoekTerm;
        plantNaam.textContent = naamMooi;

        // Waterbehoefte zit gelukkig ook in deze kortere lijst
        const waterBehoefte = gevondenPlant.watering || "Average";
        plantWaterInfo.textContent = vertaalWaterbehoefte(waterBehoefte);
        
        // Zonlichtgegevens
        plantZonInfo.textContent = (gevondenPlant.sunlight || ["Halfschaduw"]).join(', ');

        let waterDagen = 7;
        if (waterBehoefte.toLowerCase().includes('frequent')) waterDagen = 3;
        if (waterBehoefte.toLowerCase().includes('average')) waterDagen = 7;
        if (waterBehoefte.toLowerCase().includes('minimum')) waterDagen = 14;

        // Sla de gegevens op voor de opslaan-knop
        tijdelijkePlantData = { naam: naamMooi, water_dagen: waterDagen };

    } catch (fout) {
        console.error(fout);
        alert("Er ging iets mis bij het ophalen van de plantendata.");
    } finally {
        zoekPlantKnop.textContent = "Plant zoeken";
        zoekPlantKnop.disabled = false;
    }
});

function vertaalWaterbehoefte(terme) {
    const t = terme.toLowerCase();
    if (t.includes('frequent')) return "Veel water (1x per 3 à 4 dagen)";
    if (t.includes('average')) return "Gemiddeld (1x per 7 dagen)";
    if (t.includes('minimum')) return "Weinig water (1x per 14 dagen)";
    return terme;
}

// 2. Klikken op de knop "Toevoegen aan mijn vensterbank"
opslaanPlantKnop.addEventListener('click', function() {
    if (!tijdelijkePlantData) return;

    const vandaagString = new Date().toISOString().split('T')[0]; // Geeft de datum van vandaag: JJJJ-MM-DD

    supabaseClient
        .from('mijn_planten')
        .insert([{
            naam: tijdelijkePlantData.naam,
            water_dagen: tijdelijkePlantData.water_dagen,
            laatst_water: vandaagString
        }])
        .select()
        .then(result => {
            if (result.error) console.error(result.error);
            else {
                plantResultaatDiv.style.display = 'none';
                plantZoekInput.value = "";
                tijdelijkePlantData = null;
                laadVensterbankUitCloud(); // Vernieuw de vensterbank direct
            }
        });
});

// 3. Haal de opgeslagen planten op uit de cloud
async function laadVensterbankUitCloud() {
    // Wis eerst alle lopende timers om dubbele klokken te voorkomen
    Object.values(vensterbankTimers).forEach(t => clearInterval(t));
    vensterbankTimers = {};
    vensterbankLijst.innerHTML = "";

    const { data, error } = await supabaseClient
        .from('mijn_planten')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    if (data) {
        data.forEach(plant => {
            maakVensterbankCard(plant.id, plant.naam, plant.water_dagen, plant.laatst_water);
        });
    }
}

// 4. Bouw een visueel kaartje voor de vensterbank
function maakVensterbankCard(id, naam, waterDagen, laatstWaterString) {
    const card = document.createElement('div');
    card.className = 'plant-badge';
    card.style.background = 'white';
    card.style.position = 'relative';
    card.setAttribute('data-id', id);

    card.innerHTML = `
        <h4 style="color: #1e293b; margin-bottom: 5px;">${naam}</h4>
        <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 10px;">Cyclus: elke ${waterDagen} dagen</div>
        <div style="font-size: 0.9rem; margin-bottom: 15px;">
            💧 Gietklok: <span class="aftel-klok" style="font-weight: bold; font-family: monospace;">Berekenen...</span>
        </div>
        <div style="display: flex; gap: 5px;">
            <button class="water-geef-btn" style="background-color: #3b82f6; padding: 6px 12px; font-size: 0.85rem; flex: 1;">Give water 💧</button>
            <button class="plant-wis-btn" style="background-color: transparent; color: #94a3b8; padding: 6px; font-size: 0.85rem;">🗑️</button>
        </div>
    `;

    vensterbankLijst.appendChild(card);

    // Berekening voor de aftelklok van deze specifieke plant
    const klokVlak = card.querySelector('.aftel-klok');
    const laatstWaterTijd = new Date(laatstWaterString).getTime();
    const doelTijd = laatstWaterTijd + (waterDagen * 24 * 60 * 60 * 1000);

    // Start een interval die specifiek voor dit kaartje elke seconde tikt
    vensterbankTimers[id] = setInterval(function() {
        const nu = new Date().getTime();
        const afstand = doelTijd - nu;

        const d = Math.floor(afstand / (1000 * 60 * 60 * 24));
        const u = Math.floor((afstand % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((afstand % (1000 * 60 * 60)) / (1000 * 60));

        if (afstand < 0) {
            klokVlak.textContent = "🚨 GEEF WATER!";
            klokVlak.style.color = '#ef4444';
        } else {
            klokVlak.textContent = `${d}d ${u}u ${m}m`;
            klokVlak.style.color = '#166534';
        }
    }, 1000);
}

// 5. Knoppen op de kaarten bedienen (Water geven of Plant weggooien)
vensterbankLijst.addEventListener('click', async function(event) {
    const card = event.target.closest('.plant-badge');
    if (!card) return;
    const id = card.getAttribute('data-id');

    // SITUATIE A: Plant heeft water gehad (Reset de datum naar VANDAAG)
    if (event.target.classList.contains('water-geef-btn')) {
        const vandaagString = new Date().toISOString().split('T')[0];
        const { error } = await supabaseClient
            .from('mijn_planten')
            .update({ laatst_water: vandaagString })
            .eq('id', id);

        if (!error) laadVensterbankUitCloud(); // Herbereken de klokken direct
    }

    // SITUATIE B: Plant is helaas overleden of weg (Verwijderen uit de database)
    if (event.target.classList.contains('plant-wis-btn')) {
        const { error } = await supabaseClient
            .from('mijn_planten')
            .delete()
            .eq('id', id);

        if (!error) {
            clearInterval(vensterbankTimers[id]);
            card.remove();
        }
    }
});

// 6. REALTIME SYNCHRONISATIE VOOR DE VENSTERBANK
supabaseClient
    .channel('vensterbank-wijzigingen')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mijn_planten' }, (payload) => {
        // Bij updates of nieuwe planten laden we de lijst even fris in
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            laadVensterbankUitCloud();
        }
        if (payload.eventType === 'DELETE') {
            const schermItem = document.querySelector(`.plant-badge[data-id="${payload.old.id}"]`);
            if (schermItem) {
                clearInterval(vensterbankTimers[payload.old.id]);
                schermItem.remove();
            }
        }
    }).subscribe();

// ==========================================
// CODE VOOR HET MOODBOARD (LOKALE PREVIEW)
// ==========================================
const fotoInput = document.getElementById('fotoInput');
const kiesFotoKnop = document.getElementById('KiesFotoKnop');
const bestandsNaamSpan = document.getElementById('bestandsNaam');
const ruimteSelect = document.getElementById('ruimteSelect');
const tagsInput = document.getElementById('tagsInput');
const voegIdeeToeKnop = document.getElementById('voegIdeeToeKnop');
const moodboardGalerij = document.getElementById('moodboardGalerij');
let geselecteerdeFotoUrl = "";

kiesFotoKnop.addEventListener('click', function() {
    fotoInput.click();
});

fotoInput.addEventListener('change', function() {
    if (fotoInput.files && fotoInput.files[0]) {
        const bestand = fotoInput.files[0];
        bestandsNaamSpan.textContent = bestand.name;
        geselecteerdeFotoUrl = URL.createObjectURL(bestand);
    }
});

voegIdeeToeKnop.addEventListener('click', function() {
    const gekozenRuimte = ruimteSelect.value;
    const tagsTekst = tagsInput.value.trim();

    if (!geselecteerdeFotoUrl) {
        alert("Kies eerst een foto via de 'Kies Foto' knop!");
        return;
    }

    const itemCard = document.createElement('div');
    itemCard.className = 'moodboard-item';

    const img = document.createElement('img');
    img.src = geselecteerdeFotoUrl;
    img.className = 'moodboard-img';
    itemCard.appendChild(img);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'moodboard-content';

    const ruimteDiv = document.createElement('div');
    ruimteDiv.className = 'moodboard-ruimte';
    ruimteDiv.textContent = gekozenRuimte;
    contentDiv.appendChild(ruimteDiv);

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'moodboard-tags';

    if (tagsTekst !== "") {
        const tagsArray = tagsTekst.split(',');
        tagsArray.forEach(function(tag) {
            const zuivereTag = tag.trim();
            if (zuivereTag !== "") {
                const tagBadge = document.createElement('span');
                tagBadge.className = 'tag-badge';
                tagBadge.textContent = '#' + zuivereTag;
                tagsContainer.appendChild(tagBadge);
            }
        });
    }
    contentDiv.appendChild(tagsContainer);

    const wisKnop = document.createElement('button');
    wisKnop.textContent = '🗑️ Verwijder';
    wisKnop.style.marginTop = '15px';
    wisKnop.style.width = '100%';
    wisKnop.style.backgroundColor = '#ef4444';
    wisKnop.style.color = 'white';
    wisKnop.addEventListener('click', function() {
        itemCard.remove();
    });
    contentDiv.appendChild(wisKnop);

    itemCard.appendChild(contentDiv);
    moodboardGalerij.appendChild(itemCard);

    tagsInput.value = "";
    bestandsNaamSpan.textContent = "Geen bestand gekozen";
    geselecteerdeFotoUrl = "";
    fotoInput.value = "";
});