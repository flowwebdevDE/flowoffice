// HINWEIS: Dies ist kein sicherer Login. Das Passwort kann im Code eingesehen werden.
    const MASTER_PASSWORD = 'flow'; // Ändere dieses Passwort für einen einfachen Schutz.

    const STORAGE_KEYS = {
      settings: 'flowOffice.settings',
      documents: 'flowOffice.documents',
      clients: 'flowOffice.clients'
    };

    const state = {
      currentId: null,
      items: [],
      logoDataUrl: null,
      knownClients: new Map(), // Cache für Autocomplete
      autoLinkClientAfterSave: false
    };

    const el = id => document.getElementById(id);
    const money = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
    const escapeHtml = str => String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s]));
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
        el('dialogMessage').innerHTML = message;
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
      toast.innerHTML = message; // Allow simple HTML if needed, or use textContent
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s forwards ease-in';
        toast.addEventListener('animationend', () => toast.remove());
      }, 3000);
    }

    function plusDaysISO(days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d - tzOffset).toISOString().slice(0, 10);
    }

    function handleGlobalSearch() {
        const term = el('globalSearchInput').value.toLowerCase();
        const currentView = document.querySelector('.nav button.active').dataset.view;

        if (currentView === 'documents') {
            renderDocuments(term);
        } else if (currentView === 'clients') {
            renderClients(term);
        } else {
            // If on another page, switch to documents and search
            switchView('documents', term);
        }
    }

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
      let totalRevenue = 0;
      let openOffers = 0;
      
      docs.forEach(doc => {
        const totals = calcTotals(doc);
        if (doc.docType === 'Rechnung') {
          totalRevenue += totals.total;
        } else if (doc.docType === 'Angebot') {
          openOffers += totals.total;
        }
      });

      el('dashboardStats').innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Gesamtumsatz (Rechnungen)</div>
          <div class="stat-value" style="color: var(--p-primary);">${money(totalRevenue)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Offenes Angebotsvolumen</div>
          <div class="stat-value">${money(openOffers)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Anzahl Dokumente</div>
          <div class="stat-value" style="color: var(--p-text);">${docs.length}</div>
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
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
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
      showToast('Firmendaten gespeichert');
    }

    function getClients() {
      const clients = JSON.parse(localStorage.getItem(STORAGE_KEYS.clients) || '[]');
      return clients.sort((a, b) => a.name.localeCompare(b.name));
    }

    function setClients(clients) {
      localStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(clients));
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
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.documents) || '[]');
    }

    function setDocuments(docs) {
      localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(docs));
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
    }

    function loadDocument(id) {
      const doc = getDocuments().find(d => d.id === id);
      if (!doc) return;
      state.currentId = doc.id;
      el('docTemplate').value = doc.docTemplate || 'default';
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

    function renderDocuments(searchTerm = '') {
      const list = el('documentsList');
      let docs = getDocuments();

      if (searchTerm) {
        docs = docs.filter(doc => 
            (doc.docNumber && doc.docNumber.toLowerCase().includes(searchTerm)) ||
            (doc.clientName && doc.clientName.toLowerCase().includes(searchTerm)) ||
            (doc.projectTitle && doc.projectTitle.toLowerCase().includes(searchTerm))
        );
      }

      if (!docs.length) {
        if (searchTerm) {
          list.innerHTML = `<div class="empty-state"><p>Keine Dokumente für "${escapeHtml(searchTerm)}" gefunden.</p></div>`;
        } else {
          el('dashboardStats').innerHTML = '';
          list.innerHTML = `<div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"></path></svg><p>Du hast noch keine Dokumente erstellt. Lege jetzt dein erstes Angebot oder deine erste Rechnung an!</p></div>`;
        }
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
        settings: { title: 'Firmendaten', subtitle: 'Deine internen Stammdaten für alle Dokumente.' }
      };

      el('editorView').classList.toggle('hidden', view !== 'editor');
      el('documentsView').classList.toggle('hidden', view !== 'documents');
      el('clientsView').classList.toggle('hidden', view !== 'clients');
      el('settingsView').classList.toggle('hidden', view !== 'settings');
      el('pageTitle').textContent = map[view].title;
      el('pageSubtitle').textContent = map[view].subtitle;
      el('topActions').classList.toggle('hidden', view !== 'editor');
      
      el('globalSearchInput').value = searchTerm;
      if (view === 'documents') {
          renderDocuments(searchTerm);
      } else if (view === 'clients') {
          renderClients(searchTerm);
      }

      document.querySelectorAll('.nav button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
    }

    function bindGeneralInputs() {
      ['docNumber','docDate','dueDate','clientName','clientAddress','projectTitle','introText','extraNotes','taxRate','discount','discountType','footerText', 'discountReason', 'docTemplate'].forEach(id => {
        el(id).addEventListener('input', () => {
          
          // Smart Date Logic
          if (id === 'docDate') {
             el('dueDate').value = plusDaysISO(14); // Immer 14 Tage draufrechnen bei Datumsänderung
          }

          renderPreview();
        });
      });

      el('showTax').addEventListener('change', renderPreview);
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

    function downloadBackup() {
      const data = {
        version: 1,
        documents: getDocuments(),
        clients: getClients(),
        settings: getSettings(),
        theme: localStorage.getItem('flowOffice.theme') || 'light',
        backupDate: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FlowBook-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data.settings));
          
          // Theme wiederherstellen, falls vorhanden
          if (data.theme) {
            localStorage.setItem('flowOffice.theme', data.theme);
            document.documentElement.setAttribute('data-theme', data.theme);
          }

          loadSettingsIntoForm();
          renderDocuments();
          renderClients();
          resetEditor();
          renderDashboard();
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
      renderDocuments();
      renderClients();

      document.querySelectorAll('.nav button').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
      });

      el('addItemBtn').addEventListener('click', () => addItem({ description: 'Leistung / Position', qty: 1, unitPrice: 0, unit: 'Stk.' }));
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
      el('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('isLoggedIn');
        window.location.reload();
      });
      el('logoInput').addEventListener('change', handleLogoUpload);

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


      el('documentsList').addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const { action, docId } = button.dataset;

        if (action === 'load') loadDocument(docId);
        if (action === 'duplicate') duplicateDocument(docId);
        if (action === 'delete') await deleteDocument(docId);
      });

      window.addEventListener('resize', fitPaper);

      el('resetAllBtn').addEventListener('click', async () => {
        const confirmed = await customConfirm('Wirklich alles zurücksetzen?', 'Alle Dokumente und Einstellungen werden permanent aus deinem Browser gelöscht.');
        if (!confirmed) return;
        localStorage.removeItem(STORAGE_KEYS.settings);
        localStorage.removeItem(STORAGE_KEYS.documents);
        loadSettingsIntoForm();
        renderDocuments();
        resetEditor();
      });

      resetEditor();
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