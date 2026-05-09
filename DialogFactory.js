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
}
