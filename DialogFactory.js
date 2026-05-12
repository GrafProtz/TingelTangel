import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';

/**
 * DialogFactory - Erzeugt standardisierte Konfigurationsobjekte für den InteractionManager.
 * Trennt UI-Template-Logik von der Geschäftslogik.
 */
export class DialogFactory {
    static getBicycleInteractionDialog(riskData, target) {
        const policeMalus = riskData.proximityRisk + riskData.interferenceRisk;
        const dialogBody = `
            <p style="color: var(--color-warning); font-size: 0.9rem; margin-bottom: 12px; border-left: 3px solid var(--color-warning); padding-left: 8px;">
                Achtung: Auf dem Rad bist du schneller, aber auffälliger. Deine Informanten verlangen einen Risikoaufschlag. Die Fortbewegung kostet dich auf dem Bike ${CONFIG.MULTIPLIERS.BIKING_COST * 10} Cent pro Meter statt der üblichen ${CONFIG.COST_PER_METER * 100} Cent.
            </p>
            <div class="scouting-report" style="line-height: 1.6;">
                <p style="margin-bottom: 16px;">"Die Rechnung ist einfach, Kumpel. Schau dir die Zahlen an, bevor du den Schneider ansetzt..."</p>
                <div style="background: rgba(0,0,0,0.05); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.95rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Grund-Chance (Statistik):</span><span>${CONFIG.RISK_FACTORS.BICYCLE_BASE}%</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: ${policeMalus > 0 ? 'var(--color-danger)' : 'inherit'};"><span>Bullen-Präsenz vor Ort:</span><span>+${policeMalus}%</span></div>
                    ${riskData.isDisguised ? `<div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: var(--color-secondary);"><span>Friseur-Tarnung:</span><span>-${(1 - CONFIG.RISK_FACTORS.DISGUISE_BUFF) * 100}%</span></div>` : ''}
                </div>
                <div style="border-top: 2px solid var(--color-text); padding-top: 12px; display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem; color:var(--color-danger);">
                    <span>GESAMTRISIKO:</span><span>${riskData.totalRisk}%</span>
                </div>
            </div>
        `;

        return {
            title: 'Drahtesel im Visier',
            body: dialogBody,
            buttons: [
                { text: 'Einverstanden (Knacken)', event: EVENTS.START_BICYCLE_THEFT_RNG, payload: { target, riskData }, className: 'btn-danger' },
                { text: 'Lieber nicht', event: EVENTS.RESUME_GAME, className: 'btn-secondary' }
            ]
        };
    }

    static getBarberDialog({ cost = CONFIG.PRICES.BARBER || 50 } = {}) {
        return {
            title: 'Ein neues Gesicht?',
            body: `"Brauchst du ein neues Gesicht, Kumpel? Die Schmiere ist dir dicht auf den Fersen. Setz dich auf den Stuhl, lass mich die Konturen nachziehen und die Matte färben. Wenn du hier rausgehst, erkennt dich nicht mal deine eigene Mutter wieder. Dein Entdeckungsrisiko für den nächsten Bruch schmilzt auf die Hälfte zusammen, und deine Nerven bleiben wie Drahtseile – die Abbruchquote halbiert sich gleich mit. Was sagst du? Ein paar Kröten für ein Ticket in die Unsichtbarkeit?"`,
            buttons: [
                { 
                    text: `Umstyling starten (${cost} €)`, 
                    event: EVENTS.BARBER_TRANSFORM_START,
                    payload: { cost }
                },
                { text: 'Später vielleicht', event: EVENTS.RESUME_GAME }
            ]
        };
    }


    static getNetworkErrorDialog() {
        return {
            title: 'Verbindungsfehler',
            body: "Die Satelliten-Verbindung zum städtischen Bauamt ist aktuell gestört (Server Timeout). Bitte versuche es in ein paar Sekunden noch einmal oder wähle eine andere Stadt.",
            buttons: [{ text: 'Zurück zum Hauptmenü', event: EVENTS.RELOAD_GAME }]
        };
    }

    static getRadarTutorial(count) {
        return {
            title: "Auge des Gesetzes",
            fullText: `Wir haben in diesem Sektor ${count} Polizeistationen. Hör gut zu: Je näher du an einer Wache ein Ding drehst, desto extremer steigt dein Risiko, geschnappt zu werden.<br><br>Damit du nicht blind in die Falle läufst: Mit dem Hotkey 'P' kannst du alle ${CONFIG.COOLDOWNS.RADAR / 60000} Minuten für ${CONFIG.TIMING.RADAR_DURATION / 1000} Sekunden die Standorte der Bullen aufdecken. Präg sie dir gut ein!`,
            shortText: `Polizeipräsenz aufgedeckt. Hotkey 'P' nutzt einen ${CONFIG.TIMING.RADAR_DURATION / 1000}-Sekunden-Scan (Cooldown: ${CONFIG.COOLDOWNS.RADAR / 60000} Min).`,
            nextEvent: EVENTS.START_POLICE_REVEAL
        };
    }

    static getBurglaryAbort() {
        return {
            title: 'Abbruch!',
            body: "Die mechanischen Sicherungen waren zu stark. Du musstest abbrechen und fliehen!",
            buttons: [{ text: 'Verdammt', event: EVENTS.RESUME_GAME }]
        };
    }

    static getBurglaryCaught(fine) {
        return {
            title: 'Erwischt!',
            body: `Die Polizei war schneller. Du musstest ${fine} € Strafe zahlen.`,
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
            body: `Du hast ${amount} € erbeutet!${loanInfo}`,
            buttons: [{ text: 'Hervorragend', event: EVENTS.RESUME_GAME }]
        };
    }

    static getBicycleTheftSuccess() {
        return {
            title: 'Erfolg!',
            body: '<div style="text-align:center;"><div style="font-size: 3rem; margin-bottom: 1rem;">🚲</div><p>Rad geknackt! Du bist jetzt lautlos und schnell unterwegs.</p><p style="font-size: 0.9rem; opacity: 0.7; margin-top: 1rem;">(Drücke \'F\' zum Auf/Absteigen)</p></div>',
            buttons: [{ text: 'Hervorragend', event: EVENTS.BICYCLE_THEFT_SUCCESS_DONE }]
        };
    }

    static getBicycleTheftFailure(fine) {
        return {
            title: 'Erwischt!',
            body: `Ein aufmerksamer Zeuge hat dich beim Knacken beobachtet! Die Polizei hat dich gestellt. Du musstest ${fine} € Strafe zahlen.`,
            buttons: [{ text: 'Verdammt', event: EVENTS.RESUME_GAME }]
        };
    }

    static getWelcomeDialog(cityName, targetPubName) {
        return {
            title: "Willkommen in der Unterwelt",
            body: `Willkommen in ${cityName}, Grünschnabel. Die städtische Verbrecher*innen-Innung gewährt dir ein Startkapital von ${CONFIG.INITIAL_BUDGET} Euro. Betrachte es als Vorschuss. Dein erstes Ziel: Beweg deinen Hintern in die Kneipe namens '${targetPubName}', nicht weit weg von hier. Dort schnappen wir ein paar lukrative Gerüchte auf, wie man hier an echtes Geld kommt.<br><br>Aber merk dir eins: Wir spazieren hier nicht gemütlich über den Bürgersteig. Wir bewegen uns von Ecke zu Ecke, von Knotenpunkt zu Knotenpunkt - wir schleichen vorsichtig durch die Stadt. Und das kostet! Die Straße verlangt ihren Tribut. Jeder Schritt kostet Schmiergeld – exakt ${CONFIG.COST_PER_METER * 100} Cent pro Meter, mindestens jedoch 1 € pro Knotenpunkt-Sprung. Behalte dein Budget im Auge. Plane deine Route über die grünen Punkte also extrem clever, sonst bist du pleite, bevor du überhaupt dein erstes Ding gedreht hast.`,
            shortText: `Ziel: Erreiche die Kneipe '${targetPubName}'. (Achtung: Jeder Meter über die Knotenpunkte kostet Startkapital!)`,
            logId: 'goal-visit-pub'
        };
    }

    static getInvestmentDialog() {
        const options = [
            { 
                type: 'residential', 
                event: EVENTS.SELECT_CATEGORY_RESIDENTIAL,
                title: 'Wohnungen', 
                subtitle: '(Residential Assets)',
                desc: `Der Blue-Chip. Bullen-Quote: ca. ${CONFIG.RISK_FACTORS.ABORT_RESIDENTIAL}%. Dividende: Ø ${CONFIG.REWARDS.BURGLARY_EASY}€. Sicher und profitabel.`,
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>'
            },
            { 
                type: 'commercial', 
                event: EVENTS.SELECT_CATEGORY_COMMERCIAL,
                title: 'Gewerbe', 
                subtitle: '(High-Risk Derivate)',
                desc: `Lager und Büros. Extrem heiß! Alarmanlagen treiben die Bullen-Quote auf ${CONFIG.RISK_FACTORS.ABORT_COMMERCIAL}%. Payoff: Bis zu ${CONFIG.REWARDS.BURGLARY_MEDIUM}€. Nur für starke Nerven.`,
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>'
            },
            { 
                type: 'public', 
                event: EVENTS.SELECT_CATEGORY_PUBLIC,
                title: 'Behörden', 
                subtitle: '(Public Bonds)',
                desc: `Schulen und Ämter. Risiko bei ca. ${CONFIG.RISK_FACTORS.ABORT_PUBLIC}%. Beute unberechenbar. Ein volatiler Markt.`,
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>'
            },
            { 
                type: 'allotments', 
                event: EVENTS.SELECT_CATEGORY_ALLOTMENTS,
                title: 'Schrebergärten', 
                subtitle: '(Penny Stocks)',
                desc: `Lauben und Schuppen. Bullen-Quote ca. ${CONFIG.RISK_FACTORS.ABORT_ALLOTMENTS}%. Rendite mau, aber dafür quasi stressfrei.`,
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M17 15.58V21H7v-5.42L12 13l5 2.58zM12 3L4 9v1h16V9l-8-6zM5 11v2h14v-2H5z"/></svg>'
            }
        ];

        return {
            title: 'Crime Consultant',
            isWide: true,
            body: `<p style="margin-bottom: 20px;"><i>"Setz dich. Ich bin dein Crime Consultant. Jedes Gebäude hier ist ein Investmentfonds mit eigenem Risiko-Rendite-Profil. Schauen wir uns die Marktwerte an..."</i></p>`,
            buttons: [
                ...options.map(opt => ({
                    text: `
                        <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
                            <div class="investment-icon" style="color:var(--color-primary);">${opt.icon}</div>
                            <strong style="font-size:1.1rem; color:var(--color-primary);">${opt.title}</strong>
                            <span style="font-size:0.8rem; opacity:0.7; margin-bottom:8px;">${opt.subtitle}</span>
                            <small style="font-size:0.85rem; line-height:1.4;">${opt.desc}</small>
                        </div>
                    `,
                    event: opt.event,
                    className: 'btn-investment'
                })),
                { text: 'Portfolio schließen', event: EVENTS.INVESTMENT_CANCELLED, className: 'btn-secondary' }
            ]
        };
    }

    static getScoutingReportDialog(riskData) {
        return {
            title: 'Scouting-Report',
            body: `
                <div class="scouting-report" style="line-height: 1.6;">
                    <p style="margin-bottom: 8px;"><strong>Ziel:</strong> ${riskData.label}</p>
                    <p style="margin-bottom: 16px;"><strong>Erwartete Beute:</strong> ${riskData.minLoot.toLocaleString()} € - ${riskData.maxLoot.toLocaleString()} €</p>
                    <div style="border-top: 1px solid rgba(0,0,0,0.1); padding-top: 12px; margin-bottom: 12px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Basis-Risiko:</span>
                            <span>${riskData.baseRisk}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Mechanischer Widerstand (Abbruch):</span>
                            <span>${riskData.abortRate}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Polizeipräsenz (${riskData.nearbyCount} Wache${riskData.nearbyCount === 1 ? '' : 'n'} nah):</span>
                            <span style="color: var(--color-danger);">+ ${riskData.proximityRisk}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Interferenz-Warnung:</span>
                            <span style="color: var(--color-danger);">+ ${riskData.interferenceRisk}%</span>
                        </div>
                    </div>
                    <div style="border-top: 2px solid var(--color-text); padding-top: 12px; display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem; color:var(--color-danger);">
                        <span>GESAMTRISIKO:</span>
                        <span>${riskData.totalRisk}%</span>
                    </div>
                </div>
            `
        };
    }

    static getPubDialog() {
        return {
            title: 'In der Kneipe',
            body: 'Ah, ein neues Gesicht in meiner Kaschemme. Was führt dich in diese Ecke der Stadt, Grünschnabel? Trinkst du was, oder willst du direkt zur Sache kommen? Lass dir eins gesagt sein: Hier in der Unterwelt gibt\'s keine Geschenke. Also, was für Geschäfte schweben dir vor?'
        };
    }

    static getEncounterDialog({ title = "Ereignis", text = "Etwas ist passiert.", cost = 0 } = {}) {
        return {
            title: title,
            body: `
                <div style="line-height: 1.6;">
                    <p style="margin-bottom: 20px;">${text}</p>
                    <div style="color: var(--color-danger); font-weight: bold; font-size: 1.2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                        Verlust: -${cost} €
                    </div>
                </div>
            `,
            shortText: `Ereignis: ${title} (-${cost} €)`,
            logId: 'last-encounter',
            nextEvent: EVENTS.RESUME_GAME
        };
    }

    static getLoanDialog() {
        return {
            title: 'Zweite Chance?',
            body: `
                <div style="line-height: 1.6;">
                    <p>"Du bist pleite. Die Verbrecher*innen-Innung bietet dir einen Überbrückungskredit an, damit du dein Ding weiter durchziehen kannst."</p>
                    <p style="color:var(--color-warning); font-weight:bold; margin-top:15px;">
                        ⚠️ WARNUNG: Jeder Schritt kostet ab jetzt ${CONFIG.LOAN.STEP_INTEREST} € Zinsen. Rückzahlung erfolgt automatisch beim nächsten Erfolg.
                    </p>
                    <p>Akzeptierst du den Pakt?</p>
                </div>
            `,
            buttons: [
                { text: 'Annehmen', event: EVENTS.ACCEPT_LOAN_OFFER, className: 'btn-danger' },
                { text: 'Ablehnen (Spiel beenden)', event: EVENTS.REJECT_LOAN, className: 'btn-secondary' }
            ]
        };
    }

    static getBarberTipDialog({ barber = null, barberName = "Friseur", cost = CONFIG.PRICES.BARBER_TIP || 50 } = {}) {
        return {
            title: 'Ein zwielichtiger Tipp',
            body: `Ich kenne da jemanden. Geh zu '<strong>${barberName}</strong>'. Lass dir die Haare färben, setz eine Brille auf. Wenn du nicht aussiehst wie ein typischer Einbrecher, fällst du weniger auf. Das halbiert dein Risiko und die Hausbesitzer schöpfen nicht so schnell Verdacht, was deine Abbruchquote drastisch senkt.`,
            buttons: [
                { 
                    text: `Einverstanden (${cost} €)`, 
                    event: EVENTS.BUY_BARBER_TICKET,
                    payload: { barber, barberName, cost }
                },
                { text: 'Ablehnen', event: EVENTS.RESUME_GAME }
            ]
        };
    }

    static getBoltCutterDialog({ cost = CONFIG.PRICES.BOLT_CUTTER } = {}) {
        import('./Utils.js').then(({ log }) => log('DEBUG_DIALOG_DATA', { cost }));
        return {
            title: 'Schweres Gerät',
            body: `Der Bolzenschneider ist das Schweizer Taschenmesser des kleinen Mannes. Damit knackst du Fahrradschlösser wie Zahnstocher. Der Typ am Tresen will ${cost} Euro dafür. Ein Schnäppchen, wenn man bedenkt, wie viel Zeit du sparst.`,
            buttons: [
                { 
                    text: `Kaufen (${cost} €)`, 
                    event: EVENTS.BUY_BOLT_CUTTER,
                    payload: { cost } 
                },
                { text: 'Vielleicht später', event: EVENTS.RESUME_GAME }
            ]
        };
    }
}
