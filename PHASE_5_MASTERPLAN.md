# 🔬 GridCrime — Masterplan Phase 5 (Architectural Hardening)

Dieser Plan basiert auf dem Elite-Audit vom 11.05.2026. Ziel ist es, die verbliebenen Logik-Fehler zu beseitigen und die Architektur für den Release zu härten.

## 🔴 Etappe 8.1 — Kritische Bugfixes (Subscriber)
*   **Problem:** `BARBER_TRANSFORM_START` wird doppelt verarbeitet (Game.js & main.js). Buff wird 2x angewendet.
*   **Fix:** Konsolidierung der Logik in `main.js` oder `Game.js`. Entfernung des doppelten `RELOAD_GAME` Handlers.

## 🔴 Etappe 8.2 — Toast-Standardisierung
*   **Problem:** Inkonsistenz zwischen `{ msg: "..." }` und `{ message: "..." }`.
*   **Fix:** Projektweites Suchen & Ersetzen auf `{ message: "..." }`. NotificationManager bereinigen.

## 🟡 Etappe 8.3 — Risiko-Logik & Config (H4, M3)
*   **Problem:** Risiko-Berechnungen sind in `Game.js` hartcodiert (Schattenlogik). 12+ Magic Numbers im Code.
*   **Fix:** Migration der Logik in den `RiskCalculator`. Alle Preise/Werte in `GameConfig.js` auslagern.

## 🟡 Etappe 8.4 — State-Integrität (M1, M2, M4)
*   **Problem:** Getters geben Referenzen auf Objekte zurück (State-Leak). `hydrate()` validiert Inhalte nicht tief genug.
*   **Fix:** `structuredClone()` in `GameState.js` einführen. Schema-Validierung für Savegames implementieren.

## 🔵 Etappe 8.5 — View-Abstraktion & Cleanup (M5, M6)
*   **Problem:** Inline-HTML im InteractionManager. Verwaiste Dateien (`GameController.js` etc.).
*   **Fix:** Verschieben komplexer Dialoge in `DialogFactory`. Physisches Löschen der Dead-Files.

## ⚪ Etappe 8.6 — Code-Hygiene (L1-L5)
*   **Fix:** `console.trace` entfernen. Import-Reihenfolge korrigieren. Sidebar-Logic in `UIManager` zentralisieren.
