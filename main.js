import { MapData } from './MapData.js';
import { MissionService } from './MissionService.js';
import { SaveManager } from './SaveManager.js';
import { UIManager } from './UIManager.js';
import { InteractionManager } from './InteractionManager.js';
import { NotificationManager } from './NotificationManager.js';
import { log } from './Utils.js';

/**
 * GridCrime - Bootstrapping
 * main.js dient nur noch als Einstiegspunkt für die Instanziierung der Core-Services.
 * Die gesamte UI-Logik und das Session-Management liegen im UIManager.
 */

const CITIES = [
    { id: "berlin", name: "Berlin", lat: 52.5200, lng: 13.4050, zoom: 15 },
    { id: "hamburg", name: "Hamburg", lat: 53.5511, lng: 9.9937, zoom: 15 },
    { id: "muenchen", name: "München", lat: 48.1371, lng: 11.5755, zoom: 15 },
    { id: "dortmund", name: "Dortmund", lat: 51.5139, lng: 7.4653, zoom: 15 },
    { id: "koeln", name: "Köln", lat: 50.9375, lng: 6.9603, zoom: 15 },
    { id: "aachen", name: "Aachen", lat: 50.7753, lng: 6.0839, zoom: 15 },
    { id: "fuerth", name: "Fürth", lat: 49.4783, lng: 10.9902, zoom: 15 },
    { id: "siegburg", name: "Siegburg", lat: 50.7998, lng: 7.2075, zoom: 15 },
    { id: "lueneburg", name: "Lüneburg", lat: 53.2464, lng: 10.4115, zoom: 15 },
    { id: "dormagen", name: "Dormagen", lat: 51.0964, lng: 6.8400, zoom: 15 },
    { id: "monheim", name: "Monheim am Rhein", lat: 51.0899, lng: 6.8906, zoom: 15 },
    { id: "freiburg", name: "Freiburg", lat: 47.9990, lng: 7.8421, zoom: 15 },
    { id: "bruehl", name: "Brühl", lat: 50.8295, lng: 6.9025, zoom: 15 }
];

async function initApp() {
    log("[BOOTSTRAP] Initialisiere GridCrime Core...");

    // 1. Core Services instanziieren (Session-unabhängig)
    const mapData = new MapData();
    const missionService = new MissionService(mapData);
    const saveManager = new SaveManager();
    
    // 2. Globale Manager für Dialoge und Toasts
    new InteractionManager();
    new NotificationManager();

    // 3. UIManager instanziieren und die Kontrolle übergeben
    // Er übernimmt das Event-Routing und das Session-Lifecycle-Management.
    new UIManager(mapData, missionService, saveManager, CITIES);

    log("[BOOTSTRAP] Anwendung bereit.");
}

// Einstiegspunkt bei geladenem DOM
document.addEventListener('DOMContentLoaded', initApp);
