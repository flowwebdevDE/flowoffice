# Eigene Module in FlowOffice

Neue Arbeitsbereiche werden in `custom-modules.js` registriert. Fuer einfache Listen und Tabellen brauchst du meistens nur eine Konfiguration:

```js
window.FlowModules.register({
  id: 'projects',
  title: 'Projekte',
  subtitle: 'Projektuebersicht und naechste Schritte.',
  type: 'crud',
  storageKey: 'projects',
  layout: 'table',
  primaryField: 'name',
  descriptionField: 'notes',
  fields: [
    { key: 'name', label: 'Projekt', type: 'text', required: true },
    { key: 'client', label: 'Kunde', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', default: 'Aktiv', options: ['Aktiv', 'Wartet', 'Fertig'] },
    { key: 'notes', label: 'Notizen', type: 'textarea', full: true }
  ],
  columns: [
    { key: 'name', label: 'Projekt' },
    { key: 'client', label: 'Kunde' },
    { key: 'status', label: 'Status', badge: true }
  ]
});
```

## Wichtige Sandbox-Helfer

- `window.FlowSandbox.storage.collection('projects')`: kleine CRUD-Collection in `localStorage`.
- `window.FlowSandbox.notify('Gespeichert')`: Toast anzeigen.
- `window.FlowSandbox.confirm(title, message)`: bestaetigten Dialog anzeigen.
- `window.FlowSandbox.format.money(value)`: Euro-Format.
- `window.FlowSandbox.ui.table(records, columns)`: HTML-Tabelle bauen.
- `window.FlowSandbox.ui.empty(text)`: leeren Zustand bauen.
- `window.FlowSandbox.downloadJSON(filename, data)`: JSON exportieren.

## Feldtypen

Unterstuetzt werden `text`, `number`, `date`, `select`, `textarea` und `checkbox`.

Eigenschaften pro Feld:

- `key`: technischer Name, klein und eindeutig.
- `label`: sichtbarer Name.
- `required`: Pflichtfeld.
- `default`: Standardwert.
- `placeholder`: Eingabehilfe.
- `full`: Feld ueber die volle Formularbreite.
- `options`: Auswahlwerte fuer `select`.

Die Daten bleiben lokal im Browser und werden automatisch in den FlowBook-Backup-Export aufgenommen.

## Leistungen im Editor verwenden

Eintraege aus dem Modul `Leistungen` erscheinen automatisch im Editor im Bereich `Positionen`.

Gespeichert werden mindestens:

- `name`: Positionsname.
- `unit`: Einheit.
- `unitPrice`: Nettopreis.
- `description`: optionale Detailbeschreibung.

Der Editor uebernimmt daraus Beschreibung, Detailtext, Einheit und Preis.

## Eigene Aktionsbloecke

Module oder eigene Dateien koennen neue Bloecke fuer den Automation-Builder registrieren:

```js
window.FlowActions.register({
  id: 'project.mark-hot',
  group: 'Projekte',
  label: 'Projekt priorisieren',
  description: 'Speichert eine kurze Prioritaetsnotiz.',
  fields: [
    { key: 'note', label: 'Notiz', type: 'text', default: 'Prioritaet hoch' }
  ],
  run(params, context) {
    context.sandbox.storage.collection('project-notes').save({
      note: params.note,
      status: 'Hot'
    });
    context.sandbox.notify('Prioritaet gespeichert');
  }
});
```

Diese Aktionen erscheinen automatisch im Bereich `Automation` und koennen dort mit anderen Bloecken verbunden werden.

## Code-Bausteine direkt in der App

Im Modul `Automation` gibt es den Bereich `Eigene Code-Bausteine`. Dort kannst du ohne Dateiwechsel eigene Actions anlegen.

Parameterfelder werden als JSON gepflegt:

```json
[
  { "key": "message", "label": "Text", "type": "text", "default": "Hallo" },
  { "key": "amount", "label": "Betrag", "type": "number", "default": 1 }
]
```

Im Code stehen diese Objekte bereit:

- `params`: Werte aus den Parameterfeldern.
- `context`: Ausloeser, Workflow und Block.
- `sandbox`: Storage, UI, Formatierung, Automation.
- `app`: direkte App-Helfer wie `addItem`, `addServiceToDocument`, `currentDocument`, `switchView`, `getServices`.

Beispiel:

```js
app.addItem({
  description: params.message,
  qty: 1,
  unit: 'Stk.',
  unitPrice: Number(params.amount || 0)
});
sandbox.notify('Position aus eigenem Code eingefuegt');
```
