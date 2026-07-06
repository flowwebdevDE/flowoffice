(function () {
  if (!window.FlowModules) return;

  window.FlowModules.register({
    id: 'tasks',
    title: 'Aufgaben',
    subtitle: 'Naechste Schritte, Wiedervorlagen und offene Punkte.',
    icon: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.2a1 1 0 01-1.412-.006L3.29 9.155a1 1 0 111.42-1.41l4.047 4.07 6.536-6.526a1 1 0 011.411 0z" clip-rule="evenodd"></path></svg>',
    type: 'crud',
    storageKey: 'tasks',
    layout: 'list',
    primaryField: 'title',
    descriptionField: 'notes',
    fields: [
      { key: 'title', label: 'Aufgabe', type: 'text', required: true, placeholder: 'z.B. Angebot nachfassen' },
      { key: 'client', label: 'Kunde / Projekt', type: 'text', placeholder: 'Optional' },
      { key: 'dueDate', label: 'Faellig am', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', default: 'Offen', options: ['Offen', 'Heute', 'Wartet', 'Erledigt'] },
      { key: 'notes', label: 'Notizen', type: 'textarea', full: true, placeholder: 'Kontext, Link, naechster Schritt ...' }
    ],
    columns: [
      { key: 'title', label: 'Aufgabe' },
      { key: 'client', label: 'Kunde' },
      { key: 'dueDate', label: 'Faellig', format: 'date' },
      { key: 'status', label: 'Status', badge: true }
    ],
    metrics: [
      { label: 'Offen', value: records => records.filter(item => item.status !== 'Erledigt').length },
      { label: 'Heute', value: records => records.filter(item => item.status === 'Heute').length },
      { label: 'Erledigt', value: records => records.filter(item => item.status === 'Erledigt').length }
    ]
  });

  window.FlowModules.register({
    id: 'services',
    title: 'Leistungen',
    subtitle: 'Wiederverwendbare Positionen, Preise und Einheiten.',
    icon: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H4z"></path><path fill-rule="evenodd" d="M18 8H2v7a2 2 0 002 2h12a2 2 0 002-2V8zM5 11a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 000 2h4a1 1 0 100-2H6z" clip-rule="evenodd"></path></svg>',
    type: 'crud',
    storageKey: 'services',
    layout: 'table',
    primaryField: 'name',
    descriptionField: 'description',
    fields: [
      { key: 'name', label: 'Leistung', type: 'text', required: true, placeholder: 'z.B. Strategie-Workshop' },
      { key: 'unit', label: 'Einheit', type: 'text', default: 'Std.', placeholder: 'Std., Stk., Tag' },
      { key: 'unitPrice', label: 'Preis netto', type: 'number', default: 0, step: '0.01' },
      { key: 'category', label: 'Kategorie', type: 'text', placeholder: 'Design, Entwicklung, Beratung ...' },
      { key: 'description', label: 'Beschreibung', type: 'textarea', full: true, placeholder: 'Standardtext fuer Angebote oder Rechnungen' }
    ],
    columns: [
      { key: 'name', label: 'Leistung' },
      { key: 'category', label: 'Kategorie' },
      { key: 'unit', label: 'Einheit' },
      { key: 'unitPrice', label: 'Preis', format: 'money', align: 'right' }
    ],
    metrics: [
      { label: 'Leistungen', value: records => records.length },
      { label: 'Kategorien', value: records => new Set(records.map(item => item.category).filter(Boolean)).size },
      { label: 'Ø Preis', value: (records, sandbox) => records.length ? sandbox.format.money(records.reduce((sum, item) => sum + Number(item.unitPrice || 0), 0) / records.length) : sandbox.format.money(0) }
    ]
  });

  window.FlowModules.register({
    id: 'automations',
    title: 'Automation',
    subtitle: 'Aktionen visuell als Bloecke verbinden und ausfuehren.',
    icon: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 3a3 3 0 100 6 3 3 0 000-6zM14 11a3 3 0 100 6 3 3 0 000-6z"></path><path d="M8.7 7.3a1 1 0 011.4 0l2.6 2.6a1 1 0 11-1.4 1.4L8.7 8.7a1 1 0 010-1.4z"></path></svg>',
    type: 'automation',
    core: true
  });
})();
