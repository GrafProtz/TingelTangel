import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';

/**
 * DialogFactory - Erzeugt standardisierte Konfigurationsobjekte für den InteractionManager.
 * Trennt UI-Template-Logik von der Geschäftslogik.
 */
export class DialogFactory {
    static getBicycleInteractionDialog(riskData, target) {
        const policeMalus = riskData.proximityRisk + riskData.interferenceRisk;
        const dialogBody = `
            <p style="color: var(--color-warning); font-size: 0.9rem; margin-bottom: 12px; border-left: 3px solid var(--color-warning); padding-left: 8px;">
                Achtung: Auf dem Rad bist du schneller, aber auffälliger. Deine Informanten verlangen einen Risikoaufschlag. Die Fortbewegung kostet dich auf dem Bike 15 Cent pro Meter statt der üblichen 10 Cent.
            </p>
            <div class="scouting-report" style="line-height: 1.6;">
                <p style="margin-bottom: 16px;">"Die Rechnung ist einfach, Kumpel. Schau dir die Zahlen an, bevor du den Schneider ansetzt..."</p>
                <div style="background: rgba(0,0,0,0.05); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.95rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Grund-Chance (Statistik):</span><span>9,7%</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: ${policeMalus > 0 ? 'var(--color-danger)' : 'inherit'};"><span>Bullen-Präsenz vor Ort:</span><span>+${policeMalus}%</span></div>
                    ${riskData.isDisguised ? `<div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: var(--color-secondary);"><span>Friseur-Tarnung:</span><span>-50%</span></div>` : ''}
                </div>
                <div style="border-top: 2px solid var(--color-text); padding-top: 12px; display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem; color:var(--color-danger);">
                    <span>GESAMTRISIKO:</span><span>${riskData.totalRisk}%</span>
                </div>
            </div>
        `;

        return {
            title: 'Drahtesel im Visier',
            text: dialogBody,
            buttons: [
                { text: 'Einverstanden (Knacken)', event: EVENTS.START_BICYCLE_THEFT_RNG, payload: { target, riskData }, className: 'btn-danger' },
                { text: 'Lieber nicht', event: EVENTS.RESUME_GAME, className: 'btn-secondary' }
            ]
        };
    }

    static getBarberDialog() {
        return {
            title: 'Ein neues Gesicht?',
            text: `"Brauchst du ein neues Gesicht, Kumpel? Die Schmiere ist dir dicht auf den Fersen. Setz dich auf den Stuhl, lass mich die Konturen nachziehen und die Matte färben. Wenn du hier rausgehst, erkennt dich nicht mal deine eigene Mutter wieder. Dein Entdeckungsrisiko für den nächsten Bruch schmilzt auf die Hälfte zusammen, und deine Nerven bleiben wie Drahtseile – die Abbruchquote halbiert sich gleich mit. Was sagst du? Ein paar Kröten für ein Ticket in die Unsichtbarkeit?"`,
            buttons: [
                { text: 'Umstyling starten (50 €)', event: EVENTS.BARBER_TRANSFORM_START },
                { text: 'Später vielleicht', event: EVENTS.RESUME_GAME }
            ]
        };
    }

    static getBoltCutterDialog(cost) {
        return {
            title: 'Ein geschmeidiges Angebot',
            text: `"Hör zu, Freundchen. Für ${cost} Kröten überlasse ich dir diesen Bolzenschneider. Damit knackst du die Drahtesel an den Stellplätzen da draußen. Die Bullen juckt das kaum – nicht mal 10 Prozent Aufklärungsquote, ein absoluter Witz! Wenn du auf so einem Bock sitzt, machst du gleich zwei Blocks auf einmal. Du bist ein verdammter Geist auf zwei Rädern. Haben wir einen Deal?"`,
            buttons: [
                { text: `Einverstanden (${cost} €)`, event: EVENTS.BUY_BOLT_CUTTER, payload: { cost } },
                { text: 'Vielleicht später', event: EVENTS.RESUME_GAME }
            ]
        };
    }

    static getNetworkErrorDialog() {
        return {
            title: 'Verbindungsfehler',
            text: "Die Satelliten-Verbindung zum städtischen Bauamt ist aktuell gestört (Server Timeout). Bitte versuche es in ein paar Sekunden noch einmal oder wähle eine andere Stadt.",
            buttons: [{ text: 'Zurück zum Hauptmenü', event: EVENTS.RELOAD_GAME }]
        };
    }

    static getRadarTutorial(count) {
        return {
            title: "Auge des Gesetzes",
            fullText: `Wir haben in diesem Sektor ${count} Polizeistationen. Hör gut zu: Je näher du an einer Wache ein Ding drehst, desto extremer steigt dein Risiko, geschnappt zu werden.<br><br>Damit du nicht blind in die Falle läufst: Mit dem Hotkey 'P' kannst du alle 5 Minuten für 5 Sekunden die Standorte der Bullen aufdecken. Präg sie dir gut ein!`,
            shortText: "Polizeipräsenz aufgedeckt. Hotkey 'P' nutzt einen 5-Sekunden-Scan (Cooldown: 5 Min).",
            nextEvent: EVENTS.START_POLICE_REVEAL
        };
    }

    static getBurglaryAbort() {
        return {
            title: 'Abbruch!',
            text: "Die mechanischen Sicherungen waren zu stark. Du musstest abbrechen und fliehen!",
            buttons: [{ text: 'Verdammt', event: EVENTS.RESUME_GAME }]
        };
    }

    static getBurglaryCaught(fine) {
        return {
            title: 'Erwischt!',
            text: `Die Polizei war schneller. Du musstest ${fine} € Strafe zahlen.`,
            buttons: [{ text: 'Verdammt', event: EVENTS.RESUME_GAME }]
        };
    }

    static getBurglarySuccess(amount, debt = 0) {
        let loanInfo = "";
        if (debt > 0) {
            loanInfo = `<br><br><span style="color:var(--color-danger); font-size:0.9rem;">Rückzahlung an die Verbrecher*innen-Innung: ${debt} € wurden von deiner Beute einbehalten. Deine Weste bei der Verbrecher*innen-Innung ist vorerst wieder sauber.</span>`;
        }
        return {
            title: 'Erfolg!',
            text: `Du hast ${amount} € erbeutet!${loanInfo}`,
            buttons: [{ text: 'Hervorragend', event: EVENTS.RESUME_GAME }]
        };
    }

    static getBicycleTheftSuccess() {
        return {
            title: 'Erfolg!',
            text: '<div style="text-align:center;"><div style="font-size: 3rem; margin-bottom: 1rem;">🚲</div><p>Rad geknackt! Du bist jetzt lautlos und schnell unterwegs.</p><p style="font-size: 0.9rem; opacity: 0.7; margin-top: 1rem;">(Drücke \'F\' zum Auf/Absteigen)</p></div>',
            buttons: [{ text: 'Hervorragend', event: EVENTS.BICYCLE_THEFT_SUCCESS_DONE }]
        };
    }

    static getBurglaryDialog(data) {
        const { target, riskData, mult, isDisguised } = data;
        
        const disguiseBonus = isDisguised ? 0.5 : 1.0;
        const disguiseText = isDisguised
            ? '<div style="color: #4ade80; font-weight: bold; margin-bottom: 4px;">Tarnung aktiv (-50% Risiko)</div>'
            : '';

        const warning = riskData.riskMalus > 0 ? 'WARNUNG ' : '';
        const warningSuffix = riskData.riskMalus > 0 ? ' (Hohe Polizeipraesenz!)' : '';

        return {
            title: STRINGS.interactions.burglary.title(target.type),
            options: {
                A: {
                    text: warning + STRINGS.interactions.burglary.optionA + warningSuffix,
                    risk: Math.min(95, Math.round((CONFIG.RISK_BURGLARY_EASY + riskData.riskMalus) * mult * disguiseBonus)),
                    reward: 180,
                    preview: disguiseText + (warning ? '<div style="color: #ef4444; font-weight: bold;">WARNUNG: Hohes Risiko durch Polizei!</div>' : '') + STRINGS.interactions.burglary.previewA,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                B: {
                    text: warning + STRINGS.interactions.burglary.optionB + warningSuffix,
                    risk: Math.min(95, Math.round((CONFIG.RISK_BURGLARY_MEDIUM + riskData.riskMalus) * mult * disguiseBonus)),
                    reward: 450,
                    preview: disguiseText + (warning ? '<div style="color: #ef4444; font-weight: bold;">WARNUNG: Hohes Risiko durch Polizei!</div>' : '') + STRINGS.interactions.burglary.previewB,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                C: {
                    text: warning + STRINGS.interactions.burglary.optionC + warningSuffix,
                    risk: Math.min(98, Math.round((CONFIG.RISK_BURGLARY_HARD + riskData.riskMalus) * mult * disguiseBonus)),
                    reward: 1350,
                    preview: disguiseText + (warning ? '<div style="color: #ef4444; font-weight: bold;">WARNUNG: Hohes Risiko durch Polizei!</div>' : '') + STRINGS.interactions.burglary.previewC,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                }
            }
        };
    }

    static getBicycleTheftFailure(fine) {
        return {
            title: 'Erwischt!',
            text: `Ein aufmerksamer Zeuge hat dich beim Knacken beobachtet! Die Polizei hat dich gestellt. Du musstest ${fine} € Strafe zahlen.`,
            buttons: [{ text: 'Verdammt', event: EVENTS.RESUME_GAME }]
        };
    }

    static getWelcomeDialog(cityName, targetPubName) {
        return {
            title: "Willkommen in der Unterwelt",
            fullText: `Willkommen in ${cityName}, Grünschnabel. Die städtische Verbrecher*innen-Innung gewährt dir ein Startkapital von 300 Euro. Betrachte es als Vorschuss. Dein erstes Ziel: Beweg deinen Hintern in die Kneipe namens '${targetPubName}', nicht weit weg von hier. Dort schnappen wir ein paar lukrative Gerüchte auf, wie man hier an echtes Geld kommt.<br><br>Aber merk dir eins: Wir spazieren hier nicht gemütlich über den Bürgersteig. Wir bewegen uns von Ecke zu Ecke, von Knotenpunkt zu Knotenpunkt - wir schleichen vorsichtig durch die Stadt. Und das kostet! Die Straße verlangt ihren Tribut. Jeder Schritt kostet Schmiergeld – exakt 10 Cent pro Meter, mindestens jedoch 1 € pro Knotenpunkt-Sprung. Behalte dein Budget im Auge. Plane deine Route über die grünen Punkte also extrem clever, sonst bist du pleite, bevor du überhaupt dein erstes Ding gedreht hast.`,
            shortText: `Ziel: Erreiche die Kneipe '${targetPubName}'. (Achtung: Jeder Meter über die Knotenpunkte kostet Startkapital!)`,
            logId: 'goal-visit-pub'
        };
    }
}
