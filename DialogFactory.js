/**
 * DialogFactory - Erzeugt standardisierte Konfigurationsobjekte für den InteractionManager.
 * Trennt UI-Template-Logik von der Geschäftslogik.
 */
export class DialogFactory {
    static getBicycleDialogConfig(bike) {
        const dialogText = `
            <div style="line-height: 1.6;">
                <p>Du stehst vor einem abgestellten Fahrrad. Ein echtes "Erbstück" der Straße.</p>
                <div class="warning-box" style="margin: 15px 0; border: 1px solid var(--color-primary); padding: 10px; background: rgba(56, 189, 248, 0.1);">
                    <strong>Vorteil:</strong> Deine Reichweite erhöht sich massiv (Tiefe 2).<br>
                    <strong>Risiko:</strong> Jeder Tritt in die Pedale kostet dich 1 € Wartung.
                </div>
                <p>Willst du das Rad "ausleihen"?</p>
            </div>
        `;

        return {
            title: 'Fahrrad gefunden',
            body: dialogText,
            buttons: [
                { 
                    text: 'Ja, in die Pedale!', 
                    className: 'btn-primary', 
                    event: 'START_BICYCLE_THEFT_RNG', 
                    payload: { targetId: bike.id } 
                },
                { 
                    text: 'Nein, ich gehe lieber zu Fuß', 
                    className: 'btn-secondary', 
                    event: 'RESUME_GAME' 
                }
            ]
        };
    }

    static getBarberDialogConfig(barberName, price) {
        return {
            title: 'Friseursalon: ' + barberName,
            body: `
                <div style="line-height: 1.6;">
                    <p><i>"Setz dich, mein Freund. Ein neuer Haarschnitt, ein neues Gesicht. Die Bullen werden dich für einen ganz anderen halten..."</i></p>
                    <p style="margin-top: 10px; color: var(--color-primary); font-weight: bold;">Kosten: ${price} €</p>
                    <p style="font-size: 0.9rem; opacity: 0.8;">Effekt: Deine nächste kriminelle Handlung hat ein deutlich reduziertes Entdeckungsrisiko.</p>
                </div>
            `,
            buttons: [
                { 
                    text: `Umstyling kaufen (${price} €)`, 
                    className: 'btn-primary', 
                    event: 'BARBER_TRANSFORM_START', 
                    payload: { price } 
                },
                { 
                    text: 'Vielleicht später', 
                    className: 'btn-secondary', 
                    event: 'RESUME_GAME' 
                }
            ]
        };
    }

    static getBoltCutterDialog(cost) {
        return {
            title: 'Ein geschmeidiges Angebot',
            text: `"Hör zu, Freundchen. Für ${cost} Kröten überlasse ich dir diesen Bolzenschneider. Damit knackst du die Drahtesel an den Stellplätzen da draußen. Die Bullen juckt das kaum – nicht mal 10 Prozent Aufklärungsquote, ein absoluter Witz! Wenn du auf so einem Bock sitzt, machst du gleich zwei Blocks auf einmal. Du bist ein verdammter Geist auf zwei Rädern. Haben wir einen Deal?"`,
            buttons: [
                { text: `Einverstanden (${cost} €)`, event: 'BUY_BOLT_CUTTER', payload: { cost } },
                { text: 'Vielleicht später', event: 'RESUME_GAME' }
            ]
        };
    }

    static getNetworkErrorDialog() {
        return {
            title: 'Verbindungsfehler',
            text: "Die Satelliten-Verbindung zum städtischen Bauamt ist aktuell gestört (Server Timeout). Bitte versuche es in ein paar Sekunden noch einmal oder wähle eine andere Stadt.",
            buttons: [{ text: 'Zurück zum Hauptmenü', event: 'RELOAD_GAME' }]
        };
    }

    static getRadarTutorial(count) {
        return {
            title: "Auge des Gesetzes",
            fullText: `Wir haben in diesem Sektor ${count} Polizeistationen. Hör gut zu: Je näher du an einer Wache ein Ding drehst, desto extremer steigt dein Risiko, geschnappt zu werden.<br><br>Damit du nicht blind in die Falle läufst: Mit dem Hotkey 'P' kannst du alle 5 Minuten für 5 Sekunden die Standorte der Bullen aufdecken. Präg sie dir gut ein!`,
            shortText: "Polizeipräsenz aufgedeckt. Hotkey 'P' nutzt einen 5-Sekunden-Scan (Cooldown: 5 Min).",
            nextEvent: "START_POLICE_REVEAL"
        };
    }

    static getBurglaryAbort() {
        return {
            title: 'Abbruch!',
            text: "Die mechanischen Sicherungen waren zu stark. Du musstest abbrechen und fliehen!",
            buttons: [{ text: 'Verdammt', event: 'RESUME_GAME' }]
        };
    }

    static getBurglaryCaught(fine) {
        return {
            title: 'Erwischt!',
            text: `Die Polizei war schneller. Du musstest ${fine} € Strafe zahlen.`,
            buttons: [{ text: 'Verdammt', event: 'RESUME_GAME' }]
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
            buttons: [{ text: 'Hervorragend', event: 'RESUME_GAME' }]
        };
    }

    static getBicycleTheftSuccess() {
        return {
            title: 'Erfolg!',
            text: '<div style="text-align:center;"><div style="font-size: 3rem; margin-bottom: 1rem;">🚲</div><p>Rad geknackt! Du bist jetzt lautlos und schnell unterwegs.</p><p style="font-size: 0.9rem; opacity: 0.7; margin-top: 1rem;">(Drücke \'F\' zum Auf/Absteigen)</p></div>',
            buttons: [{ text: 'Hervorragend', event: 'BICYCLE_THEFT_SUCCESS_DONE' }]
        };
    }

    static getBicycleTheftFailure(fine) {
        return {
            title: 'Erwischt!',
            text: `Ein aufmerksamer Zeuge hat dich beim Knacken beobachtet! Die Polizei hat dich gestellt. Du musstest ${fine} € Strafe zahlen.`,
            buttons: [{ text: 'Verdammt', event: 'RESUME_GAME' }]
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
