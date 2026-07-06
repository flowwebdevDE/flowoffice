// HINWEIS: Dies ist kein sicherer Login. Das Passwort kann im Code eingesehen werden.
    const MASTER_PASSWORD = 'flow'; // Ändere dieses Passwort für einen einfachen Schutz.
    const APP_VERSION = '2.4';
    const BACKUP_SCHEMA_VERSION = 4;

    const STORAGE_KEYS = {
      settings: 'flowOffice.settings',
      documents: 'flowOffice.documents',
      clients: 'flowOffice.clients',
      modulePrefix: 'flowOffice.module.',
      automations: 'flowOffice.automations',
      moduleVisibility: 'flowOffice.moduleVisibility',
      codeActions: 'flowOffice.codeActions'
    };

    const state = {
      currentId: null,
      items: [],
      logoDataUrl: null,
      knownClients: new Map(), // Cache für Autocomplete
      autoLinkClientAfterSave: false,
      documentFilters: {
        status: 'all',
        type: 'all'
      },
      moduleRuntime: {},
      automationRuntime: {
        selectedId: null,
        selectedCodeActionId: null
      },
      runningAutomation: false
    };

    const DOC_STATUS_FLOW = ['Entwurf', 'In Arbeit', 'Versendet', 'Bezahlt', 'Storniert'];
    const AUTOMATION_TRIGGERS = [
      { value: 'manual', label: 'Manuell starten' },
      { value: 'app.start', label: 'Beim App-Start' },
      { value: 'view.opened', label: 'Wenn eine Ansicht geoeffnet wird' },
      { value: 'document.saved', label: 'Wenn ein Dokument gespeichert wird' },
      { value: 'document.statusChanged', label: 'Wenn ein Dokumentstatus geaendert wird' },
      { value: 'module.recordSaved', label: 'Wenn ein Moduleintrag gespeichert wird' }
    ];

    const el = id => document.getElementById(id);
    const money = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
    const escapeHtml = str => String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s]));
    const nl2br = str => escapeHtml(str).replace(/\n/g, '<br>');

    function formatDateDE(isoDate) {
      if (!isoDate) return '-';
      const [year, month, day] = isoDate.split('-');
      return (day && month && year) ? `${day}.${month}.${year}` : isoDate;
    }

    function todayISO() {
      const d = new Date();
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d - tzOffset).toISOString().slice(0, 10);
    }

    function plusDaysFromISO(baseDate, days) {
      const d = baseDate ? new Date(`${baseDate}T00:00:00`) : new Date();
      d.setDate(d.getDate() + days);
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d - tzOffset).toISOString().slice(0, 10);
    }
    
    const DOCTYPE_DEFAULTS = {
      'Angebot': {
        intro: 'Vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen folgende Leistungen an:',
        footer: 'Wir freuen uns auf die Zusammenarbeit. Das Angebot ist 14 Tage gültig.',
        dateLabel: 'Gültig bis',
        recipientLabel: 'Empfänger'
      },
      'Rechnung': {
        intro: 'Vielen Dank für Ihren Auftrag. Hiermit stellen wir Ihnen folgende Leistungen in Rechnung:',
        footer: 'Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das unten angegebene Konto.',
        dateLabel: 'Fällig bis',
        recipientLabel: 'Rechnung an'
      },
      'Auftragsbestätigung': {
        intro: 'Gerne bestätigen wir hiermit Ihren Auftrag zu folgenden Konditionen:',
        footer: 'Wir bedanken uns für das Vertrauen und beginnen umgehend mit der Umsetzung.',
        dateLabel: 'Lieferung bis',
        recipientLabel: 'Empfänger'
      }
    };

    // Theme Logic
    function initTheme() {
      const theme = localStorage.getItem('flowOffice.theme') || 'light';
      document.documentElement.setAttribute('data-theme', theme);
    }
    
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('flowOffice.theme', next);
    }

    function togglePreviewModal(show) {
      const modal = el('previewModal');
      if (!modal) return;
      if (show) {
        renderPreview();
        modal.classList.add('open');
        // Fit paper after modal is visible
        requestAnimationFrame(fitPaper);
      } else {
        modal.classList.remove('open');
      }
    }

    function toggleClientModal(show) {
      const modal = el('clientModal');
      if (!modal) return;
      if (show) {
        modal.classList.add('open');
      } else {
        modal.classList.remove('open');
        el('clientId').value = ''; // Reset ID
        state.autoLinkClientAfterSave = false;
      }
    }

    function showDialog({ title, message, buttons }) {
      return new Promise(resolve => {
        const overlay = el('dialogOverlay');
        el('dialogTitle').textContent = title;
        el('dialogMessage').textContent = message;
        const actionsContainer = el('dialogActions');
        actionsContainer.innerHTML = '';

        buttons.forEach(buttonInfo => {
          const button = document.createElement('button');
          button.textContent = buttonInfo.text;
          button.className = `btn ${buttonInfo.class || ''}`;
          button.onclick = () => {
            overlay.classList.remove('open');
            resolve(buttonInfo.value);
          };
          actionsContainer.appendChild(button);
        });

        overlay.classList.add('open');
      });
    }

    async function customAlert(title, message = '') {
      return showDialog({ title, message, buttons: [
        { text: 'OK', class: 'primary', value: true }
      ]});
    }

    async function customConfirm(title, message = '') {
      return showDialog({ title, message, buttons: [
        { text: 'Abbrechen', class: '', value: false },
        { text: 'Bestätigen', class: 'primary', value: true }
      ]});
    }

    function showToast(message) {
      const container = el('toastContainer');
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s forwards ease-in';
        toast.addEventListener('animationend', () => toast.remove());
      }, 3000);
    }

    function plusDaysISO(days) {
      return plusDaysFromISO(todayISO(), days);
    }

    function handleGlobalSearch() {
        const term = el('globalSearchInput').value.toLowerCase();
        const currentView = document.querySelector('.nav button.active').dataset.view;

        if (currentView === 'documents') {
            renderDocuments(term);
        } else if (currentView === 'clients') {
            renderClients(term);
        } else if (currentView.startsWith('module:')) {
            const moduleConfig = getModuleByView(currentView);
            if (moduleConfig) renderModuleView(moduleConfig, term);
        } else {
            // If on another page, switch to documents and search
            switchView('documents', term);
        }
    }

    function readJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (error) {
        console.warn(`Konnte ${key} nicht lesen:`, error);
        return fallback;
      }
    }

    function writeJSON(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    function getRegisteredModules() {
      return window.FlowModules?.all?.() || [];
    }

    function moduleViewName(moduleConfig) {
      return `module:${moduleConfig.id}`;
    }

    function moduleSectionId(moduleConfig) {
      return `moduleView-${moduleConfig.id}`;
    }

    function getModuleByView(view) {
      const moduleId = view.startsWith('module:') ? view.slice(7) : view;
      return getRegisteredModules().find(moduleConfig => moduleConfig.id === moduleId) || null;
    }

    function formatBytes(bytes) {
      if (!bytes) return '0 KB';
      const units = ['B', 'KB', 'MB', 'GB'];
      let value = bytes;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function estimateFlowStorageBytes() {
      return Object.keys(localStorage)
        .filter(key => key.startsWith('flowOffice.'))
        .reduce((total, key) => total + key.length + (localStorage.getItem(key) || '').length, 0);
    }

    function refreshSettingsOverview() {
      const docs = getDocuments();
      const clients = getClients();
      const modules = getRegisteredModules();
      const visibleModules = modules.filter(isModuleVisible);
      const automations = getAutomations();
      const codeActions = getCodeActions();
      const storageBytes = estimateFlowStorageBytes();
      const storagePercent = Math.min(100, Math.max(4, Math.round((storageBytes / (1024 * 1024 * 5)) * 100)));

      const values = {
        settingsVersion: APP_VERSION,
        settingsVersionInline: APP_VERSION,
        settingsDocCount: docs.length,
        settingsClientCount: clients.length,
        settingsModuleCount: visibleModules.length,
        settingsAutomationCount: automations.length,
        settingsRegisteredModules: modules.length,
        settingsCodeActionCount: codeActions.length,
        settingsStorageSize: formatBytes(storageBytes)
      };

      Object.entries(values).forEach(([id, value]) => {
        const target = el(id);
        if (target) target.textContent = value;
      });

      const storageBar = el('settingsStorageBar');
      if (storageBar) storageBar.style.width = `${storagePercent}%`;
    }

    function getModuleRuntime(moduleId) {
      if (!state.moduleRuntime[moduleId]) {
        state.moduleRuntime[moduleId] = { editId: null, layout: null };
      }
      return state.moduleRuntime[moduleId];
    }

    function getModuleStorageKey(moduleConfigOrName) {
      const name = typeof moduleConfigOrName === 'string'
        ? moduleConfigOrName
        : (moduleConfigOrName.storageKey || moduleConfigOrName.id);
      return `${STORAGE_KEYS.modulePrefix}${name}`;
    }

    function getModuleRecords(moduleConfig) {
      return readJSON(getModuleStorageKey(moduleConfig), []);
    }

    function setModuleRecords(moduleConfig, records) {
      writeJSON(getModuleStorageKey(moduleConfig), records);
    }

    function fieldOptionValue(option) {
      return typeof option === 'object' ? option.value : option;
    }

    function fieldOptionLabel(option) {
      return typeof option === 'object' ? option.label : option;
    }

    function defaultFieldValue(field) {
      if (field.default !== undefined) return field.default;
      if (field.type === 'number') return 0;
      if (field.type === 'checkbox') return false;
      return '';
    }

    function normalizeCrudRecord(moduleConfig, record = {}) {
      const normalized = { ...record };
      (moduleConfig.fields || []).forEach(field => {
        if (normalized[field.key] === undefined) normalized[field.key] = defaultFieldValue(field);
      });
      return normalized;
    }

    function matchesSearch(record, term) {
      if (!term) return true;
      return Object.values(record).some(value => String(value || '').toLowerCase().includes(term));
    }

    function formatModuleValue(value, column = {}) {
      if (column.format === 'money') return money(value);
      if (column.format === 'date') return value ? formatDateDE(value) : '-';
      if (column.format === 'number') return Number(value || 0).toLocaleString('de-DE');
      return escapeHtml(value === undefined || value === null || value === '' ? '-' : value);
    }

    function renderStatusBadge(value) {
      const label = escapeHtml(value || '-');
      const className = `status-${String(value || '').replace(/\s+/g, '.')}`;
      return `<span class="status-badge ${className}">${label}</span>`;
    }

    function renderModuleMetrics(moduleConfig, records) {
      const metrics = moduleConfig.metrics || [];
      if (!metrics.length) return '';
      const sandbox = window.FlowSandbox || createFlowSandbox();
      return `
        <div class="stats-grid module-stats">
          ${metrics.map(metric => {
            const value = typeof metric.value === 'function' ? metric.value(records, sandbox) : metric.value;
            return `
              <div class="stat-card">
                <div class="stat-label">${escapeHtml(metric.label)}</div>
                <div class="stat-value">${escapeHtml(value)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function renderCrudForm(moduleConfig, editingRecord) {
      const values = normalizeCrudRecord(moduleConfig, editingRecord);
      const fields = moduleConfig.fields || [];
      return `
        <form class="module-form form-grid" data-module-form="${moduleConfig.id}">
          ${fields.map(field => {
            const value = values[field.key] ?? defaultFieldValue(field);
            const required = field.required ? 'required' : '';
            const full = field.full || field.type === 'textarea' ? ' full' : '';
            const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
            const step = field.step ? ` step="${escapeHtml(field.step)}"` : '';

            if (field.type === 'textarea') {
              return `
                <div class="field${full}">
                  <label for="${moduleConfig.id}-${field.key}">${escapeHtml(field.label)}</label>
                  <textarea id="${moduleConfig.id}-${field.key}" name="${field.key}" ${required}${placeholder}>${escapeHtml(value)}</textarea>
                </div>
              `;
            }

            if (field.type === 'select') {
              return `
                <div class="field${full}">
                  <label for="${moduleConfig.id}-${field.key}">${escapeHtml(field.label)}</label>
                  <select id="${moduleConfig.id}-${field.key}" name="${field.key}" ${required}>
                    ${(field.options || []).map(option => {
                      const optionValue = fieldOptionValue(option);
                      const selected = String(optionValue) === String(value) ? 'selected' : '';
                      return `<option value="${escapeHtml(optionValue)}" ${selected}>${escapeHtml(fieldOptionLabel(option))}</option>`;
                    }).join('')}
                  </select>
                </div>
              `;
            }

            if (field.type === 'checkbox') {
              const checked = value ? 'checked' : '';
              return `
                <div class="field checkbox-field${full}">
                  <label for="${moduleConfig.id}-${field.key}">
                    <input id="${moduleConfig.id}-${field.key}" name="${field.key}" type="checkbox" ${checked}>
                    ${escapeHtml(field.label)}
                  </label>
                </div>
              `;
            }

            return `
              <div class="field${full}">
                <label for="${moduleConfig.id}-${field.key}">${escapeHtml(field.label)}</label>
                <input id="${moduleConfig.id}-${field.key}" name="${field.key}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${required}${placeholder}${step}>
              </div>
            `;
          }).join('')}
          <div class="field full module-form-actions">
            <button class="btn primary" type="submit">${editingRecord ? 'Aenderungen speichern' : 'Speichern'}</button>
            <button class="btn" type="button" data-module-action="new">Leeren</button>
          </div>
        </form>
      `;
    }

    function renderDataTableHTML(records, columns, options = {}) {
      if (!records.length) {
        return `<div class="empty-state"><p>${escapeHtml(options.emptyText || 'Noch keine Eintraege vorhanden.')}</p></div>`;
      }

      return `
        <div class="module-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                ${columns.map(column => `<th class="${column.align === 'right' ? 'align-right' : ''}">${escapeHtml(column.label)}</th>`).join('')}
                ${options.actions === false ? '' : '<th class="data-table-actions">Aktionen</th>'}
              </tr>
            </thead>
            <tbody>
              ${records.map(record => `
                <tr>
                  ${columns.map(column => `
                    <td class="${column.align === 'right' ? 'align-right' : ''}">
                      ${column.badge ? renderStatusBadge(record[column.key]) : formatModuleValue(record[column.key], column)}
                    </td>
                  `).join('')}
                  ${options.actions === false ? '' : `
                    <td class="data-table-actions">
                      <button class="btn" type="button" data-module-action="edit" data-record-id="${record.id}">Bearbeiten</button>
                      <button class="btn danger" type="button" data-module-action="delete" data-record-id="${record.id}">Loeschen</button>
                    </td>
                  `}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderDataListHTML(records, moduleConfig) {
      if (!records.length) {
        return `<div class="empty-state"><p>Noch keine Eintraege vorhanden. Lege oben den ersten Eintrag an.</p></div>`;
      }

      const primary = moduleConfig.primaryField || (moduleConfig.fields?.[0]?.key || 'title');
      const description = moduleConfig.descriptionField;
      const metaColumns = (moduleConfig.columns || []).filter(column => column.key !== primary).slice(0, 3);

      return `
        <div class="doc-list module-list">
          ${records.map(record => `
            <div class="doc-card module-record-card">
              <div class="doc-card-head">
                <div>
                  <strong style="color:var(--p-text)">${escapeHtml(record[primary] || 'Ohne Titel')}</strong>
                  <div class="doc-meta">
                    ${metaColumns.map(column => {
                      const content = column.badge ? renderStatusBadge(record[column.key]) : formatModuleValue(record[column.key], column);
                      return `<span>${content}</span>`;
                    }).join('')}
                  </div>
                </div>
                <div class="doc-actions">
                  <button class="btn" type="button" data-module-action="edit" data-record-id="${record.id}">Bearbeiten</button>
                  <button class="btn danger" type="button" data-module-action="delete" data-record-id="${record.id}">Loeschen</button>
                </div>
              </div>
              ${description && record[description] ? `<p class="module-card-description">${nl2br(record[description])}</p>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    function renderCrudModule(container, moduleConfig, searchTerm = '') {
      const runtime = getModuleRuntime(moduleConfig.id);
      const records = getModuleRecords(moduleConfig);
      const editingRecord = runtime.editId ? records.find(record => record.id === runtime.editId) : null;
      const filteredRecords = records
        .filter(record => matchesSearch(record, searchTerm))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      const layout = runtime.layout || moduleConfig.layout || 'list';
      const columns = moduleConfig.columns || (moduleConfig.fields || []).map(field => ({ key: field.key, label: field.label }));
      const title = editingRecord ? `${moduleConfig.title} bearbeiten` : `${moduleConfig.title} anlegen`;

      container.innerHTML = `
        ${renderModuleMetrics(moduleConfig, records)}
        <div class="module-shell">
          <div class="panel">
            <div class="panel-header">
              <h3>${escapeHtml(title)}</h3>
              <button class="btn" type="button" data-module-action="new">Neu</button>
            </div>
            <div class="panel-body">
              ${renderCrudForm(moduleConfig, editingRecord)}
            </div>
          </div>

          <div class="panel">
            <div class="panel-header module-result-header">
              <div>
                <h3>${escapeHtml(moduleConfig.title)} (${filteredRecords.length})</h3>
              </div>
              <div class="module-toolbar compact">
                <div class="segmented-control">
                  <button type="button" class="${layout === 'list' ? 'active' : ''}" data-module-action="layout" data-layout="list">Liste</button>
                  <button type="button" class="${layout === 'table' ? 'active' : ''}" data-module-action="layout" data-layout="table">Tabelle</button>
                </div>
                <button class="btn" type="button" data-module-action="export">Export</button>
              </div>
            </div>
            <div class="panel-body">
              ${layout === 'table'
                ? renderDataTableHTML(filteredRecords, columns)
                : renderDataListHTML(filteredRecords, moduleConfig)}
            </div>
          </div>
        </div>
      `;

      bindCrudModuleEvents(container, moduleConfig, searchTerm);
    }

    function gatherCrudForm(container, moduleConfig) {
      const form = container.querySelector(`[data-module-form="${moduleConfig.id}"]`);
      const values = {};
      (moduleConfig.fields || []).forEach(field => {
        const input = form.elements[field.key];
        if (!input) return;
        if (field.type === 'checkbox') values[field.key] = input.checked;
        else if (field.type === 'number') values[field.key] = Number(input.value || 0);
        else values[field.key] = input.value.trim();
      });
      return values;
    }

    function bindCrudModuleEvents(container, moduleConfig, searchTerm) {
      const form = container.querySelector(`[data-module-form="${moduleConfig.id}"]`);
      if (form) {
        form.onsubmit = event => {
          event.preventDefault();
          const runtime = getModuleRuntime(moduleConfig.id);
          const values = gatherCrudForm(container, moduleConfig);
          const missingField = (moduleConfig.fields || []).find(field => field.required && !values[field.key]);
          if (missingField) {
            showToast(`${missingField.label} fehlt`);
            return;
          }

          const records = getModuleRecords(moduleConfig);
          const now = new Date().toISOString();
          if (runtime.editId) {
            const index = records.findIndex(record => record.id === runtime.editId);
            if (index >= 0) records[index] = { ...records[index], ...values, updatedAt: now };
          } else {
            records.unshift({ id: crypto.randomUUID(), ...values, createdAt: now, updatedAt: now });
          }

          setModuleRecords(moduleConfig, records);
          runtime.editId = null;
          renderCrudModule(container, moduleConfig, searchTerm);
          if (moduleConfig.id === 'services') renderServicePicker();
          showToast('Eintrag gespeichert');
          runAutomationsForTrigger('module.recordSaved', { moduleId: moduleConfig.id, moduleConfig, values });
        };
      }

      container.onclick = async event => {
        const actionButton = event.target.closest('[data-module-action]');
        if (!actionButton) return;

        const runtime = getModuleRuntime(moduleConfig.id);
        const action = actionButton.dataset.moduleAction;
        const recordId = actionButton.dataset.recordId;

        if (action === 'new') {
          runtime.editId = null;
          renderCrudModule(container, moduleConfig, searchTerm);
        }

        if (action === 'layout') {
          runtime.layout = actionButton.dataset.layout || 'list';
          renderCrudModule(container, moduleConfig, searchTerm);
        }

        if (action === 'edit') {
          runtime.editId = recordId;
          renderCrudModule(container, moduleConfig, searchTerm);
        }

        if (action === 'delete') {
          const confirmed = await customConfirm('Eintrag loeschen?', 'Dieser Eintrag wird aus dem Modul entfernt.');
          if (!confirmed) return;
          setModuleRecords(moduleConfig, getModuleRecords(moduleConfig).filter(record => record.id !== recordId));
          if (runtime.editId === recordId) runtime.editId = null;
          renderCrudModule(container, moduleConfig, searchTerm);
          showToast('Eintrag geloescht');
        }

        if (action === 'export') {
          downloadJson(`${moduleConfig.id}-${todayISO()}.json`, getModuleRecords(moduleConfig));
        }
      };
    }

    function renderModuleView(moduleConfig, searchTerm = '') {
      const container = el(moduleSectionId(moduleConfig));
      if (!container) return;

      if (moduleConfig.type === 'crud') {
        renderCrudModule(container, moduleConfig, searchTerm);
        return;
      }

      if (moduleConfig.type === 'automation') {
        renderAutomationModule(container, searchTerm);
        return;
      }

      if (typeof moduleConfig.render === 'function') {
        moduleConfig.render(container, window.FlowSandbox || createFlowSandbox(), { searchTerm });
        if (typeof moduleConfig.onMount === 'function') {
          moduleConfig.onMount(container, window.FlowSandbox || createFlowSandbox(), { searchTerm });
        }
        return;
      }

      container.innerHTML = '<div class="empty-state"><p>Dieses Modul hat noch keinen Renderer.</p></div>';
    }

    function getModuleVisibility() {
      return readJSON(STORAGE_KEYS.moduleVisibility, {});
    }

    function isModuleVisible(moduleConfig) {
      if (moduleConfig.core) return true;
      const visibility = getModuleVisibility();
      return visibility[moduleConfig.id] !== false;
    }

    function setModuleVisible(moduleId, visible) {
      const visibility = getModuleVisibility();
      visibility[moduleId] = Boolean(visible);
      writeJSON(STORAGE_KEYS.moduleVisibility, visibility);
      applyModuleVisibility();
    }

    function applyModuleVisibility() {
      getRegisteredModules().forEach(moduleConfig => {
        const view = moduleViewName(moduleConfig);
        const navButton = document.querySelector(`.nav button[data-view="${view}"]`);
        if (navButton) navButton.classList.toggle('hidden', !isModuleVisible(moduleConfig));
      });
    }

    function initExtensionModules() {
      const nav = document.querySelector('.nav');
      const main = document.querySelector('.main');
      if (!nav || !main) return;

      getRegisteredModules().forEach(moduleConfig => {
        const view = moduleViewName(moduleConfig);
        if (!nav.querySelector(`[data-view="${view}"]`)) {
          const button = document.createElement('button');
          button.dataset.view = view;
          button.innerHTML = `${moduleConfig.icon || '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h3a1 1 0 100-2H7z"></path></svg>'}${escapeHtml(moduleConfig.title)}`;
          nav.appendChild(button);
        }

        if (!el(moduleSectionId(moduleConfig))) {
          const section = document.createElement('section');
          section.id = moduleSectionId(moduleConfig);
          section.className = 'hidden module-view';
          section.dataset.moduleView = view;
          main.appendChild(section);
        }
      });
      applyModuleVisibility();
    }

    function getAllModuleBackupData() {
      const data = {};
      Object.keys(localStorage)
        .filter(key => key.startsWith(STORAGE_KEYS.modulePrefix))
        .forEach(key => {
          data[key.replace(STORAGE_KEYS.modulePrefix, '')] = readJSON(key, []);
        });
      return data;
    }

    function restoreModuleBackupData(modules = {}) {
      Object.entries(modules).forEach(([name, records]) => {
        if (Array.isArray(records)) writeJSON(getModuleStorageKey(name), records);
      });
    }

    function clearModuleStorage() {
      Object.keys(localStorage)
        .filter(key => key.startsWith(STORAGE_KEYS.modulePrefix))
        .forEach(key => localStorage.removeItem(key));
    }

    function getAvailableViewOptions() {
      const baseViews = [
        { value: 'editor', label: 'Editor' },
        { value: 'documents', label: 'Dokumente' },
        { value: 'clients', label: 'Kunden' },
        { value: 'settings', label: 'Firmendaten' }
      ];

      return baseViews.concat(getRegisteredModules().map(moduleConfig => ({
        value: moduleViewName(moduleConfig),
        label: moduleConfig.title
      })));
    }

    function getDocumentFieldOptions() {
      return [
        { value: 'docType', label: 'Dokumenttyp' },
        { value: 'docStatus', label: 'Status' },
        { value: 'docNumber', label: 'Nummer' },
        { value: 'docDate', label: 'Dokumentdatum' },
        { value: 'dueDate', label: 'Faellig bis' },
        { value: 'clientName', label: 'Kundenname' },
        { value: 'clientAddress', label: 'Kundenanschrift' },
        { value: 'projectTitle', label: 'Betreff / Projekt' },
        { value: 'introText', label: 'Einleitungstext' },
        { value: 'extraNotes', label: 'Anmerkungen' },
        { value: 'footerText', label: 'Fusstext' },
        { value: 'taxRate', label: 'Steuersatz' },
        { value: 'discount', label: 'Globaler Rabatt' },
        { value: 'discountReason', label: 'Rabattgrund' },
        { value: 'showTax', label: 'Steuer ausweisen' }
      ];
    }

    function getServiceRecords() {
      return readJSON(getModuleStorageKey('services'), []);
    }

    function getServiceOptions() {
      return getServiceRecords().map(service => ({
        value: service.id,
        label: `${service.name || 'Leistung'} · ${money(service.unitPrice || 0)}`
      }));
    }

    function serviceToItem(service, overrides = {}) {
      return {
        description: service.name || 'Leistung',
        details: service.description || '',
        qty: Number(overrides.qty ?? 1),
        unit: service.unit || 'Stk.',
        unitPrice: Number(service.unitPrice || 0),
        discount: 0,
        discountType: 'percent'
      };
    }

    function addServiceToDocument(serviceId, overrides = {}) {
      const service = getServiceRecords().find(item => item.id === serviceId);
      if (!service) {
        showToast('Leistung nicht gefunden');
        return false;
      }

      addItem(serviceToItem(service, overrides));
      showToast('Leistung eingefuegt');
      return true;
    }

    function renderServicePicker() {
      const picker = el('servicePicker');
      if (!picker) return;

      const selected = picker.value;
      const services = getServiceRecords();
      picker.innerHTML = `
        <option value="">Leistung auswählen</option>
        ${services.map(service => `
          <option value="${escapeHtml(service.id)}">${escapeHtml(service.name || 'Leistung')} · ${money(service.unitPrice || 0)}</option>
        `).join('')}
      `;
      if (services.some(service => service.id === selected)) picker.value = selected;
    }

    function getCodeActions() {
      return readJSON(STORAGE_KEYS.codeActions, []).map(normalizeCodeAction);
    }

    function setCodeActions(actions) {
      writeJSON(STORAGE_KEYS.codeActions, actions.map(normalizeCodeAction));
    }

    function normalizeCodeAction(action = {}) {
      return {
        id: action.id || `custom.${crypto.randomUUID().slice(0, 8)}`,
        label: action.label || 'Eigener Block',
        group: action.group || 'Eigener Code',
        description: action.description || 'Benutzerdefinierter Aktionsblock.',
        fields: Array.isArray(action.fields) ? action.fields : [],
        code: action.code || "sandbox.notify('Eigener Block ausgefuehrt');",
        createdAt: action.createdAt || new Date().toISOString(),
        updatedAt: action.updatedAt || new Date().toISOString()
      };
    }

    function createCodeAction() {
      const now = new Date().toISOString();
      return {
        id: `custom.${crypto.randomUUID().slice(0, 8)}`,
        label: 'Eigener Block',
        group: 'Eigener Code',
        description: 'Benutzerdefinierter Aktionsblock.',
        fields: [
          { key: 'message', label: 'Text', type: 'text', default: 'Hallo FlowOffice' }
        ],
        code: "sandbox.notify(params.message || 'Eigener Block ausgefuehrt');",
        createdAt: now,
        updatedAt: now
      };
    }

    function saveCodeAction(action) {
      let actions = getCodeActions();
      const normalized = normalizeCodeAction({ ...action, updatedAt: new Date().toISOString() });
      if (action.originalId && action.originalId !== normalized.id) {
        actions = actions.filter(item => item.id !== action.originalId);
      }
      const index = actions.findIndex(item => item.id === normalized.id);
      if (index >= 0) actions[index] = normalized;
      else actions.unshift(normalized);
      setCodeActions(actions);
      return normalized;
    }

    function deleteCodeAction(actionId) {
      setCodeActions(getCodeActions().filter(action => action.id !== actionId));
      if (state.automationRuntime.selectedCodeActionId === actionId) {
        state.automationRuntime.selectedCodeActionId = null;
      }
    }

    function getSelectedCodeAction() {
      const actions = getCodeActions();
      if (!actions.length) return null;
      let selected = actions.find(action => action.id === state.automationRuntime.selectedCodeActionId);
      if (!selected) {
        selected = actions[0];
        state.automationRuntime.selectedCodeActionId = selected.id;
      }
      return selected;
    }

    function getAppApiForCodeActions() {
      return {
        addItem,
        addServiceToDocument,
        currentDocument: gatherDocument,
        switchView,
        renderPreview,
        getDocuments,
        setDocuments,
        getClients,
        setClients,
        getServices: getServiceRecords
      };
    }

    function getCodeActionDefinitions() {
      return getCodeActions().map(action => ({
        id: action.id,
        group: action.group || 'Eigener Code',
        label: action.label,
        description: action.description,
        fields: action.fields || [],
        run: (params, context = {}) => {
          const sandbox = context.sandbox || window.FlowSandbox || createFlowSandbox();
          const app = getAppApiForCodeActions();
          const fn = new Function('params', 'context', 'sandbox', 'app', action.code);
          return fn(params || {}, context, sandbox, app);
        }
      }));
    }

    function setAppFieldValue(fieldId, value) {
      const input = el(fieldId);
      if (!input) return false;

      if (input.type === 'checkbox') {
        input.checked = value === true || value === 'true' || value === '1' || value === 'ja';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      input.value = value ?? '';
      const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
      input.dispatchEvent(new Event(eventName, { bubbles: true }));
      return true;
    }

    function getBuiltInFlowActions() {
      return [
        {
          id: 'ui.toast',
          group: 'Oberflaeche',
          label: 'Meldung anzeigen',
          description: 'Zeigt unten eine kurze Nachricht.',
          fields: [
            { key: 'message', label: 'Text', type: 'text', default: 'Automation ausgefuehrt' }
          ],
          run: params => showToast(params.message || 'Automation ausgefuehrt')
        },
        {
          id: 'ui.switchView',
          group: 'Oberflaeche',
          label: 'Ansicht oeffnen',
          description: 'Wechselt zu einer App-Ansicht oder Erweiterung.',
          fields: [
            { key: 'view', label: 'Ansicht', type: 'select', default: 'editor', options: getAvailableViewOptions }
          ],
          run: params => switchView(params.view || 'editor')
        },
        {
          id: 'ui.toggleTheme',
          group: 'Oberflaeche',
          label: 'Design wechseln',
          description: 'Schaltet hell/dunkel um.',
          fields: [],
          run: () => toggleTheme()
        },
        {
          id: 'doc.setField',
          group: 'Dokument',
          label: 'Dokumentfeld setzen',
          description: 'Setzt ein freigegebenes Feld im Editor.',
          fields: [
            { key: 'field', label: 'Feld', type: 'select', default: 'projectTitle', options: getDocumentFieldOptions },
            { key: 'value', label: 'Wert', type: 'text', default: '' }
          ],
          run: params => {
            if (!setAppFieldValue(params.field, params.value)) showToast('Feld nicht gefunden');
          }
        },
        {
          id: 'doc.setStatus',
          group: 'Dokument',
          label: 'Status setzen',
          description: 'Setzt den aktuellen Dokumentstatus.',
          fields: [
            { key: 'status', label: 'Status', type: 'select', default: 'In Arbeit', options: DOC_STATUS_FLOW.map(status => ({ value: status, label: status === 'Bezahlt' ? 'Erledigt' : status })) }
          ],
          run: params => setAppFieldValue('docStatus', params.status || 'In Arbeit')
        },
        {
          id: 'doc.addItem',
          group: 'Dokument',
          label: 'Position hinzufuegen',
          description: 'Fuegt dem aktuellen Dokument eine neue Position hinzu.',
          fields: [
            { key: 'description', label: 'Beschreibung', type: 'text', default: 'Neue Leistung' },
            { key: 'qty', label: 'Menge', type: 'number', default: 1, step: '0.01' },
            { key: 'unit', label: 'Einheit', type: 'text', default: 'Stk.' },
            { key: 'unitPrice', label: 'Preis', type: 'number', default: 0, step: '0.01' }
          ],
          run: params => addItem({
            description: params.description,
            qty: Number(params.qty || 1),
            unit: params.unit || 'Stk.',
            unitPrice: Number(params.unitPrice || 0)
          })
        },
        {
          id: 'doc.addServiceItem',
          group: 'Dokument',
          label: 'Leistung aus Katalog einfuegen',
          description: 'Fuegt eine gespeicherte Leistung als Position ein.',
          fields: [
            { key: 'serviceId', label: 'Leistung', type: 'select', default: '', options: getServiceOptions },
            { key: 'qty', label: 'Menge', type: 'number', default: 1, step: '0.01' }
          ],
          run: params => addServiceToDocument(params.serviceId, { qty: params.qty })
        },
        {
          id: 'doc.save',
          group: 'Dokument',
          label: 'Dokument speichern',
          description: 'Speichert das aktuelle Dokument.',
          fields: [],
          run: () => saveDocument()
        },
        {
          id: 'doc.reset',
          group: 'Dokument',
          label: 'Neues Dokument starten',
          description: 'Setzt den Editor auf ein neues Dokument.',
          fields: [],
          run: () => resetEditor()
        },
        {
          id: 'preview.open',
          group: 'Dokument',
          label: 'Vorschau oeffnen',
          description: 'Oeffnet die Druckvorschau.',
          fields: [],
          run: () => togglePreviewModal(true)
        },
        {
          id: 'pdf.download',
          group: 'Dokument',
          label: 'PDF speichern',
          description: 'Erzeugt ein PDF aus der aktuellen Vorschau.',
          fields: [],
          run: () => downloadPDF()
        },
        {
          id: 'backup.download',
          group: 'Daten',
          label: 'Backup exportieren',
          description: 'Laedt ein JSON-Backup herunter.',
          fields: [],
          run: () => downloadBackup()
        },
        {
          id: 'client.openCreate',
          group: 'Kunden',
          label: 'Kundenformular oeffnen',
          description: 'Oeffnet den Dialog fuer einen neuen Kunden.',
          fields: [
            { key: 'name', label: 'Vorbelegter Name', type: 'text', default: '' }
          ],
          run: params => openClientModalForCreate(params.name || '')
        },
        {
          id: 'module.open',
          group: 'Erweiterungen',
          label: 'Erweiterung oeffnen',
          description: 'Wechselt zu einem registrierten Modul.',
          fields: [
            { key: 'moduleId', label: 'Modul', type: 'select', default: 'tasks', options: () => getRegisteredModules().map(moduleConfig => ({ value: moduleConfig.id, label: moduleConfig.title })) }
          ],
          run: params => {
            const moduleConfig = getRegisteredModules().find(module => module.id === params.moduleId);
            if (moduleConfig) switchView(moduleViewName(moduleConfig));
          }
        },
        {
          id: 'task.create',
          group: 'Erweiterungen',
          label: 'Aufgabe erstellen',
          description: 'Legt einen Eintrag im Aufgaben-Modul an.',
          fields: [
            { key: 'title', label: 'Aufgabe', type: 'text', default: 'Nachfassen' },
            { key: 'client', label: 'Kunde / Projekt', type: 'text', default: '' },
            { key: 'status', label: 'Status', type: 'select', default: 'Offen', options: ['Offen', 'Heute', 'Wartet', 'Erledigt'] },
            { key: 'notes', label: 'Notizen', type: 'textarea', default: '' }
          ],
          run: params => {
            const saved = window.FlowSandbox.storage.collection('tasks').save({
              title: params.title || 'Neue Aufgabe',
              client: params.client || el('clientName')?.value || '',
              dueDate: '',
              status: params.status || 'Offen',
              notes: params.notes || ''
            });
            showToast(`Aufgabe erstellt: ${saved.title}`);
          }
        },
        {
          id: 'service.create',
          group: 'Erweiterungen',
          label: 'Leistung speichern',
          description: 'Legt einen Eintrag im Leistungen-Modul an.',
          fields: [
            { key: 'name', label: 'Leistung', type: 'text', default: 'Neue Leistung' },
            { key: 'unit', label: 'Einheit', type: 'text', default: 'Stk.' },
            { key: 'unitPrice', label: 'Preis', type: 'number', default: 0, step: '0.01' },
            { key: 'category', label: 'Kategorie', type: 'text', default: '' }
          ],
          run: params => {
            window.FlowSandbox.storage.collection('services').save({
              name: params.name || 'Neue Leistung',
              unit: params.unit || 'Stk.',
              unitPrice: Number(params.unitPrice || 0),
              category: params.category || '',
              description: ''
            });
            showToast('Leistung gespeichert');
          }
        },
        {
          id: 'logic.requireStatus',
          group: 'Logik',
          label: 'Nur wenn Status ist',
          description: 'Stoppt die nachfolgenden Bloecke, wenn der Status nicht passt.',
          fields: [
            { key: 'status', label: 'Erlaubter Status', type: 'select', default: 'Versendet', options: DOC_STATUS_FLOW.map(status => ({ value: status, label: status === 'Bezahlt' ? 'Erledigt' : status })) }
          ],
          run: params => {
            const current = el('docStatus')?.value || '';
            if (current !== params.status) {
              showToast('Automation gestoppt: Status passt nicht');
              return false;
            }
            return true;
          }
        },
        {
          id: 'logic.requireView',
          group: 'Logik',
          label: 'Nur in Ansicht',
          description: 'Stoppt die nachfolgenden Bloecke, wenn eine andere Ansicht aktiv ist.',
          fields: [
            { key: 'view', label: 'Ansicht', type: 'select', default: 'editor', options: getAvailableViewOptions }
          ],
          run: params => {
            const activeView = document.querySelector('.nav button.active')?.dataset.view || 'editor';
            if (activeView !== params.view) {
              showToast('Automation gestoppt: Ansicht passt nicht');
              return false;
            }
            return true;
          }
        }
      ];
    }

    function getAutomationActionDefinitions() {
      const customActions = window.FlowActions?.all?.() || [];
      return getBuiltInFlowActions().concat(customActions, getCodeActionDefinitions());
    }

    function findAutomationAction(actionId) {
      return getAutomationActionDefinitions().find(action => action.id === actionId) || null;
    }

    function getAutomations() {
      return readJSON(STORAGE_KEYS.automations, []).map(normalizeAutomation);
    }

    function setAutomations(automations) {
      writeJSON(STORAGE_KEYS.automations, automations.map(normalizeAutomation));
    }

    function normalizeAutomation(workflow) {
      return {
        id: workflow.id || crypto.randomUUID(),
        name: workflow.name || 'Neue Automation',
        trigger: workflow.trigger || 'manual',
        enabled: workflow.enabled !== false,
        steps: Array.isArray(workflow.steps) ? workflow.steps : [],
        createdAt: workflow.createdAt || new Date().toISOString(),
        updatedAt: workflow.updatedAt || new Date().toISOString()
      };
    }

    function createAutomation() {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        name: 'Neue Automation',
        trigger: 'manual',
        enabled: true,
        steps: [],
        createdAt: now,
        updatedAt: now
      };
    }

    function saveAutomation(workflow) {
      const automations = getAutomations();
      const index = automations.findIndex(item => item.id === workflow.id);
      workflow.updatedAt = new Date().toISOString();
      if (index >= 0) automations[index] = normalizeAutomation(workflow);
      else automations.unshift(normalizeAutomation(workflow));
      setAutomations(automations);
      return workflow;
    }

    function updateAutomation(workflowId, updater) {
      const automations = getAutomations();
      const index = automations.findIndex(item => item.id === workflowId);
      if (index < 0) return null;
      const next = normalizeAutomation({ ...automations[index] });
      updater(next);
      next.updatedAt = new Date().toISOString();
      automations[index] = next;
      setAutomations(automations);
      return next;
    }

    function deleteAutomation(workflowId) {
      setAutomations(getAutomations().filter(workflow => workflow.id !== workflowId));
      if (state.automationRuntime.selectedId === workflowId) state.automationRuntime.selectedId = null;
    }

    function getSelectedAutomation() {
      const automations = getAutomations();
      if (!automations.length) return null;
      let selected = automations.find(workflow => workflow.id === state.automationRuntime.selectedId);
      if (!selected) {
        selected = automations[0];
        state.automationRuntime.selectedId = selected.id;
      }
      return selected;
    }

    function defaultActionParams(actionDefinition) {
      const params = {};
      (actionDefinition.fields || []).forEach(field => {
        params[field.key] = defaultFieldValue(field);
      });
      return params;
    }

    function resolveActionOptions(field) {
      if (typeof field.options === 'function') return field.options();
      return field.options || [];
    }

    function renderActionParamField(actionDefinition, block, field) {
      const value = block.params?.[field.key] ?? defaultFieldValue(field);
      const inputId = `block-${block.id}-${field.key}`;
      const common = `data-block-id="${block.id}" data-param-key="${field.key}"`;
      const step = field.step ? ` step="${escapeHtml(field.step)}"` : '';

      if (field.type === 'textarea') {
        return `
          <div class="field full">
            <label for="${inputId}">${escapeHtml(field.label)}</label>
            <textarea id="${inputId}" ${common}>${escapeHtml(value)}</textarea>
          </div>
        `;
      }

      if (field.type === 'select') {
        return `
          <div class="field">
            <label for="${inputId}">${escapeHtml(field.label)}</label>
            <select id="${inputId}" ${common}>
              ${resolveActionOptions(field).map(option => {
                const optionValue = fieldOptionValue(option);
                const selected = String(optionValue) === String(value) ? 'selected' : '';
                return `<option value="${escapeHtml(optionValue)}" ${selected}>${escapeHtml(fieldOptionLabel(option))}</option>`;
              }).join('')}
            </select>
          </div>
        `;
      }

      if (field.type === 'checkbox') {
        return `
          <div class="field checkbox-field">
            <label for="${inputId}">
              <input id="${inputId}" type="checkbox" ${value ? 'checked' : ''} ${common}>
              ${escapeHtml(field.label)}
            </label>
          </div>
        `;
      }

      return `
        <div class="field">
          <label for="${inputId}">${escapeHtml(field.label)}</label>
          <input id="${inputId}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${common}${step}>
        </div>
      `;
    }

    function renderAutomationBlock(workflow, block, index) {
      const actionDefinition = findAutomationAction(block.action);
      if (!actionDefinition) {
        return `
          <div class="automation-block automation-block-error" data-block-id="${block.id}">
            <div class="automation-block-head">
              <div><strong>Unbekannter Block</strong><span>${escapeHtml(block.action)}</span></div>
              <button class="btn danger" type="button" data-automation-action="remove-step" data-block-id="${block.id}">Loeschen</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="automation-block" data-block-id="${block.id}">
          <div class="automation-block-index">${index + 1}</div>
          <div class="automation-block-main">
            <div class="automation-block-head">
              <div>
                <strong>${escapeHtml(actionDefinition.label)}</strong>
                <span>${escapeHtml(actionDefinition.description || actionDefinition.group || '')}</span>
              </div>
              <div class="automation-block-actions">
                <button class="btn" type="button" data-automation-action="move-step-up" data-block-id="${block.id}">Hoch</button>
                <button class="btn" type="button" data-automation-action="move-step-down" data-block-id="${block.id}">Runter</button>
                <button class="btn danger" type="button" data-automation-action="remove-step" data-block-id="${block.id}">Loeschen</button>
              </div>
            </div>
            <div class="form-grid automation-param-grid">
              ${(actionDefinition.fields || []).length
                ? actionDefinition.fields.map(field => renderActionParamField(actionDefinition, block, field)).join('')
                : '<p class="mini-note full">Dieser Block braucht keine Parameter.</p>'}
            </div>
          </div>
        </div>
      `;
    }

    function renderActionPalette() {
      const groups = getAutomationActionDefinitions().reduce((result, action) => {
        const group = action.group || 'Sonstige';
        if (!result[group]) result[group] = [];
        result[group].push(action);
        return result;
      }, {});

      return Object.entries(groups).map(([group, actions]) => `
        <div class="action-palette-group">
          <h4>${escapeHtml(group)}</h4>
          <div class="action-chip-list">
            ${actions.map(action => `<span class="action-chip">${escapeHtml(action.label)}</span>`).join('')}
          </div>
        </div>
      `).join('');
    }

    function renderExtensionManager() {
      return `
        <div class="extension-list">
          ${getRegisteredModules().map(moduleConfig => `
            <label class="extension-row">
              <span>
                <strong>${escapeHtml(moduleConfig.title)}</strong>
                <small>${escapeHtml(moduleConfig.subtitle || moduleConfig.type || 'Modul')}</small>
              </span>
              <input type="checkbox" data-module-visible="${moduleConfig.id}" ${isModuleVisible(moduleConfig) ? 'checked' : ''} ${moduleConfig.core ? 'disabled' : ''}>
            </label>
          `).join('')}
        </div>
      `;
    }

    function renderCodeActionList(actions) {
      if (!actions.length) {
        return '<div class="empty-state compact"><p>Noch keine eigenen Code-Bloecke.</p></div>';
      }

      return actions.map(action => `
        <button class="automation-list-item ${action.id === state.automationRuntime.selectedCodeActionId ? 'active' : ''}" type="button" data-automation-action="select-code-action" data-code-action-id="${escapeHtml(action.id)}">
          <strong>${escapeHtml(action.label)}</strong>
          <span>${escapeHtml(action.id)} · ${(action.fields || []).length} Parameter</span>
        </button>
      `).join('');
    }

    function renderCodeActionEditor(action) {
      if (!action) {
        return `
          <div class="empty-state compact">
            <p>Lege einen eigenen Code-Block an, um die Plattform mit wenig Code zu erweitern.</p>
          </div>
        `;
      }

      return `
        <div class="code-action-editor">
          <div class="form-grid">
            <div class="field">
              <label for="codeActionId">Technische ID</label>
              <input id="codeActionId" value="${escapeHtml(action.id)}" data-code-action-prop="id">
            </div>
            <div class="field">
              <label for="codeActionLabel">Name im Builder</label>
              <input id="codeActionLabel" value="${escapeHtml(action.label)}" data-code-action-prop="label">
            </div>
            <div class="field">
              <label for="codeActionGroup">Gruppe</label>
              <input id="codeActionGroup" value="${escapeHtml(action.group)}" data-code-action-prop="group">
            </div>
            <div class="field full">
              <label for="codeActionDescription">Beschreibung</label>
              <input id="codeActionDescription" value="${escapeHtml(action.description)}" data-code-action-prop="description">
            </div>
            <div class="field full">
              <label for="codeActionFields">Parameterfelder (JSON)</label>
              <textarea id="codeActionFields" class="code-textarea small" data-code-action-prop="fieldsJson">${escapeHtml(JSON.stringify(action.fields || [], null, 2))}</textarea>
              <p class="mini-note">Beispiel: [{"key":"message","label":"Text","type":"text","default":"Hallo"}]</p>
            </div>
            <div class="field full">
              <label for="codeActionCode">Code</label>
              <textarea id="codeActionCode" class="code-textarea" data-code-action-prop="code">${escapeHtml(action.code)}</textarea>
              <p class="mini-note">Verfuegbar: params, context, sandbox, app. Beispiel: sandbox.notify(params.message)</p>
            </div>
          </div>
          <div class="module-form-actions code-action-actions">
            <button class="btn primary" type="button" data-automation-action="save-code-action">Code-Block speichern</button>
            <button class="btn" type="button" data-automation-action="test-code-action">Testen</button>
            <button class="btn danger" type="button" data-automation-action="delete-code-action">Loeschen</button>
          </div>
        </div>
      `;
    }

    function renderCodeActionManager() {
      const actions = getCodeActions();
      const selected = getSelectedCodeAction();
      return `
        <div class="code-action-shell">
          <div>
            <div class="automation-list">${renderCodeActionList(actions)}</div>
            <button class="btn primary full code-action-new" type="button" data-automation-action="new-code-action">Neuer Code-Block</button>
          </div>
          ${renderCodeActionEditor(selected)}
        </div>
      `;
    }

    function renderWorkflowList(workflows) {
      if (!workflows.length) {
        return '<div class="empty-state compact"><p>Noch keine Automation angelegt.</p></div>';
      }

      return workflows.map(workflow => {
        const triggerLabel = AUTOMATION_TRIGGERS.find(trigger => trigger.value === workflow.trigger)?.label || workflow.trigger;
        return `
          <button class="automation-list-item ${workflow.id === state.automationRuntime.selectedId ? 'active' : ''}" type="button" data-automation-action="select-workflow" data-workflow-id="${workflow.id}">
            <strong>${escapeHtml(workflow.name)}</strong>
            <span>${escapeHtml(triggerLabel)} · ${workflow.steps.length} Bloecke</span>
          </button>
        `;
      }).join('');
    }

    function renderAutomationEditor(workflow) {
      if (!workflow) {
        return `
          <div class="empty-state">
            <p>Lege eine Automation an, um Trigger und Aktionsbloecke visuell zu verknuepfen.</p>
          </div>
        `;
      }

      const actions = getAutomationActionDefinitions();

      return `
        <div class="automation-editor">
          <div class="automation-trigger-block">
            <div class="automation-block-index">Start</div>
            <div class="automation-block-main">
              <div class="form-grid">
                <div class="field full">
                  <label for="automationName">Name</label>
                  <input id="automationName" value="${escapeHtml(workflow.name)}" data-workflow-prop="name">
                </div>
                <div class="field">
                  <label for="automationTrigger">Trigger</label>
                  <select id="automationTrigger" data-workflow-prop="trigger">
                    ${AUTOMATION_TRIGGERS.map(trigger => `<option value="${trigger.value}" ${workflow.trigger === trigger.value ? 'selected' : ''}>${escapeHtml(trigger.label)}</option>`).join('')}
                  </select>
                </div>
                <div class="field checkbox-field">
                  <label for="automationEnabled">
                    <input id="automationEnabled" type="checkbox" data-workflow-prop="enabled" ${workflow.enabled !== false ? 'checked' : ''}>
                    Aktiv
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="automation-chain">
            ${workflow.steps.length
              ? workflow.steps.map((block, index) => renderAutomationBlock(workflow, block, index)).join('')
              : '<div class="automation-empty-chain">Fuege den ersten Aktionsblock hinzu.</div>'}
          </div>

          <div class="automation-add-block">
            <select id="automationAddAction">
              ${actions.map(action => `<option value="${escapeHtml(action.id)}">${escapeHtml(action.group || 'Aktion')} · ${escapeHtml(action.label)}</option>`).join('')}
            </select>
            <button class="btn primary" type="button" data-automation-action="add-step">Block hinzufuegen</button>
          </div>
        </div>
      `;
    }

    function renderAutomationModule(container, searchTerm = '') {
      const workflows = getAutomations().filter(workflow => matchesSearch(workflow, searchTerm.toLowerCase()));
      const selected = getSelectedAutomation();
      const visibleWorkflows = searchTerm ? workflows : getAutomations();

      container.innerHTML = `
        <div class="stats-grid module-stats">
          <div class="stat-card">
            <div class="stat-label">Automationen</div>
            <div class="stat-value">${getAutomations().length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Aktive Workflows</div>
            <div class="stat-value">${getAutomations().filter(workflow => workflow.enabled !== false).length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Verfuegbare Aktionen</div>
            <div class="stat-value">${getAutomationActionDefinitions().length}</div>
          </div>
        </div>

        <div class="automation-layout">
          <div class="automation-side">
            <div class="panel">
              <div class="panel-header">
                <h3>Workflows</h3>
                <button class="btn primary" type="button" data-automation-action="new-workflow">Neu</button>
              </div>
              <div class="panel-body">
                <div class="automation-list">${renderWorkflowList(visibleWorkflows)}</div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header"><h3>Erweiterungen</h3></div>
              <div class="panel-body">${renderExtensionManager()}</div>
            </div>

            <div class="panel code-action-panel">
              <div class="panel-header"><h3>Eigene Code-Bausteine</h3></div>
              <div class="panel-body">${renderCodeActionManager()}</div>
            </div>
          </div>

          <div class="panel automation-builder-panel">
            <div class="panel-header">
              <div>
                <h3>Block-Builder</h3>
              </div>
              <div class="doc-actions">
                <button class="btn" type="button" data-automation-action="run-workflow" ${selected ? '' : 'disabled'}>Jetzt testen</button>
                <button class="btn danger" type="button" data-automation-action="delete-workflow" ${selected ? '' : 'disabled'}>Loeschen</button>
              </div>
            </div>
            <div class="panel-body">${renderAutomationEditor(selected)}</div>
          </div>

          <div class="panel automation-palette">
            <div class="panel-header"><h3>Bausteine</h3></div>
            <div class="panel-body">${renderActionPalette()}</div>
          </div>
        </div>
      `;

      bindAutomationModuleEvents(container, searchTerm);
    }

    function bindAutomationModuleEvents(container, searchTerm) {
      container.onclick = async event => {
        const button = event.target.closest('[data-automation-action]');
        if (!button) return;

        const action = button.dataset.automationAction;
        const selected = getSelectedAutomation();

        if (action === 'new-workflow') {
          const workflow = createAutomation();
          saveAutomation(workflow);
          state.automationRuntime.selectedId = workflow.id;
          renderAutomationModule(container, searchTerm);
        }

        if (action === 'select-workflow') {
          state.automationRuntime.selectedId = button.dataset.workflowId;
          renderAutomationModule(container, searchTerm);
        }

        if (action === 'new-code-action') {
          const codeAction = createCodeAction();
          saveCodeAction(codeAction);
          state.automationRuntime.selectedCodeActionId = codeAction.id;
          renderAutomationModule(container, searchTerm);
        }

        if (action === 'select-code-action') {
          state.automationRuntime.selectedCodeActionId = button.dataset.codeActionId;
          renderAutomationModule(container, searchTerm);
        }

        if (action === 'save-code-action') {
          const codeAction = gatherCodeActionFromForm(container);
          if (!codeAction) return;
          const saved = saveCodeAction(codeAction);
          state.automationRuntime.selectedCodeActionId = saved.id;
          renderAutomationModule(container, searchTerm);
          showToast('Code-Block gespeichert');
        }

        if (action === 'test-code-action') {
          const codeAction = gatherCodeActionFromForm(container);
          if (!codeAction) return;
          const saved = saveCodeAction(codeAction);
          state.automationRuntime.selectedCodeActionId = saved.id;
          const definition = getCodeActionDefinitions().find(item => item.id === saved.id);
          if (definition) await definition.run(defaultActionParams(definition), { trigger: 'manual-test', sandbox: window.FlowSandbox || createFlowSandbox() });
        }

        if (action === 'delete-code-action') {
          const selectedCodeAction = getSelectedCodeAction();
          if (!selectedCodeAction) return;
          const confirmed = await customConfirm('Code-Block loeschen?', 'Der Baustein verschwindet aus der Automation-Liste.');
          if (!confirmed) return;
          deleteCodeAction(selectedCodeAction.id);
          renderAutomationModule(container, searchTerm);
        }

        if (action === 'delete-workflow' && selected) {
          const confirmed = await customConfirm('Automation loeschen?', 'Der Workflow und seine Bloecke werden entfernt.');
          if (!confirmed) return;
          deleteAutomation(selected.id);
          renderAutomationModule(container, searchTerm);
        }

        if (action === 'run-workflow' && selected) {
          await runAutomation(selected, { trigger: 'manual' });
        }

        if (action === 'add-step' && selected) {
          const actionId = container.querySelector('#automationAddAction')?.value;
          const actionDefinition = findAutomationAction(actionId);
          if (!actionDefinition) return;
          updateAutomation(selected.id, workflow => {
            workflow.steps.push({
              id: crypto.randomUUID(),
              action: actionDefinition.id,
              params: defaultActionParams(actionDefinition)
            });
          });
          renderAutomationModule(container, searchTerm);
        }

        if (['remove-step', 'move-step-up', 'move-step-down'].includes(action) && selected) {
          const blockId = button.dataset.blockId;
          updateAutomation(selected.id, workflow => {
            const index = workflow.steps.findIndex(step => step.id === blockId);
            if (index < 0) return;

            if (action === 'remove-step') workflow.steps.splice(index, 1);
            if (action === 'move-step-up' && index > 0) {
              [workflow.steps[index - 1], workflow.steps[index]] = [workflow.steps[index], workflow.steps[index - 1]];
            }
            if (action === 'move-step-down' && index < workflow.steps.length - 1) {
              [workflow.steps[index + 1], workflow.steps[index]] = [workflow.steps[index], workflow.steps[index + 1]];
            }
          });
          renderAutomationModule(container, searchTerm);
        }
      };

      container.oninput = event => {
        handleAutomationInput(event);
      };

      container.onchange = event => {
        handleAutomationInput(event);

        const visibilityToggle = event.target.closest('[data-module-visible]');
        if (visibilityToggle) {
          setModuleVisible(visibilityToggle.dataset.moduleVisible, visibilityToggle.checked);
          renderAutomationModule(container, searchTerm);
        }
      };
    }

    function gatherCodeActionFromForm(container) {
      const id = container.querySelector('[data-code-action-prop="id"]')?.value.trim();
      const label = container.querySelector('[data-code-action-prop="label"]')?.value.trim();
      const group = container.querySelector('[data-code-action-prop="group"]')?.value.trim();
      const description = container.querySelector('[data-code-action-prop="description"]')?.value.trim();
      const fieldsJson = container.querySelector('[data-code-action-prop="fieldsJson"]')?.value.trim() || '[]';
      const code = container.querySelector('[data-code-action-prop="code"]')?.value || '';
      const previous = getSelectedCodeAction();

      if (!id || !/^[a-z][a-z0-9.-]*$/.test(id)) {
        showToast('Code-Block braucht eine gueltige ID, z.B. custom.mein-block');
        return null;
      }

      let fields;
      try {
        fields = JSON.parse(fieldsJson);
      } catch (error) {
        showToast('Parameterfelder sind kein gueltiges JSON');
        return null;
      }

      if (!Array.isArray(fields)) {
        showToast('Parameterfelder muessen ein JSON-Array sein');
        return null;
      }

      const invalidField = fields.find(field => !field.key || !field.label);
      if (invalidField) {
        showToast('Jedes Parameterfeld braucht key und label');
        return null;
      }

      return normalizeCodeAction({
        ...(previous || {}),
        originalId: previous?.id,
        id,
        label: label || 'Eigener Block',
        group: group || 'Eigener Code',
        description: description || '',
        fields,
        code
      });
    }

    function handleAutomationInput(event) {
      const selected = getSelectedAutomation();
      if (!selected) return;

      const propInput = event.target.closest('[data-workflow-prop]');
      if (propInput) {
        const prop = propInput.dataset.workflowProp;
        updateAutomation(selected.id, workflow => {
          workflow[prop] = propInput.type === 'checkbox' ? propInput.checked : propInput.value;
        });
      }

      const paramInput = event.target.closest('[data-param-key]');
      if (paramInput) {
        const blockId = paramInput.dataset.blockId;
        const key = paramInput.dataset.paramKey;
        updateAutomation(selected.id, workflow => {
          const block = workflow.steps.find(step => step.id === blockId);
          if (!block) return;
          if (!block.params) block.params = {};
          if (paramInput.type === 'checkbox') block.params[key] = paramInput.checked;
          else if (paramInput.type === 'number') block.params[key] = Number(paramInput.value || 0);
          else block.params[key] = paramInput.value;
        });
      }
    }

    async function runAutomation(workflowOrId, context = {}) {
      const workflow = typeof workflowOrId === 'string'
        ? getAutomations().find(item => item.id === workflowOrId)
        : normalizeAutomation(workflowOrId);
      if (!workflow || state.runningAutomation) return;

      state.runningAutomation = true;
      try {
        for (const block of workflow.steps) {
          const actionDefinition = findAutomationAction(block.action);
          if (!actionDefinition) {
            showToast(`Block nicht gefunden: ${block.action}`);
            continue;
          }

          const result = await actionDefinition.run(block.params || {}, {
            ...context,
            workflow,
            block,
            sandbox: window.FlowSandbox || createFlowSandbox()
          });

          if (result === false) break;
        }
      } catch (error) {
        console.error(error);
        showToast('Automation abgebrochen. Details in der Konsole.');
      } finally {
        state.runningAutomation = false;
      }
    }

    async function runAutomationsForTrigger(trigger, context = {}) {
      if (state.runningAutomation) return;
      const workflows = getAutomations().filter(workflow => workflow.enabled !== false && workflow.trigger === trigger);
      for (const workflow of workflows) {
        await runAutomation(workflow, { ...context, trigger });
      }
    }

    function createFlowSandbox() {
      return {
        version: '1.1',
        el,
        escapeHtml,
        nl2br,
        notify: showToast,
        alert: customAlert,
        confirm: customConfirm,
        format: {
          money,
          date: formatDateDE,
          today: todayISO
        },
        storage: {
          getJSON: readJSON,
          setJSON: writeJSON,
          collection(name) {
            const key = getModuleStorageKey(name);
            return {
              all: () => readJSON(key, []),
              set: records => writeJSON(key, records),
              get: id => readJSON(key, []).find(record => record.id === id) || null,
              save(record) {
                const records = readJSON(key, []);
                const now = new Date().toISOString();
                const next = { id: record.id || crypto.randomUUID(), ...record, updatedAt: now };
                const index = records.findIndex(item => item.id === next.id);
                if (index >= 0) records[index] = { ...records[index], ...next };
                else records.unshift({ ...next, createdAt: now });
                writeJSON(key, records);
                return next;
              },
              remove(id) {
                writeJSON(key, readJSON(key, []).filter(record => record.id !== id));
              },
              clear() {
                writeJSON(key, []);
              }
            };
          }
        },
        ui: {
          table: renderDataTableHTML,
          list: renderDataListHTML,
          badge: renderStatusBadge,
          empty: text => `<div class="empty-state"><p>${escapeHtml(text)}</p></div>`
        },
        modules: {
          renderCrud: renderCrudModule,
          records: getModuleRecords,
          setRecords: setModuleRecords,
          visible: isModuleVisible,
          setVisible: setModuleVisible
        },
        actions: {
          all: getAutomationActionDefinitions,
          get: findAutomationAction,
          register: action => window.FlowActions?.register?.(action)
        },
        automations: {
          all: getAutomations,
          run: runAutomation,
          trigger: runAutomationsForTrigger
        },
        downloadJSON: downloadJson
      };
    }

    window.FlowSandbox = createFlowSandbox();

    // --- CLIENT SEARCH & ASSIGNMENT ---

    function handleClientSearch(e) {
        const term = e.target.value;
        const resultsContainer = el('clientSearchResults');
        
        if (term.length < 1) {
            resultsContainer.classList.remove('open');
            return;
        }

        const clients = getClients(); // Nur gespeicherte Kunden durchsuchen für saubere Zuweisung
        const matches = clients.filter(c => 
            c.name.toLowerCase().includes(term.toLowerCase()) || 
            (c.email && c.email.toLowerCase().includes(term.toLowerCase()))
        );

        resultsContainer.innerHTML = '';

        if (matches.length === 0) {
            const div = document.createElement('div');
            div.className = 'search-result';
            div.innerHTML = `
                <strong style="color:var(--p-primary)">+ "${escapeHtml(term)}" erstellen</strong>
                <span style="font-size:11px">Kunde nicht gefunden. Neu anlegen?</span>
            `;
            div.onclick = () => {
                 openClientModalForCreate(term, true);
                 resultsContainer.classList.remove('open');
                 el('clientSearchInput').value = '';
            };
            resultsContainer.appendChild(div);
            resultsContainer.classList.add('open');
            return;
        }

        matches.forEach(c => {
            const div = document.createElement('div');
            div.className = 'search-result';
            div.innerHTML = `
                <strong>${escapeHtml(c.name)}</strong>
                <span>${escapeHtml(c.email || 'Keine E-Mail')}</span>
            `;
            div.onclick = () => selectClientForDoc(c);
            resultsContainer.appendChild(div);
        });
        resultsContainer.classList.add('open');
    }

    function selectClientForDoc(client) {
        // UI Updates
        el('clientSearchInput').value = '';
        el('clientSearchResults').classList.remove('open');
        
        // Set Data
        el('linkedClientId').value = client.id;
        
        // Auto-Fill Fields (can still be edited for this specific doc)
        el('clientName').value = client.name;
        el('clientAddress').value = client.address || '';
        
        // Trigger updates
        renderClientSelectionState(client);
        renderPreview();
        showToast('Kunde zugewiesen');
    }

    function removeClientFromDoc() {
        el('linkedClientId').value = '';
        renderClientSelectionState(null);
        // Wir lassen die Textfelder gefüllt, falls man sie nur "lösen" wollte, um sie manuell zu ändern
    }

    function renderClientSelectionState(client) {
        const searchState = el('clientSearchState');
        const selectedState = el('clientSelectedState');
        
        if (client) {
            searchState.classList.add('hidden');
            selectedState.classList.remove('hidden');
            el('selectedClientNameDisplay').textContent = client.name;
            el('selectedClientInfoDisplay').textContent = client.email || 'Kunde verknüpft';
        } else {
            searchState.classList.remove('hidden');
            selectedState.classList.add('hidden');
        }
    }

    function renderDashboard() {
      const docs = getDocuments();
      
      // Berechne Metriken
      let paidRevenue = 0;
      let openInvoices = 0;
      let openOffers = 0;
      let overdueInvoices = 0;
      const today = todayISO();
      
      docs.forEach(doc => {
        const totals = calcTotals(doc);
        const isDone = doc.docStatus === 'Bezahlt';
        if (doc.docType === 'Rechnung' && isDone) {
          paidRevenue += totals.total;
        } else if (doc.docType === 'Rechnung') {
          openInvoices += totals.total;
          if (doc.dueDate && doc.dueDate < today) overdueInvoices += 1;
        } else if (doc.docType === 'Angebot' && !isDone) {
          openOffers += totals.total;
        }
      });

      el('dashboardStats').innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Bezahlte Rechnungen</div>
          <div class="stat-value" style="color: var(--p-primary);">${money(paidRevenue)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Offene Rechnungen</div>
          <div class="stat-value">${money(openInvoices)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Offenes Angebotsvolumen</div>
          <div class="stat-value">${money(openOffers)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ueberfaellig</div>
          <div class="stat-value" style="color:${overdueInvoices ? 'var(--p-critical)' : 'var(--p-text)'};">${overdueInvoices}</div>
        </div>
      `;
    }

    function updateSidebarLogo(logoUrl) {
        const badge = el('sidebarBrandBadge');
        if (!badge) return;
        if (logoUrl) {
            badge.innerHTML = `<img src="${logoUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">`;
            badge.style.background = 'transparent';
        } else {
            badge.innerHTML = 'F';
            badge.style.background = 'var(--p-primary)';
        }
    }

    function getSettings() {
      return readJSON(STORAGE_KEYS.settings, {});
    }

    async function saveSettings() {
      const settings = {
        companyName: el('companyName').value,
        companyAddress: el('companyAddress').value,
        companyEmail: el('companyEmail').value,
        companyPhone: el('companyPhone').value,
        companyTaxId: el('companyTaxId').value,
        companyIban: el('companyIban').value,
        companyExtra: el('companyExtra').value,
        logoDataUrl: state.logoDataUrl
      };
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
      renderPreview();
      refreshSettingsOverview();
      showToast('Firmendaten gespeichert');
    }

    function getClients() {
      const clients = readJSON(STORAGE_KEYS.clients, []);
      return clients.sort((a, b) => a.name.localeCompare(b.name));
    }

    function setClients(clients) {
      writeJSON(STORAGE_KEYS.clients, clients);
    }

    function loadSettingsIntoForm() {
      const s = getSettings();
      state.logoDataUrl = s.logoDataUrl || null;
      updateSidebarLogo(state.logoDataUrl);
      ['companyName','companyAddress','companyEmail','companyPhone','companyTaxId','companyIban','companyExtra'].forEach(key => {
        el(key).value = s[key] || '';
      });
    }

    function getDocuments() {
      return readJSON(STORAGE_KEYS.documents, []);
    }

    function setDocuments(docs) {
      writeJSON(STORAGE_KEYS.documents, docs);
    }

    function generateDocNumber(type) {
      const docs = getDocuments();
      const year = new Date().getFullYear();
      const prefixMap = { Angebot: 'ANG', Rechnung: 'RE', Auftragsbestätigung: 'AB' };
      const prefix = prefixMap[type] || 'DOC';
      const count = docs.filter(d => d.docType === type && (d.docDate || '').startsWith(String(year))).length + 1;
      return `${prefix}-${year}-${String(count).padStart(3, '0')}`;
    }

    function addItem(data = {}) {
      const id = crypto.randomUUID();
      state.items.push({
        id,
        description: data.description || '',
        qty: Number(data.qty ?? 1),
        unitPrice: Number(data.unitPrice ?? 0),
        unit: data.unit || 'Stk.',
        discount: Number(data.discount ?? 0),
        discountType: data.discountType || 'percent', // 'percent' or 'fixed'
        details: data.details || ''
      });
      renderItems();
      renderPreview();
    }

    function removeItem(id) {
      state.items = state.items.filter(item => item.id !== id);
      renderItems();
      renderPreview();
    }

    function updateItem(id, key, value) {
      const item = state.items.find(i => i.id === id);
      if (!item) return;
      item[key] = ['qty','unitPrice','discount'].includes(key) ? Number(value || 0) : value;
      renderPreview();
    }

    function renderItems() {
      const container = el('itemsContainer');
      if (!state.items.length) {
        container.innerHTML = `
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"></path><path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
            <p>Füge die erste Position zu deinem Dokument hinzu, um zu beginnen.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      state.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'item-row';
        // Updated layout to include per-item discount
        row.innerHTML = `
          <div class="item-row-handle">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a1 1 0 11-2 0 1 1 0 012 0zM7 7a1 1 0 100 2h6a1 1 0 100-2H7zM5 12a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
          </div>
          <div class="field">
            <input value="${escapeHtml(item.description)}" placeholder="Leistung" data-id="${item.id}" data-key="description" style="font-weight:500;" />
            <textarea style="margin-top: 4px; min-height: 40px; height: auto; font-size: 12px; line-height: 1.4;" placeholder="Zusätzliche Details (optional)..." data-id="${item.id}" data-key="details">${escapeHtml(item.details)}</textarea>
          </div>
          <div class="field">
            <input type="number" step="0.01" value="${item.qty}" data-id="${item.id}" data-key="qty" />
          </div>
          <div class="field">
            <input value="${escapeHtml(item.unit)}" placeholder="Std." data-id="${item.id}" data-key="unit" />
          </div>
          <div class="field"> 
            <input type="number" step="0.01" value="${item.unitPrice}" data-id="${item.id}" data-key="unitPrice" />
          </div>
          <div class="field">
            <div class="input-group">
              <input type="number" step="0.01" value="${item.discount}" data-id="${item.id}" data-key="discount" placeholder="0" title="Rabatt" style="min-width: 0; flex: 1;" />
              <select data-id="${item.id}" data-key="discountType">
                 <option value="percent" ${item.discountType === 'percent' ? 'selected' : ''}>%</option>
                 <option value="fixed" ${item.discountType === 'fixed' ? 'selected' : ''}>€</option>
              </select>
            </div>
          </div>
          <button class="btn" data-remove="${item.id}">×</button>
        `;
        container.appendChild(row);
      }); 

      container.querySelectorAll('input, textarea, select').forEach(input => {
        input.addEventListener('input', e => {
          updateItem(e.target.dataset.id, e.target.dataset.key, e.target.value);
        });
      });

      container.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', e => removeItem(e.target.dataset.remove));
      });
    }
    
    function renderSummary(totals) {
      el('summarySubtotal').textContent = money(totals.subtotal);
      el('summaryDiscount').textContent = totals.discount > 0 ? `-${money(totals.discount)}` : money(0);
      el('summaryTax').textContent = money(totals.tax);
      el('summaryTotal').textContent = money(totals.total);
    }

    function renderWorkflowStrip() {
      const strip = el('workflowStrip');
      const statusInput = el('docStatus');
      if (!strip || !statusInput) return;

      const currentStatus = statusInput.value || 'Entwurf';
      const currentIndex = DOC_STATUS_FLOW.indexOf(currentStatus);
      strip.querySelectorAll('[data-doc-status-step]').forEach(button => {
        const stepIndex = DOC_STATUS_FLOW.indexOf(button.dataset.docStatusStep);
        button.classList.toggle('active', stepIndex === currentIndex);
        button.classList.toggle('completed', stepIndex >= 0 && currentIndex >= 0 && stepIndex < currentIndex);
      });
    }



    function handleLogoUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        state.logoDataUrl = evt.target.result;
        updateSidebarLogo(state.logoDataUrl);
      };
      reader.readAsDataURL(file);
    }

    function gatherDocument() {
      return {
        id: state.currentId || crypto.randomUUID(),
        docTemplate: el('docTemplate').value,
        docType: el('docType').value,
        docNumber: el('docNumber').value.trim(),
        linkedClientId: el('linkedClientId').value,
        docDate: el('docDate').value,
        docStatus: el('docStatus').value,
        internalNotes: el('internalNotes').value,
        dueDate: el('dueDate').value,
        clientName: el('clientName').value.trim(),
        clientAddress: el('clientAddress').value.trim(),
        projectTitle: el('projectTitle').value.trim(),
        introText: el('introText').value.trim(),
        extraNotes: el('extraNotes').value.trim(),
        showTax: el('showTax').checked,
        taxRate: Number(el('taxRate').value || 0),
        discount: Number(el('discount').value || 0),
        discountType: el('discountType').value,
        discountReason: el('discountReason').value.trim(),
        footerText: el('footerText').value.trim(),
        items: state.items,
        updatedAt: new Date().toISOString()
      };
    }

    function calcTotals(doc = gatherDocument()) {
      const subtotal = (doc.items || []).reduce((sum, item) => {
        const lineTotalRaw = Number(item.qty || 0) * Number(item.unitPrice || 0);
        let lineDiscount = Number(item.discount || 0);
        if (item.discountType === 'percent') lineDiscount = lineTotalRaw * (lineDiscount / 100);
        return sum + Math.max(lineTotalRaw - lineDiscount, 0);
      }, 0);

      let discountAmount = Number(doc.discount || 0);
      if (doc.discountType === 'percent') {
        discountAmount = subtotal * (discountAmount / 100);
      }
      const taxable = Math.max(subtotal - discountAmount, 0);
      const tax = (doc.showTax !== false) ? taxable * (Number(doc.taxRate || 0) / 100) : 0;
      const total = taxable + tax;
      return { subtotal, discount: discountAmount, taxable, tax, total };
    }

    // Hilfsfunktion zum Generieren der Zeilen HTML inkl. Rabattspalte
    function generateRowsHTML(items, hasLineDiscounts, style = 'default') {
       if (!items || !items.length) {
         return `<tr><td colspan="4" style="text-align:center; padding: 20px; color: #6d7175;">Keine Positionen vorhanden.</td></tr>`;
       }

       return items.map((item, index) => {
        const lineRaw = Number(item.qty || 0) * Number(item.unitPrice || 0);
        let lineDiscountVal = Number(item.discount || 0);
        let lineDiscountAmount = 0;
        let discountBadge = '';
        
        if (lineDiscountVal > 0) {
            if (item.discountType === 'percent') {
                lineDiscountAmount = lineRaw * (lineDiscountVal / 100);
                discountBadge = ` <span style="font-size: 0.85em; color: #d82c0d;">(-${lineDiscountVal.toLocaleString('de-DE')}%)</span>`;
            } else {
                lineDiscountAmount = lineDiscountVal;
                discountBadge = ` <span style="font-size: 0.85em; color: #d82c0d;">(-${money(lineDiscountVal)})</span>`;
            }
        }
        
        const lineTotal = Math.max(lineRaw - lineDiscountAmount, 0);
        const detailsHtml = item.details ? `<div style="font-size: 10px; color: #6b7280; padding-left: 18px; margin-top: 2px;">${nl2br(item.details)}</div>` : '';
        
        // Zellen-Stile basierend auf Design
        const tdStyle = ['modern', 'creative', 'luxury'].includes(style) ? 'padding: 15px 0; border: none;' : '';
        const borderStyle = style === 'default' ? '' : 'border-bottom: 1px solid #e5e7eb;';

        let totalCellContent = money(lineTotal);
        if (lineDiscountAmount > 0) {
            // Strikethrough old price logic
            totalCellContent = `
                <div style="color: #9ca3af; text-decoration: line-through; font-size: 0.9em; margin-bottom: 2px;">${money(lineRaw)}</div>
                <div style="color: #d82c0d; font-weight: bold;">${money(lineTotal)}</div>
            `;
        }

        return `
          <tr style="${style !== 'default' ? 'border-bottom: 1px solid #eee;' : ''}">
            <td style="${tdStyle} ${borderStyle}">
              ${index + 1}. ${escapeHtml(item.description || '-')} ${discountBadge}
              ${detailsHtml}
            </td>
            <td class="align-right" style="${tdStyle} ${borderStyle}">${Number(item.qty || 0).toLocaleString('de-DE')} ${escapeHtml(item.unit || '')}</td>
            <td class="align-right" style="${tdStyle} ${borderStyle}">${money(item.unitPrice)}</td>
            <td class="align-right" style="${tdStyle} ${borderStyle}; vertical-align: top;">${totalCellContent}</td>
          </tr>
        `;
      }).join('');
    }

    const templates = {
      default: (doc, settings, totals, rows) => {
        const senderLine = `${escapeHtml(settings.companyName || '')} · ${escapeHtml((settings.companyAddress || '').split('\n')[0])}`;
        
        // Prüfen ob Rabattspalte nötig
        const hasLineDiscounts = (doc.items || []).some(i => Number(i.discount) > 0);
        const rowsHtml = generateRowsHTML(doc.items, hasLineDiscounts, 'default');
        
        let discountLabel = 'Rabatt';
        const dateLabel = DOCTYPE_DEFAULTS[doc.docType]?.dateLabel || 'Fällig bis';
        if (doc.discountType === 'percent') discountLabel += ` (${Number(doc.discount).toLocaleString('de-DE')} %)`;
        if (doc.discountReason) discountLabel += ` · ${escapeHtml(doc.discountReason)}`;
        const discountRow = totals.discount > 0 ? `<tr><td>${discountLabel}</td><td class="align-right" style="color: #d82c0d; font-weight: bold;">-${money(totals.discount)}</td></tr>` : '';
        const taxRow = (doc.showTax !== false) ? `<tr><td>MwSt. (${Number(doc.taxRate || 0).toLocaleString('de-DE')} %)</td><td class="align-right">${money(totals.tax)}</td></tr>` : '';

        return `
          <div class="paper-content">
              <div class="sender-line">${senderLine}</div>
              
              <div class="paper-header">
                  <div class="recipient-address">
                      <p>${escapeHtml(doc.clientName || 'Kundenname')}</p>
                      <p>${nl2br(doc.clientAddress || 'Kundenadresse')}</p>
                  </div>
                  ${settings.logoDataUrl 
                    ? `<img src="${settings.logoDataUrl}" class="logo">` 
                    : `<h1 class="logo" style="font-size: 24px; text-align:right;">${escapeHtml(settings.companyName || 'Deine Firma')}</h1>`
                  }
              </div>

              <div class="doc-details">
                  <h2 class="subject">${escapeHtml(doc.projectTitle || 'Betreff')}</h2>
                  <p><strong>${escapeHtml(doc.docType)} Nr.:</strong> ${escapeHtml(doc.docNumber)}</p>
                  <p><strong>Datum:</strong> ${escapeHtml(formatDateDE(doc.docDate))}</p>
                  <p><strong>${escapeHtml(dateLabel)}:</strong> ${escapeHtml(formatDateDE(doc.dueDate))}</p>
              </div>

              <p class="intro">${escapeHtml(doc.introText || '')}</p>

              <table>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th class="align-right">Menge</th>
                    <th class="align-right">Einzelpreis</th>
                    <th class="align-right">Summe</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>

              <table class="totals">
                <tbody>
                  <tr><td>Zwischensumme</td><td class="align-right">${money(totals.subtotal)}</td></tr>
                  ${discountRow}
                  ${taxRow}
                  <tr><td><strong>Gesamt</strong></td><td class="align-right"><strong>${money(totals.total)}</strong></td></tr>
                </tbody>
              </table>

              ${doc.extraNotes ? `<p style="margin-top: 20px; font-size: 12px; white-space: pre-wrap;">${nl2br(doc.extraNotes)}</p>` : ''}
              <p class="outro">${escapeHtml(doc.footerText || '')}</p>
          </div>

          <div class="paper-footer">
              <div>
                  <p><strong>${escapeHtml(settings.companyName)}</strong></p>
                  <p>${nl2br(settings.companyAddress)}</p>
              </div>
              <div>
                  <p><strong>Kontakt</strong></p>
                  <p>${escapeHtml(settings.companyEmail)}</p>
                  <p>${escapeHtml(settings.companyPhone)}</p>
              </div>
              <div>
                  <p><strong>Bank &amp; Steuern</strong></p>
                  <p>IBAN: ${escapeHtml(settings.companyIban)}</p>
                  <p>St-Nr: ${escapeHtml(settings.companyTaxId)}</p>
              </div>
              <div>
                  <p><strong>Info</strong></p>
                  <p>${nl2br(settings.companyExtra)}</p>
              </div>
          </div>
        `;
      },
      creative: (doc, settings, totals, rows) => {
        let discountLabel = 'Rabatt';
        
        const hasLineDiscounts = (doc.items || []).some(i => Number(i.discount) > 0);
        const rowsHtml = generateRowsHTML(doc.items, hasLineDiscounts, 'creative');
        const recipientLabel = DOCTYPE_DEFAULTS[doc.docType]?.recipientLabel || 'Empfänger';

        const dateLabel = DOCTYPE_DEFAULTS[doc.docType]?.dateLabel || 'Fällig bis';
        if (doc.discountType === 'percent') discountLabel += ` (${Number(doc.discount).toLocaleString('de-DE')} %)`;
        if (doc.discountReason) discountLabel += ` · ${escapeHtml(doc.discountReason)}`;
        const discountRow = totals.discount > 0 ? `<tr><td style="padding: 8px 0; border: none;">${discountLabel}</td><td class="align-right" style="padding: 8px 0; border: none; color: #d82c0d; font-weight: bold;">-${money(totals.discount)}</td></tr>` : '';
        const taxRow = (doc.showTax !== false) ? `<tr><td style="padding: 8px 0; border: none;">MwSt. (${Number(doc.taxRate || 0).toLocaleString('de-DE')} %)</td><td class="align-right" style="padding: 8px 0; border: none;">${money(totals.tax)}</td></tr>` : '';

        return `
          <div class="paper-content">
              <div style="background: #008060; color: white; padding: 30px 40px; margin: -30px -40px 30px -40px;">
                  <div class="paper-header" style="margin-bottom: 0; align-items: center;">
                      <div>
                          ${settings.logoDataUrl 
                            ? `<img src="${settings.logoDataUrl}" class="logo" style="max-height: 50px; filter: brightness(0) invert(1);">` 
                            : `<h1 class="logo" style="font-size: 24px; color: white; margin: 0;">${escapeHtml(settings.companyName || 'Deine Firma')}</h1>`
                          }
                      </div>
                      <div style="text-align: right;">
                          <h2 class="subject" style="font-size: 32px; font-weight: bold; margin: 0; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(doc.docType)}</h2>
                      </div>
                  </div>
              </div>

              <div class="paper-header" style="margin-bottom: 50px;">
                  <div class="recipient-address">
                      <p style="font-size: 10px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(recipientLabel)}</p>
                      <p><strong>${escapeHtml(doc.clientName || 'Kundenname')}</strong></p>
                      <p>${nl2br(doc.clientAddress || 'Kundenadresse')}</p>
                  </div>
                  <div style="text-align: right; font-size: 12px; line-height: 1.6;">
                      <p><strong>Nr.:</strong> ${escapeHtml(doc.docNumber)}</p>
                      <p><strong>Datum:</strong> ${escapeHtml(formatDateDE(doc.docDate))}</p>
                      <p><strong>${escapeHtml(dateLabel)}:</strong> ${escapeHtml(formatDateDE(doc.dueDate))}</p>
                  </div>
              </div>

              <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">${escapeHtml(doc.projectTitle || 'Betreff')}</h3>
              <p class="intro" style="font-size: 12px; line-height: 1.6;">${escapeHtml(doc.introText || '')}</p>

              <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px; font-size: 12px;">
                <thead style="background: #202223; color: white;">
                  <tr>
                    <th style="padding: 12px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none; border-radius: 6px 0 0 6px;">Position</th>
                    <th class="align-right" style="padding: 12px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none;">Menge</th>
                    <th class="align-right" style="padding: 12px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none;">Einzelpreis</th>
                    <th class="align-right" style="padding: 12px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none; border-radius: 0 6px 6px 0;">Summe</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>

              <div style="display: flex; justify-content: flex-end;">
                <table class="totals" style="font-size: 12px;">
                  <tbody>
                    <tr><td style="padding: 8px 0; border: none;">Zwischensumme</td><td class="align-right" style="padding: 8px 0; border: none;">${money(totals.subtotal)}</td></tr>
                    ${discountRow}
                    ${taxRow}
                    <tr style="border-top: 2px solid #202223;"><td style="padding: 10px 0 0; font-size: 16px; border: none;"><strong>Gesamt</strong></td><td class="align-right" style="padding: 10px 0 0; font-size: 16px; border: none;"><strong>${money(totals.total)}</strong></td></tr>
                  </tbody>
                </table>
              </div>

              ${doc.extraNotes ? `<p style="font-size: 12px; line-height: 1.6; margin-top: 20px; white-space: pre-wrap;">${nl2br(doc.extraNotes)}</p>` : ''}
              <p class="outro" style="font-size: 12px; line-height: 1.6; margin-top: 30px;">${escapeHtml(doc.footerText || '')}</p>
          </div>
          <div class="paper-footer">
              <div>
                  <p><strong>${escapeHtml(settings.companyName)}</strong></p>
                  <p>${nl2br(settings.companyAddress)}</p>
              </div>
              <div>
                  <p><strong>Kontakt</strong></p>
                  <p>${escapeHtml(settings.companyEmail)}</p>
                  <p>${escapeHtml(settings.companyPhone)}</p>
              </div>
              <div>
                  <p><strong>Bank &amp; Steuern</strong></p>
                  <p>IBAN: ${escapeHtml(settings.companyIban)}</p>
                  <p>St-Nr: ${escapeHtml(settings.companyTaxId)}</p>
              </div>
              <div>
                  <p><strong>Info</strong></p>
                  <p>${nl2br(settings.companyExtra)}</p>
              </div>
          </div>
        `;
      },
      modern: (doc, settings, totals, rows) => {
        let discountLabel = 'Rabatt';
        
        const hasLineDiscounts = (doc.items || []).some(i => Number(i.discount) > 0);
        const rowsHtml = generateRowsHTML(doc.items, hasLineDiscounts, 'modern');
        const recipientLabel = DOCTYPE_DEFAULTS[doc.docType]?.recipientLabel || 'Empfänger';

        const dateLabel = DOCTYPE_DEFAULTS[doc.docType]?.dateLabel || 'Fällig bis';
        if (doc.discountType === 'percent') discountLabel += ` (${Number(doc.discount).toLocaleString('de-DE')} %)`;
        if (doc.discountReason) discountLabel += ` · ${escapeHtml(doc.discountReason)}`;
        const discountRow = totals.discount > 0 ? `<tr><td style="padding: 8px 0; border: none;">${discountLabel}</td><td class="align-right" style="padding: 8px 0; border: none; color: #d82c0d; font-weight: bold;">-${money(totals.discount)}</td></tr>` : '';
        const taxRow = (doc.showTax !== false) ? `<tr><td style="padding: 8px 0; border: none;">MwSt. (${Number(doc.taxRate || 0).toLocaleString('de-DE')} %)</td><td class="align-right" style="padding: 8px 0; border: none;">${money(totals.tax)}</td></tr>` : '';

        return `
          <div class="paper-content" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
              <div style="background: #f3f4f6; padding: 30px 40px; margin: -30px -40px 30px -40px;">
                  <div class="paper-header">
                      <div>
                          ${settings.logoDataUrl 
                            ? `<img src="${settings.logoDataUrl}" class="logo" style="max-height: 50px;">` 
                            : `<h1 class="logo" style="font-size: 24px; color: #111; margin: 0;">${escapeHtml(settings.companyName || 'Deine Firma')}</h1>`
                          }
                      </div>
                      <div style="text-align: right; font-size: 10px; color: #6b7280; line-height: 1.6;">
                          <p>${escapeHtml(settings.companyName)}</p>
                          <p>${nl2br(settings.companyAddress)}</p>
                      </div>
                  </div>
              </div>

              <div class="paper-header" style="margin-bottom: 50px;">
                  <div class="recipient-address">
                      <p style="font-size: 10px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(recipientLabel)}</p>
                      <p><strong>${escapeHtml(doc.clientName || 'Kundenname')}</strong></p>
                      <p>${nl2br(doc.clientAddress || 'Kundenadresse')}</p>
                  </div>
                  <div style="text-align: right;">
                      <h2 class="subject" style="font-size: 28px; font-weight: bold; margin-bottom: 12px;">${escapeHtml(doc.docType)}</h2>
                      <p style="margin-bottom: 2px;"><strong>Nr.:</strong> ${escapeHtml(doc.docNumber)}</p>
                      <p><strong>Datum:</strong> ${escapeHtml(formatDateDE(doc.docDate))}</p>
                      <p><strong>${escapeHtml(dateLabel)}:</strong> ${escapeHtml(formatDateDE(doc.dueDate))}</p>
                  </div>
              </div>

              <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">${escapeHtml(doc.projectTitle || 'Betreff')}</h3>
              <p class="intro" style="font-size: 12px; line-height: 1.6;">${escapeHtml(doc.introText || '')}</p>

              <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px; font-size: 12px;">
                <thead style="border-bottom: 1px solid #374151;">
                  <tr>
                    <th style="padding: 10px 0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none;">Position</th>
                    <th class="align-right" style="padding: 10px 0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none;">Menge</th>
                    <th class="align-right" style="padding: 10px 0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none;">Einzelpreis</th>
                    <th class="align-right" style="padding: 10px 0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border: none;">Summe</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>

              <table class="totals" style="font-size: 12px;">
                <tbody>
                  <tr><td style="padding: 8px 0; border: none;">Zwischensumme</td><td class="align-right" style="padding: 8px 0; border: none;">${money(totals.subtotal)}</td></tr>
                  ${discountRow}
                  ${taxRow}
                  <tr style="border-top: 1px solid #374151;"><td style="padding: 10px 0 0; font-size: 14px; border: none;"><strong>Gesamt</strong></td><td class="align-right" style="padding: 10px 0 0; font-size: 14px; border: none;"><strong>${money(totals.total)}</strong></td></tr>
                </tbody>
              </table>

              ${doc.extraNotes ? `<p style="font-size: 12px; line-height: 1.6; margin-top: 20px; white-space: pre-wrap;">${nl2br(doc.extraNotes)}</p>` : ''}
              <p class="outro" style="font-size: 12px; line-height: 1.6;">${escapeHtml(doc.footerText || '')}</p>
          </div>
          <div class="paper-footer">
              <div>
                  <p><strong>${escapeHtml(settings.companyName)}</strong></p>
                  <p>${nl2br(settings.companyAddress)}</p>
              </div>
              <div>
                  <p><strong>Kontakt</strong></p>
                  <p>${escapeHtml(settings.companyEmail)}</p>
                  <p>${escapeHtml(settings.companyPhone)}</p>
              </div>
              <div>
                  <p><strong>Bank &amp; Steuern</strong></p>
                  <p>IBAN: ${escapeHtml(settings.companyIban)}</p>
                  <p>St-Nr: ${escapeHtml(settings.companyTaxId)}</p>
              </div>
              <div>
                  <p><strong>Info</strong></p>
                  <p>${nl2br(settings.companyExtra)}</p>
              </div>
          </div>
        `;
      },
      luxury: (doc, settings, totals, rows) => {
        let discountLabel = 'Rabatt';
        
        const hasLineDiscounts = (doc.items || []).some(i => Number(i.discount) > 0);
        const rowsHtml = generateRowsHTML(doc.items, hasLineDiscounts, 'luxury');
        const recipientLabel = DOCTYPE_DEFAULTS[doc.docType]?.recipientLabel || 'Empfänger';

        const dateLabel = DOCTYPE_DEFAULTS[doc.docType]?.dateLabel || 'Fällig bis';
        if (doc.discountType === 'percent') discountLabel += ` (${Number(doc.discount).toLocaleString('de-DE')} %)`;
        if (doc.discountReason) discountLabel += ` · ${escapeHtml(doc.discountReason)}`;
        const discountRow = totals.discount > 0 ? `<tr><td style="padding: 10px 0; border: none;">${discountLabel}</td><td class="align-right" style="padding: 10px 0; border: none; color: #d82c0d;">-${money(totals.discount)}</td></tr>` : '';
        const taxRow = (doc.showTax !== false) ? `<tr><td style="padding: 10px 0; border: none;">MwSt. (${Number(doc.taxRate || 0).toLocaleString('de-DE')} %)</td><td class="align-right" style="padding: 10px 0; border: none;">${money(totals.tax)}</td></tr>` : '';

        return `
          <div class="paper-content" style="font-family: 'Didot', 'Bodoni MT', 'Times New Roman', serif; color: #1c1c1c; padding: 60px;">
              
              <div style="text-align: center; margin-bottom: 80px;">
                  ${settings.logoDataUrl 
                    ? `<img src="${settings.logoDataUrl}" class="logo" style="max-height: 100px; margin-bottom: 25px;">` 
                    : `<h1 style="font-size: 38px; letter-spacing: 4px; text-transform: uppercase; font-weight: normal; margin: 0 0 15px 0;">${escapeHtml(settings.companyName || 'MANUFAKTUR')}</h1>`
                  }
                  <div style="font-family: sans-serif; font-size: 8px; text-transform: uppercase; letter-spacing: 3px; color: #666;">
                      ${escapeHtml((settings.companyAddress || '').replace(/\n/g, '  •  '))}
                  </div>
              </div>

              <div style="text-align: center; margin-bottom: 70px;">
                  <div style="display: inline-block; border-bottom: 1px solid #111; padding-bottom: 15px; margin-bottom: 15px;">
                      <span style="font-size: 13px; text-transform: uppercase; letter-spacing: 4px; display: block; margin-bottom: 6px;">${escapeHtml(doc.docType)}</span>
                      <span style="font-family: sans-serif; font-size: 10px; letter-spacing: 2px; color: #444;">NO. ${escapeHtml(doc.docNumber)}</span>
                  </div>
                  <div style="font-size: 14px; font-style: italic; color: #444;">
                      ${escapeHtml(formatDateDE(doc.docDate))}
                  </div>
              </div>

              <div style="margin-bottom: 60px; padding-left: 15px; border-left: 1px solid #e0e0e0;">
                  <p style="font-family: sans-serif; font-size: 8px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; color: #999;">${escapeHtml(recipientLabel)}</p>
                  <div style="font-size: 17px; line-height: 1.5;">
                    ${escapeHtml(doc.clientName || 'Kundenname')}<br>
                    ${nl2br(doc.clientAddress || 'Kundenadresse')}
                  </div>
              </div>

              <div style="margin-bottom: 50px;">
                  ${doc.projectTitle ? `<p style="font-size: 16px; margin-bottom: 15px; font-style: italic; text-align: center;">Re: ${escapeHtml(doc.projectTitle)}</p>` : ''}
                  <p style="font-size: 14px; line-height: 2.2; text-align: justify; color: #333;">${escapeHtml(doc.introText || '')}</p>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 50px;">
                <thead>
                  <tr style="border-bottom: 1px solid #000;">
                    <th style="padding: 15px 5px; font-family: sans-serif; font-size: 8px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; color: #000; text-align: left; border: none;">Position</th>
                    <th class="align-right" style="padding: 15px 5px; font-family: sans-serif; font-size: 8px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; color: #000; border: none;">Menge</th>
                    <th class="align-right" style="padding: 15px 5px; font-family: sans-serif; font-size: 8px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; color: #000; border: none;">Einzelpreis</th>
                    <th class="align-right" style="padding: 15px 5px; font-family: sans-serif; font-size: 8px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; color: #000; border: none;">Betrag</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>

              <div style="margin-bottom: 60px; overflow: hidden;">
                <table style="width: 280px; font-size: 13px; margin-left: auto;">
                  <tbody>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Zwischensumme</td><td class="align-right" style="padding: 8px 0; border-bottom: 1px solid #eee;">${money(totals.subtotal)}</td></tr>
                    ${discountRow}
                    ${taxRow}
                    <tr><td colspan="2" style="height: 20px;"></td></tr>
                    <tr style="font-size: 18px;">
                        <td style="padding: 10px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; font-style: italic;">Gesamtbetrag</td>
                        <td class="align-right" style="padding: 10px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;">${money(totals.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              ${doc.extraNotes ? `<div style="text-align: center; margin-bottom: 40px;"><p style="font-size: 12px; line-height: 2; white-space: pre-wrap; font-style: italic; display: inline-block; border-top: 1px solid #eee; padding-top: 20px;">${nl2br(doc.extraNotes)}</p></div>` : ''}
              
              <div style="text-align: center; margin-top: 40px;">
                  <p style="font-size: 12px; line-height: 1.8; color: #444; font-style: italic;">${escapeHtml(doc.footerText || '')}</p>
              </div>
          </div>
          
          <div class="paper-footer" style="border: none; background: transparent; text-align: center; display: block; padding-top: 40px; margin-top: 0;">
              <div style="font-family: sans-serif; font-size: 7px; text-transform: uppercase; letter-spacing: 2px; color: #888; line-height: 2.2;">
                  <span>${escapeHtml(settings.companyName)}</span> &middot; 
                  <span>${escapeHtml(settings.companyEmail)}</span> &middot; 
                  <span>${escapeHtml(settings.companyPhone)}</span><br>
                  <span>IBAN ${escapeHtml(settings.companyIban)}</span> &middot; 
                  <span>St.-Nr. ${escapeHtml(settings.companyTaxId)}</span>
              </div>
          </div>
        `;
      }
    };

    function renderPreview() {
      const doc = gatherDocument();
      const settings = getSettings();
      const totals = calcTotals(doc);
      
      // Rows generation is now handled inside the templates to support dynamic columns

      const templateRenderer = templates[doc.docTemplate] || templates.default;
      el('printArea').innerHTML = templateRenderer(doc, settings, totals, null);
      renderSummary(totals); // Update summary panel
      renderWorkflowStrip();
    }

    function fitPaper() {
      const container = el('previewArea');
      const paper = el('printArea');
      if (!container || !paper || !container.clientWidth) return;
      
      // A4 dimensions at 96dpi: ~794px width
      const paperWidth = 794;
      const containerWidth = container.clientWidth - 48; // minus padding
      
      if (containerWidth < paperWidth) {
        const scale = containerWidth / paperWidth;
        paper.style.transform = `scale(${scale})`;
        // Adjust container height to fit scaled paper (approx)
      } else {
        paper.style.transform = 'none';
      }
    }

    async function saveDocument() {
      const doc = gatherDocument();
      if (!doc.docNumber) {
        await customAlert('Fehlende Angabe', 'Bitte eine Dokumentnummer angeben.');
        return;
      }
      if (!doc.clientName) {
        await customAlert('Fehlende Angabe', 'Bitte einen Kundennamen angeben.');
        return;
      }

      const docs = getDocuments();
      const existingIndex = docs.findIndex(d => d.id === doc.id);
      if (existingIndex >= 0) docs[existingIndex] = doc;
      else docs.unshift(doc);
      setDocuments(docs);
      state.currentId = doc.id;
      renderDocuments();
      updateClientSuggestions(); // Smart Memory aktualisieren
      showToast('Dokument gespeichert');
      await runAutomationsForTrigger('document.saved', { doc });
    }

    function loadDocument(id) {
      const doc = getDocuments().find(d => d.id === id);
      if (!doc) return;
      state.currentId = doc.id;
      el('docTemplate').value = doc.docTemplate || 'default';
      el('docType').value = doc.docType || 'Angebot';
      el('docNumber').value = doc.docNumber || '';
      el('docDate').value = doc.docDate || todayISO();
      el('dueDate').value = doc.dueDate || plusDaysISO(14);
      el('docStatus').value = doc.docStatus || 'Entwurf';
      el('internalNotes').value = doc.internalNotes || '';
      el('linkedClientId').value = doc.linkedClientId || '';
      el('clientName').value = doc.clientName || '';
      el('clientAddress').value = doc.clientAddress || '';
      el('projectTitle').value = doc.projectTitle || '';
      el('introText').value = doc.introText || '';
      el('extraNotes').value = doc.extraNotes || '';
      el('showTax').checked = doc.showTax !== false; // Standard true bei alten Dokumenten
      el('taxRate').value = doc.taxRate ?? 19;
      el('discount').value = doc.discount ?? 0;
      el('discountType').value = doc.discountType || 'fixed';
      el('discountReason').value = doc.discountReason || '';
      el('footerText').value = doc.footerText || '';
      state.items = Array.isArray(doc.items) ? doc.items : [];
      renderItems();
      renderPreview();
      
      // Check linked client
      const linkedClient = doc.linkedClientId ? getClients().find(c => c.id === doc.linkedClientId) : null;
      renderClientSelectionState(linkedClient);
      
      switchView('editor');
    }

    async function deleteDocument(id) {
      const confirmed = await customConfirm('Dokument wirklich löschen?', 'Dieser Schritt kann nicht rückgängig gemacht werden.');
      if (!confirmed) return;
      setDocuments(getDocuments().filter(d => d.id !== id));
      renderDocuments();
      updateClientSuggestions();
    }

    function duplicateDocument(id) {
      const doc = getDocuments().find(d => d.id === id);
      if (!doc) return;
      const copy = { ...doc, id: crypto.randomUUID(), docNumber: generateDocNumber(doc.docType), updatedAt: new Date().toISOString() };
      const docs = getDocuments();
      docs.unshift(copy);
      setDocuments(docs);
      renderDocuments();
      loadDocument(copy.id);
    }

    function syncDocumentFilters() {
      const statusFilter = el('docStatusFilter');
      const typeFilter = el('docTypeFilter');
      if (statusFilter) {
        statusFilter.querySelectorAll('button').forEach(button => {
          button.classList.toggle('active', button.dataset.filterStatus === state.documentFilters.status);
        });
      }
      if (typeFilter) typeFilter.value = state.documentFilters.type;
    }

    async function updateDocumentStatus(id, status) {
      const docs = getDocuments();
      const doc = docs.find(item => item.id === id);
      if (!doc) return;

      doc.docStatus = status;
      doc.updatedAt = new Date().toISOString();
      setDocuments(docs);

      if (state.currentId === id) {
        el('docStatus').value = status;
        renderWorkflowStrip();
        renderPreview();
      }

      renderDocuments(el('globalSearchInput').value.toLowerCase());
      showToast('Status aktualisiert');
      await runAutomationsForTrigger('document.statusChanged', { doc, status });
    }

    function renderDocuments(searchTerm = '') {
      const list = el('documentsList');
      const allDocs = getDocuments();
      let docs = allDocs;
      syncDocumentFilters();

      if (searchTerm) {
        docs = docs.filter(doc => 
            (doc.docNumber && doc.docNumber.toLowerCase().includes(searchTerm)) ||
            (doc.clientName && doc.clientName.toLowerCase().includes(searchTerm)) ||
            (doc.projectTitle && doc.projectTitle.toLowerCase().includes(searchTerm))
        );
      }

      if (state.documentFilters.status !== 'all') {
        docs = docs.filter(doc => (doc.docStatus || 'Entwurf') === state.documentFilters.status);
      }

      if (state.documentFilters.type !== 'all') {
        docs = docs.filter(doc => (doc.docType || '-') === state.documentFilters.type);
      }

      if (!docs.length) {
        if (searchTerm) {
          list.innerHTML = `<div class="empty-state"><p>Keine Dokumente für "${escapeHtml(searchTerm)}" gefunden.</p></div>`;
        } else if (allDocs.length) {
          list.innerHTML = `<div class="empty-state"><p>Keine Dokumente in diesem Filter.</p></div>`;
        } else {
          el('dashboardStats').innerHTML = '';
          list.innerHTML = `<div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"></path></svg><p>Du hast noch keine Dokumente erstellt. Lege jetzt dein erstes Angebot oder deine erste Rechnung an!</p></div>`;
        }
        if (allDocs.length) renderDashboard();
        return;
      }

      renderDashboard(); // Dashboard aktualisieren

      list.innerHTML = docs.map(doc => {
        const totals = calcTotals(doc);
        const statusClass = `status-${(doc.docStatus || 'Entwurf').replace(' ', '.')}`;
        return `
          <div class="doc-card">
            <div class="doc-card-head">
              <div>
                <strong style="color:var(--p-text)">${escapeHtml(doc.docNumber || 'Ohne Nummer')}</strong>
                ${doc.clientName ? `<span style="color:var(--p-text-subdued); margin-left:6px; font-weight:400;">· ${escapeHtml(doc.clientName)}</span>` : ''}
                <div class="doc-meta">
                  <span>${escapeHtml(doc.docType || '-')}</span>
                  <span class="status-badge ${statusClass}">${escapeHtml(doc.docStatus || 'Entwurf')}</span>
                </div>
              </div>
              <div style="font-weight:600; font-size:15px;">${money(totals.total)}</div>
            </div>
            <div class="doc-meta">
              <span>${escapeHtml(doc.projectTitle || 'Ohne Betreff')}</span>
              <span>Zuletzt: ${new Date(doc.updatedAt).toLocaleString('de-DE')}</span>
            </div>
            <div class="doc-actions">
              <select class="compact-select" data-doc-status="${doc.id}" aria-label="Status aendern">
                ${DOC_STATUS_FLOW.map(status => `<option value="${escapeHtml(status)}" ${(doc.docStatus || 'Entwurf') === status ? 'selected' : ''}>${escapeHtml(status === 'Bezahlt' ? 'Erledigt' : status)}</option>`).join('')}
              </select>
              <button class="btn" data-action="load" data-doc-id="${doc.id}">Öffnen</button>
              <button class="btn" data-action="duplicate" data-doc-id="${doc.id}">Duplizieren</button>
              <button class="btn danger" data-action="delete" data-doc-id="${doc.id}">Löschen</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function saveClient() {
      const id = el('clientId').value || crypto.randomUUID();
      const name = el('editClientName').value.trim();
      if (!name) return showToast('Name erforderlich');

      const client = {
        id,
        name,
        address: el('editClientAddress').value,
        email: el('editClientEmail').value,
        notes: el('editClientNotes').value,
        updatedAt: new Date().toISOString()
      };

      const clients = getClients();
      const idx = clients.findIndex(c => c.id === id);
      if (idx >= 0) clients[idx] = client;
      else clients.push(client);

      const shouldLink = state.autoLinkClientAfterSave;

      setClients(clients);
      toggleClientModal(false);
      renderClients();
      updateClientSuggestions(); // Refresh autocomplete
      showToast('Kunde gespeichert');

      if (shouldLink) {
          selectClientForDoc(client);
      }
    }

    async function deleteClient() {
      const id = el('clientId').value;
      if (!id) return;
      if (!await customConfirm('Kunde löschen?')) return;
      
      const clients = getClients().filter(c => c.id !== id);
      setClients(clients);
      toggleClientModal(false);
      renderClients();
      updateClientSuggestions();
    }

    function editClient(id) {
      const client = getClients().find(c => c.id === id);
      if (!client) return;
      
      el('clientId').value = client.id;
      el('editClientName').value = client.name;
      el('editClientAddress').value = client.address || '';
      el('editClientEmail').value = client.email || '';
      el('editClientNotes').value = client.notes || '';
      el('clientModalTitle').textContent = 'Kunde bearbeiten';
      el('deleteClientBtn').style.display = 'block';

      // Render documents for this client
      const clientDocsList = el('clientModalDocsList');
      const clientDocs = getDocuments().filter(doc => doc.linkedClientId === id);
      
      if (clientDocs.length > 0) {
          clientDocsList.innerHTML = clientDocs.map(doc => {
              const totals = calcTotals(doc);
              const statusClass = `status-${(doc.docStatus || 'Entwurf').replace(' ', '.')}`;
              return `
                <div class="doc-card" data-doc-id="${doc.id}">
                  <div class="doc-card-head">
                    <div>
                      <strong style="color:var(--p-text)">${escapeHtml(doc.docNumber || 'Ohne Nummer')}</strong>
                      <div class="doc-meta">
                        <span>${escapeHtml(doc.docType || '-')}</span>
                        <span class="status-badge ${statusClass}">${escapeHtml(doc.docStatus || 'Entwurf')}</span>
                      </div>
                    </div>
                    <div style="font-weight:600; font-size:15px;">${money(totals.total)}</div>
                  </div>
                </div>
              `;
          }).join('');
      } else {
          clientDocsList.innerHTML = `<div class="empty-state" style="padding: 20px;"><p>Für diesen Kunden wurden noch keine Dokumente erstellt.</p></div>`;
      }

      toggleClientModal(true);
    }

    function renderClients(searchTerm = '') {
      const list = el('clientsList');
      let clients = getClients();

      if (searchTerm) {
          clients = clients.filter(c => 
              (c.name && c.name.toLowerCase().includes(searchTerm)) ||
              (c.email && c.email.toLowerCase().includes(searchTerm))
          );
      }

      if (!clients.length) {
        list.innerHTML = searchTerm 
          ? `<div class="empty-state"><p>Kein Kunde für "${escapeHtml(searchTerm)}" gefunden.</p></div>`
          : `<div class="empty-state"><p>Keine Kunden angelegt. Erstelle deinen ersten Kunden!</p></div>`;
        return;
      }
      list.innerHTML = clients.map(c => `
        <div class="doc-card">
          <div class="doc-card-head">
            <strong style="color:var(--p-text)">${escapeHtml(c.name)}</strong>
            <button class="btn" onclick="editClient('${c.id}')">Bearbeiten</button>
          </div>
          <div class="doc-meta">
            <span>${escapeHtml(c.email || '-')}</span>
            <span>${nl2br(c.address || '')}</span>
          </div>
          ${c.notes ? `<div style="margin-top:8px; font-size:12px; color:var(--p-text-subdued); background:var(--p-surface-hover); padding:8px; border-radius:4px;">${nl2br(c.notes)}</div>` : ''}
        </div>
      `).join('');
    }

    function openClientModalForCreate(initialName = '', autoLink = false) {
        el('clientId').value = '';
        el('clientModalTitle').textContent = 'Neuer Kunde';
        ['editClientName','editClientAddress','editClientEmail','editClientNotes'].forEach(id => el(id).value = '');
        if (initialName) el('editClientName').value = initialName;
        el('deleteClientBtn').style.display = 'none';
        state.autoLinkClientAfterSave = autoLink;
        toggleClientModal(true);
    }

    function resetEditor() {
      state.currentId = null;
      el('docTemplate').value = 'default';
      el('docType').value = 'Angebot';
      el('docStatus').value = 'Entwurf';
      el('linkedClientId').value = '';
      el('internalNotes').value = '';
      el('docDate').value = todayISO();
      el('dueDate').value = plusDaysISO(14);
      el('docNumber').value = generateDocNumber('Angebot');
      el('clientName').value = '';
      el('clientAddress').value = '';
      el('projectTitle').value = '';
      
      const defs = DOCTYPE_DEFAULTS['Angebot'];
      el('introText').value = defs.intro;
      el('extraNotes').value = '';
      el('footerText').value = defs.footer;
      el('showTax').checked = true;
      
      el('taxRate').value = 19;
      el('discount').value = 0;
      el('discountType').value = 'fixed';
      el('discountReason').value = '';
      state.items = [];
      addItem({ description: 'Leistung / Position', qty: 1, unitPrice: 0, unit: 'Stk.' });
      renderItems();
      renderPreview();
      renderClientSelectionState(null);
    }

    function switchView(view, searchTerm = '') {
      const map = {
        editor: { title: 'Editor', subtitle: 'Details eingeben und Vorschau prüfen.' },
        documents: { title: 'Dokumente', subtitle: 'Historie und Vorlagen.' },
        clients: { title: 'Kunden', subtitle: 'Adressbuch und Notizen.' },
        settings: { title: 'Einstellungen', subtitle: 'System, Daten und Stammdaten verwalten.' }
      };
      const moduleConfig = getModuleByView(view);
      const meta = moduleConfig ? {
        title: moduleConfig.title,
        subtitle: moduleConfig.subtitle || 'Eigener Arbeitsbereich.'
      } : map[view] || map.editor;

      el('editorView').classList.toggle('hidden', view !== 'editor');
      el('documentsView').classList.toggle('hidden', view !== 'documents');
      el('clientsView').classList.toggle('hidden', view !== 'clients');
      el('settingsView').classList.toggle('hidden', view !== 'settings');
      document.querySelectorAll('[data-module-view]').forEach(section => {
        section.classList.toggle('hidden', section.dataset.moduleView !== view);
      });
      el('pageTitle').textContent = meta.title;
      el('pageSubtitle').textContent = meta.subtitle;
      el('topActions').classList.toggle('hidden', view !== 'editor');
      
      el('globalSearchInput').value = searchTerm;
      if (view === 'documents') {
          renderDocuments(searchTerm);
      } else if (view === 'clients') {
          renderClients(searchTerm);
      } else if (view === 'settings') {
          refreshSettingsOverview();
      } else if (moduleConfig) {
          renderModuleView(moduleConfig, searchTerm);
      }

      document.querySelectorAll('.nav button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });

      runAutomationsForTrigger('view.opened', { view, moduleConfig, searchTerm });
    }

    function bindGeneralInputs() {
      ['docNumber','docDate','dueDate','clientName','clientAddress','projectTitle','introText','extraNotes','taxRate','discount','discountType','footerText', 'discountReason', 'docTemplate'].forEach(id => {
        el(id).addEventListener('input', () => {
          
          // Smart Date Logic
          if (id === 'docDate') {
             el('dueDate').value = plusDaysFromISO(el('docDate').value, 14);
          }

          renderPreview();
        });
      });

      el('showTax').addEventListener('change', renderPreview);
      el('docStatus').addEventListener('change', () => {
        renderWorkflowStrip();
        renderPreview();
        runAutomationsForTrigger('document.statusChanged', { status: el('docStatus').value, doc: gatherDocument() });
      });
    }

    function updateClientSuggestions() {
      // Platzhalter, um ReferenceErrors zu vermeiden, da die Suche aktuell live aus dem Storage erfolgt.
    }

    async function downloadPDF() {
      if (!window.jspdf) return showToast('PDF-Bibliothek wird noch geladen...');
      showToast('PDF wird erstellt...'); // Feedback für den Nutzer
      
      const { jsPDF } = window.jspdf;
      const originalElement = el('printArea');
      
      const clone = originalElement.cloneNode(true);
      
      const container = document.createElement('div');
      // FIX: Render on-screen but invisibly to force correct browser layouting, which prevents html2canvas errors.
      container.style.position = 'absolute';
      container.style.left = '0';
      container.style.top = '0';
      container.style.width = '794px';
      container.style.zIndex = '-9999'; // Hinter dem App-Hintergrund verstecken, aber technisch "sichtbar" lassen
      
      clone.style.transform = 'none';
      clone.style.margin = '0';
      clone.style.display = 'block';
      
      container.appendChild(clone);
      document.body.appendChild(container);

      try {
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        await doc.html(clone, {
          x: 0, y: 0, width: 595, windowWidth: 794,
          html2canvas: { 
            scale: 0.75, 
            useCORS: true, 
            logging: false,
            scrollY: 0,
            scrollX: 0
          } 
        });
        doc.save(`${el('docNumber').value || 'Dokument'}.pdf`);
      } catch (error) {
        console.error("PDF Export Error:", error);
        showToast('Fehler beim PDF-Export. Details in der Konsole.');
      } finally {
        document.body.removeChild(container); // Wichtig: Immer aufräumen
      }
    }

    function downloadJson(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function downloadBackup() {
      const data = {
        version: BACKUP_SCHEMA_VERSION,
        documents: getDocuments(),
        clients: getClients(),
        modules: getAllModuleBackupData(),
        automations: getAutomations(),
        codeActions: getCodeActions(),
        moduleVisibility: getModuleVisibility(),
        settings: getSettings(),
        theme: localStorage.getItem('flowOffice.theme') || 'light',
        backupDate: new Date().toISOString()
      };
      downloadJson(`FlowBook-Backup-${new Date().toISOString().slice(0, 10)}.json`, data);
      showToast('Backup erfolgreich heruntergeladen');
    }

    function triggerImport() {
      el('importBackupInput').click();
    }

    function handleBackupImport(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const data = JSON.parse(evt.target.result);
          
          if (!Array.isArray(data.documents) || !Array.isArray(data.clients) || !data.settings) {
            return showToast('Ungültige oder beschädigte Backup-Datei.');
          }

          if (!await customConfirm('Backup importieren?', 'Alle aktuellen Daten werden überschrieben. Fortfahren?')) {
            el('importBackupInput').value = '';
            return;
          }

          setDocuments(data.documents);
          setClients(data.clients);
          clearModuleStorage();
          if (data.modules) restoreModuleBackupData(data.modules);
          if (Array.isArray(data.automations)) setAutomations(data.automations);
          if (Array.isArray(data.codeActions)) setCodeActions(data.codeActions);
          if (data.moduleVisibility) writeJSON(STORAGE_KEYS.moduleVisibility, data.moduleVisibility);
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data.settings));
          
          // Theme wiederherstellen, falls vorhanden
          if (data.theme) {
            localStorage.setItem('flowOffice.theme', data.theme);
            document.documentElement.setAttribute('data-theme', data.theme);
          }

          loadSettingsIntoForm();
          applyModuleVisibility();
          renderDocuments();
          renderClients();
          resetEditor();
          renderDashboard();
          refreshSettingsOverview();
          const activeView = document.querySelector('.nav button.active')?.dataset.view || 'editor';
          const activeModule = getModuleByView(activeView);
          if (activeModule) renderModuleView(activeModule, el('globalSearchInput').value.toLowerCase());
          showToast('Daten erfolgreich importiert');
        } catch (err) {
          console.error(err);
          showToast('Fehler beim Importieren');
        } finally {
          el('importBackupInput').value = '';
        }
      };
      reader.readAsText(file);
    }

    function startApp() {
      initTheme();
      loadSettingsIntoForm();
      bindGeneralInputs();
      initExtensionModules();
      renderDocuments();
      renderClients();
      renderServicePicker();

      document.querySelectorAll('.nav button').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
      });

      el('addItemBtn').addEventListener('click', () => addItem({ description: 'Leistung / Position', qty: 1, unitPrice: 0, unit: 'Stk.' }));
      el('addServiceItemBtn').addEventListener('click', () => {
        const serviceId = el('servicePicker').value;
        if (!serviceId) {
          showToast('Bitte zuerst eine Leistung auswählen');
          return;
        }
        addServiceToDocument(serviceId);
      });
      el('servicePicker').addEventListener('change', e => {
        if (e.target.value) showToast('Leistung bereit zum Einfügen');
      });
      el('saveBtn').addEventListener('click', saveDocument);
      el('newDocBtn').addEventListener('click', resetEditor);
      el('previewBtn').addEventListener('click', () => togglePreviewModal(true));
            el('closePreviewBtn').addEventListener('click', () => togglePreviewModal(false));
      
      el('downloadPdfBtn').addEventListener('click', downloadPDF);

      el('printModalBtn').addEventListener('click', () => window.print());
      el('exportBackupBtn').addEventListener('click', downloadBackup);
      el('importBackupBtn').addEventListener('click', triggerImport);
      el('importBackupInput').addEventListener('change', handleBackupImport);
      el('saveSettingsBtn').addEventListener('click', saveSettings);
      el('themeToggleBtn').addEventListener('click', toggleTheme);
      el('settingsThemeToggleBtn').addEventListener('click', () => {
        toggleTheme();
        refreshSettingsOverview();
      });
      el('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('isLoggedIn');
        window.location.reload();
      });
      el('logoInput').addEventListener('change', handleLogoUpload);

      document.querySelectorAll('[data-settings-view]').forEach(button => {
        button.addEventListener('click', () => switchView(button.dataset.settingsView || 'editor'));
      });

      document.querySelectorAll('[data-settings-anchor]').forEach(button => {
        button.addEventListener('click', () => {
          const target = el(button.dataset.settingsAnchor);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          document.querySelectorAll('[data-settings-anchor]').forEach(item => {
            item.classList.toggle('active', item === button);
          });
        });
      });

      // Client Modal Actions
      el('newClientBtn').addEventListener('click', () => openClientModalForCreate());
      el('closeClientModalBtn').addEventListener('click', () => toggleClientModal(false));
      el('saveClientBtn').addEventListener('click', saveClient);
      el('deleteClientBtn').addEventListener('click', deleteClient);
      
      el('clientModalDocsList').addEventListener('click', (e) => {
          const card = e.target.closest('.doc-card[data-doc-id]');
          if (card) {
              const docId = card.dataset.docId;
              loadDocument(docId);
              toggleClientModal(false);
          }
      });

      // Client Search Listeners
      el('clientSearchInput').addEventListener('input', handleClientSearch);
      el('removeClientBtn').addEventListener('click', removeClientFromDoc);
      el('workflowStrip').addEventListener('click', (e) => {
        const button = e.target.closest('[data-doc-status-step]');
        if (!button) return;
        setAppFieldValue('docStatus', button.dataset.docStatusStep);
      });

      el('docType').addEventListener('change', (e) => {
        const type = e.target.value;
        if (!state.currentId) {
          el('docNumber').value = generateDocNumber(type);
          // Texte automatisch anpassen
          const defs = DOCTYPE_DEFAULTS[type];
          if (defs) {
            el('introText').value = defs.intro;
            el('footerText').value = defs.footer;
          }
        }
        renderPreview();
      });

      el('globalSearchInput').addEventListener('input', handleGlobalSearch);
      el('globalSearchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGlobalSearch();
      });

      el('docStatusFilter').addEventListener('click', e => {
        const button = e.target.closest('[data-filter-status]');
        if (!button) return;
        state.documentFilters.status = button.dataset.filterStatus;
        renderDocuments(el('globalSearchInput').value.toLowerCase());
      });

      el('docTypeFilter').addEventListener('change', e => {
        state.documentFilters.type = e.target.value;
        renderDocuments(el('globalSearchInput').value.toLowerCase());
      });


      el('documentsList').addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const { action, docId } = button.dataset;

        if (action === 'load') loadDocument(docId);
        if (action === 'duplicate') duplicateDocument(docId);
        if (action === 'delete') await deleteDocument(docId);
      });

      el('documentsList').addEventListener('change', async e => {
        const statusSelect = e.target.closest('[data-doc-status]');
        if (!statusSelect) return;
        await updateDocumentStatus(statusSelect.dataset.docStatus, statusSelect.value);
      });

      window.addEventListener('resize', fitPaper);

      el('resetAllBtn').addEventListener('click', async () => {
        const confirmed = await customConfirm('Wirklich alles zurücksetzen?', 'Alle Dokumente, Kunden, Module und Einstellungen werden permanent aus deinem Browser gelöscht.');
        if (!confirmed) return;
        localStorage.removeItem(STORAGE_KEYS.settings);
        localStorage.removeItem(STORAGE_KEYS.documents);
        localStorage.removeItem(STORAGE_KEYS.clients);
        localStorage.removeItem(STORAGE_KEYS.automations);
        localStorage.removeItem(STORAGE_KEYS.codeActions);
        localStorage.removeItem(STORAGE_KEYS.moduleVisibility);
        clearModuleStorage();
        loadSettingsIntoForm();
        applyModuleVisibility();
        renderDocuments();
        renderClients();
        resetEditor();
        refreshSettingsOverview();
      });

      resetEditor();
      runAutomationsForTrigger('app.start', { view: 'editor' });
    }

    function init() {
      if (sessionStorage.getItem('isLoggedIn') === 'true') {
        el('app').style.display = 'grid';
        el('loginOverlay').style.display = 'none';
        startApp();
      } else {
        el('loginOverlay').style.display = 'flex';
      }

      el('loginForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const passwordInput = el('password');
          if (passwordInput.value === MASTER_PASSWORD) {
              sessionStorage.setItem('isLoggedIn', 'true');
              el('loginOverlay').style.display = 'none';
              el('app').style.display = 'grid';
              startApp();
          } else {
              el('loginError').style.display = 'block';
          }
      });
    }

    init(); // Start the application logic
    window.editClient = editClient; // Expose for onclick
