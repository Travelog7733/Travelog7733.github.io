const storageKey = "travelogSupplierPaymentDetails";

// Paste your Firebase web app config below, then upload this file again.
// Keep these keys in Firebase Security Rules/App Check rather than treating them like passwords.
const firebaseConfig = {
  apiKey: "AIzaSyALSpB73XK5DiR2Ut59NSkKmalPkUGb49c",
  authDomain: "travelog-itinerary.firebaseapp.com",
  projectId: "travelog-itinerary",
  storageBucket: "travelog-itinerary.firebasestorage.app",
  messagingSenderId: "33567258851",
  appId: "1:33567258851:web:790e8f165a3d917bf7edd6",
};

const firestoreDocPath = ["travelogApps", "supplierPaymentDetails"];

const state = {
  suppliers: [],
  invoices: [],
  payments: [],
};

let memoryBackup = "";
let db = null;
let cloudReady = false;
let applyingRemoteData = false;
let cloudSaveTimer = null;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 2,
});

const els = {
  cloudStatus: document.querySelector("#cloudStatus"),
  headerPurchase: document.querySelector("#headerPurchase"),
  headerPaid: document.querySelector("#headerPaid"),
  headerBalance: document.querySelector("#headerBalance"),
  supplierForm: document.querySelector("#supplierForm"),
  supplierId: document.querySelector("#supplierId"),
  supplierCode: document.querySelector("#supplierCode"),
  supplierName: document.querySelector("#supplierName"),
  supplierNote: document.querySelector("#supplierNote"),
  supplierSubmit: document.querySelector("#supplierSubmit"),
  supplierCancel: document.querySelector("#supplierCancel"),
  supplierTable: document.querySelector("#supplierTable"),
  invoiceForm: document.querySelector("#invoiceForm"),
  invoiceId: document.querySelector("#invoiceId"),
  invoiceSupplier: document.querySelector("#invoiceSupplier"),
  invoiceNo: document.querySelector("#invoiceNo"),
  invoiceDate: document.querySelector("#invoiceDate"),
  invoiceParticulars: document.querySelector("#invoiceParticulars"),
  invoiceItems: document.querySelector("#invoiceItems"),
  invoiceDraftTotal: document.querySelector("#invoiceDraftTotal"),
  addInvoiceItem: document.querySelector("#addInvoiceItem"),
  invoiceSubmit: document.querySelector("#invoiceSubmit"),
  invoiceCancel: document.querySelector("#invoiceCancel"),
  invoiceTable: document.querySelector("#invoiceTable"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentId: document.querySelector("#paymentId"),
  paymentSupplier: document.querySelector("#paymentSupplier"),
  paymentDate: document.querySelector("#paymentDate"),
  paymentInvoice: document.querySelector("#paymentInvoice"),
  paymentParticulars: document.querySelector("#paymentParticulars"),
  paymentAmount: document.querySelector("#paymentAmount"),
  paymentSubmit: document.querySelector("#paymentSubmit"),
  paymentCancel: document.querySelector("#paymentCancel"),
  paymentTable: document.querySelector("#paymentTable"),
  statusList: document.querySelector("#statusList"),
  invoiceItemTemplate: document.querySelector("#invoiceItemTemplate"),
};

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

function setCloudStatus(message, type = "") {
  els.cloudStatus.textContent = message;
  els.cloudStatus.className = `cloud-status ${type}`.trim();
}

function readLocalData() {
  try {
    return localStorage.getItem(storageKey) || memoryBackup;
  } catch {
    return memoryBackup;
  }
}

function writeLocalData(payload) {
  memoryBackup = payload;
  try {
    localStorage.setItem(storageKey, payload);
  } catch {
    setCloudStatus("Local browser storage is blocked. Data is kept only until this page closes.", "error");
  }
}

function normalizeData(data) {
  return {
    suppliers: Array.isArray(data?.suppliers) ? data.suppliers : [],
    invoices: Array.isArray(data?.invoices) ? data.invoices : [],
    payments: Array.isArray(data?.payments) ? data.payments : [],
  };
}

function applyData(data) {
  const normalized = normalizeData(data);
  state.suppliers = normalized.suppliers;
  state.invoices = normalized.invoices;
  state.payments = normalized.payments;
}

function save() {
  const payload = JSON.stringify(state);
  writeLocalData(payload);
  saveToCloudDebounced();
}

function load() {
  const saved = readLocalData();
  if (!saved) return;

  try {
    applyData(JSON.parse(saved));
  } catch {
    applyData({});
  }
}

async function initFirebase() {
  if (!hasFirebaseConfig()) {
    setCloudStatus("Cloud sync not configured. Paste Firebase config in supplier-payment-details.js.");
    return;
  }

  if (!window.firebase?.initializeApp || !window.firebase?.firestore) {
    setCloudStatus("Firebase scripts did not load. Local saving is still active.", "error");
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    const docRef = db.collection(firestoreDocPath[0]).doc(firestoreDocPath[1]);

    docRef.onSnapshot(
      (snapshot) => {
        if (!snapshot.exists) {
          cloudReady = true;
          saveToCloudDebounced();
          setCloudStatus("Cloud sync connected", "connected");
          return;
        }

        const remote = snapshot.data();
        if (!remote?.data) return;
        applyingRemoteData = true;
        applyData(remote.data);
        writeLocalData(JSON.stringify(state));
        resetInvoiceForm();
        resetPaymentForm();
        renderAll();
        applyingRemoteData = false;
        cloudReady = true;
        setCloudStatus("Cloud sync connected", "connected");
      },
      () => {
        setCloudStatus("Cloud sync error. Check Firebase config and Firestore rules.", "error");
      },
    );
  } catch {
    setCloudStatus("Cloud sync error. Check Firebase config and Firestore rules.", "error");
  }
}

function saveToCloudDebounced() {
  if (!db || !cloudReady || applyingRemoteData) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    try {
      await db.collection(firestoreDocPath[0]).doc(firestoreDocPath[1]).set({
        data: normalizeData(state),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      setCloudStatus("Cloud sync connected", "connected");
    } catch {
      setCloudStatus("Cloud sync save failed. Local saving is still active.", "error");
    }
  }, 350);
}

function supplierDisplay(supplier) {
  return supplier?.code ? `${supplier.code} - ${supplier.name}` : supplier?.name || "Deleted supplier";
}

function supplierName(id) {
  return supplierDisplay(state.suppliers.find((supplier) => supplier.id === id));
}

function invoiceLabel(id) {
  const invoice = state.invoices.find((item) => item.id === id);
  if (!invoice) return "Not selected";
  const number = invoice.invoiceNo ? `${invoice.invoiceNo} - ` : "";
  return `${number}${invoice.date || "-"} - ${invoice.particulars || "Invoice"} (${inr.format(invoiceTotal(invoice))})`;
}

function itemAmount(item) {
  if (item.amount) return toNumber(item.amount);
  return toNumber(item.qty) * toNumber(item.rate);
}

function invoiceTotal(invoice) {
  return (invoice.items || []).reduce((total, item) => total + itemAmount(item), 0);
}

function supplierInvoiceTotal(supplierId) {
  return state.invoices
    .filter((invoice) => invoice.supplierId === supplierId)
    .reduce((total, invoice) => total + invoiceTotal(invoice), 0);
}

function supplierPaymentTotal(supplierId) {
  return state.payments
    .filter((payment) => payment.supplierId === supplierId)
    .reduce((total, payment) => total + toNumber(payment.amount), 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setOptions(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  });
}

function renderSupplierOptions() {
  const options = state.suppliers
    .slice()
    .sort((a, b) => supplierDisplay(a).localeCompare(supplierDisplay(b)))
    .map((supplier) => ({ value: supplier.id, label: supplierDisplay(supplier) }));

  const invoiceSelected = els.invoiceSupplier.value;
  const paymentSelected = els.paymentSupplier.value;
  setOptions(els.invoiceSupplier, options, "Select supplier");
  setOptions(els.paymentSupplier, options, "Select supplier");
  els.invoiceSupplier.value = invoiceSelected;
  els.paymentSupplier.value = paymentSelected;
  renderPaymentInvoiceOptions();
}

function renderPaymentInvoiceOptions() {
  const supplierId = els.paymentSupplier.value;
  const options = state.invoices
    .filter((invoice) => !supplierId || invoice.supplierId === supplierId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((invoice) => ({ value: invoice.id, label: invoiceLabel(invoice.id) }));

  const selected = els.paymentInvoice.value;
  setOptions(els.paymentInvoice, options, "Optional");
  els.paymentInvoice.value = options.some((option) => option.value === selected) ? selected : "";
}

function renderSupplierTable() {
  if (!state.suppliers.length) {
    els.supplierTable.innerHTML = `<tr><td colspan="4" class="empty-state">No suppliers added yet.</td></tr>`;
    return;
  }

  els.supplierTable.innerHTML = state.suppliers
    .map(
      (supplier) => `
        <tr>
          <td>${escapeHtml(supplier.code)}</td>
          <td>${escapeHtml(supplier.name)}</td>
          <td>${escapeHtml(supplier.note)}</td>
          <td>
            <div class="action-buttons">
              <button class="row-btn edit" type="button" data-edit-supplier="${supplier.id}">Edit</button>
              <button class="row-btn delete" type="button" data-delete-supplier="${supplier.id}">Delete</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function calculateLineAmount(row) {
  const qty = toNumber(row.querySelector(".item-qty").value);
  const rate = toNumber(row.querySelector(".item-rate").value);
  row.querySelector(".item-amount").value = qty && rate ? (qty * rate).toFixed(2) : "";
}

function addInvoiceItem(values = {}) {
  const fragment = els.invoiceItemTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".line-row");
  const name = fragment.querySelector(".item-name");
  const qty = fragment.querySelector(".item-qty");
  const rate = fragment.querySelector(".item-rate");
  const amount = fragment.querySelector(".item-amount");
  const remove = fragment.querySelector(".remove-line");

  name.value = values.name || "";
  qty.value = values.qty || "";
  rate.value = values.rate || "";
  amount.value = values.amount || (toNumber(values.qty) && toNumber(values.rate) ? (toNumber(values.qty) * toNumber(values.rate)).toFixed(2) : "");

  [qty, rate].forEach((input) => {
    input.addEventListener("input", () => {
      calculateLineAmount(row);
      updateInvoiceDraftTotal();
    });
  });

  remove.addEventListener("click", () => {
    row.remove();
    if (!els.invoiceItems.children.length) addInvoiceItem();
    updateInvoiceDraftTotal();
  });

  els.invoiceItems.append(fragment);
  updateInvoiceDraftTotal();
}

function readInvoiceItems() {
  return Array.from(els.invoiceItems.querySelectorAll(".line-row"))
    .map((row) => {
      calculateLineAmount(row);
      return {
        name: row.querySelector(".item-name").value.trim(),
        qty: toNumber(row.querySelector(".item-qty").value),
        rate: toNumber(row.querySelector(".item-rate").value),
        amount: toNumber(row.querySelector(".item-amount").value),
      };
    })
    .filter((item) => item.name || item.qty || item.rate || item.amount);
}

function updateInvoiceDraftTotal() {
  const total = readInvoiceItems().reduce((sum, item) => sum + item.amount, 0);
  els.invoiceDraftTotal.textContent = inr.format(total);
}

function renderInvoiceTable() {
  if (!state.invoices.length) {
    els.invoiceTable.innerHTML = `<tr><td colspan="6" class="empty-state">No purchase invoices saved yet.</td></tr>`;
    return;
  }

  els.invoiceTable.innerHTML = state.invoices
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(
      (invoice) => `
        <tr>
          <td>${escapeHtml(invoice.invoiceNo)}</td>
          <td>${escapeHtml(invoice.date)}</td>
          <td>${escapeHtml(supplierName(invoice.supplierId))}</td>
          <td>
            <strong>${escapeHtml(invoice.particulars)}</strong>
            <div class="muted">${escapeHtml((invoice.items || []).map((item) => `${item.name} (${item.qty || 0} x ${inr.format(toNumber(item.rate))})`).join(", "))}</div>
          </td>
          <td class="number-col">${inr.format(invoiceTotal(invoice))}</td>
          <td>
            <div class="action-buttons">
              <button class="row-btn edit" type="button" data-edit-invoice="${invoice.id}">Edit</button>
              <button class="row-btn delete" type="button" data-delete-invoice="${invoice.id}">Delete</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderPaymentTable() {
  if (!state.payments.length) {
    els.paymentTable.innerHTML = `<tr><td colspan="6" class="empty-state">No payments saved yet.</td></tr>`;
    return;
  }

  els.paymentTable.innerHTML = state.payments
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(
      (payment) => `
        <tr>
          <td>${escapeHtml(payment.date)}</td>
          <td>${escapeHtml(supplierName(payment.supplierId))}</td>
          <td>${escapeHtml(payment.invoiceId ? invoiceLabel(payment.invoiceId) : "Not selected")}</td>
          <td>${escapeHtml(payment.particulars)}</td>
          <td class="number-col">${inr.format(toNumber(payment.amount))}</td>
          <td>
            <div class="action-buttons">
              <button class="row-btn edit" type="button" data-edit-payment="${payment.id}">Edit</button>
              <button class="row-btn delete" type="button" data-delete-payment="${payment.id}">Delete</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function ledgerForSupplier(supplierId) {
  const purchases = state.invoices
    .filter((invoice) => invoice.supplierId === supplierId)
    .map((invoice) => ({
      date: invoice.date,
      type: "Purchase",
      details: `${invoice.invoiceNo || "-"} - ${invoice.particulars}`,
      debit: invoiceTotal(invoice),
      credit: 0,
    }));

  const payments = state.payments
    .filter((payment) => payment.supplierId === supplierId)
    .map((payment) => ({
      date: payment.date,
      type: "Payment",
      details: payment.particulars,
      debit: 0,
      credit: toNumber(payment.amount),
    }));

  return [...purchases, ...payments].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

function renderStatus() {
  if (!state.suppliers.length) {
    els.statusList.innerHTML = `<div class="empty-state">No suppliers added yet.</div>`;
    return;
  }

  els.statusList.innerHTML = state.suppliers
    .slice()
    .sort((a, b) => supplierDisplay(a).localeCompare(supplierDisplay(b)))
    .map((supplier) => {
      const purchase = supplierInvoiceTotal(supplier.id);
      const paid = supplierPaymentTotal(supplier.id);
      const balance = purchase - paid;
      const ledger = ledgerForSupplier(supplier.id);
      const balanceClass = balance > 0 ? "balance-positive" : "balance-clear";

      return `
        <article class="status-card">
          <button class="status-toggle" type="button" data-toggle-status>
            <strong>${escapeHtml(supplierDisplay(supplier))}</strong>
            <span class="status-metrics"><span>Purchase</span><strong>${inr.format(purchase)}</strong></span>
            <span class="status-metrics"><span>Paid</span><strong>${inr.format(paid)}</strong></span>
            <span class="status-metrics"><span>Balance</span><strong class="${balanceClass}">${inr.format(balance)}</strong></span>
            <strong>+</strong>
          </button>
          <div class="ledger">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Particulars</th>
                    <th class="number-col">Purchase</th>
                    <th class="number-col">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    ledger.length
                      ? ledger
                          .map(
                            (row) => `
                              <tr>
                                <td>${escapeHtml(row.date)}</td>
                                <td>${row.type}</td>
                                <td>${escapeHtml(row.details)}</td>
                                <td class="number-col">${row.debit ? inr.format(row.debit) : "-"}</td>
                                <td class="number-col">${row.credit ? inr.format(row.credit) : "-"}</td>
                              </tr>
                            `,
                          )
                          .join("")
                      : `<tr><td colspan="5" class="empty-state">No purchase or payment entries yet.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
            <div class="ledger-total">
              <span>Total Balance</span>
              <strong class="${balanceClass}">${inr.format(balance)}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHeaderTotals() {
  const purchase = state.invoices.reduce((total, invoice) => total + invoiceTotal(invoice), 0);
  const paid = state.payments.reduce((total, payment) => total + toNumber(payment.amount), 0);
  els.headerPurchase.textContent = inr.format(purchase);
  els.headerPaid.textContent = inr.format(paid);
  els.headerBalance.textContent = inr.format(purchase - paid);
}

function renderAll() {
  renderSupplierOptions();
  renderSupplierTable();
  renderInvoiceTable();
  renderPaymentTable();
  renderStatus();
  renderHeaderTotals();
}

function resetSupplierForm() {
  els.supplierId.value = "";
  els.supplierCode.value = "";
  els.supplierName.value = "";
  els.supplierNote.value = "";
  els.supplierSubmit.textContent = "Save Supplier";
  els.supplierForm.classList.remove("editing");
}

function resetInvoiceForm() {
  els.invoiceId.value = "";
  els.invoiceSupplier.value = "";
  els.invoiceNo.value = "";
  els.invoiceDate.value = "";
  els.invoiceParticulars.value = "";
  els.invoiceItems.innerHTML = "";
  els.invoiceSubmit.textContent = "Save Invoice";
  els.invoiceForm.classList.remove("editing");
  addInvoiceItem();
}

function resetPaymentForm() {
  els.paymentId.value = "";
  els.paymentSupplier.value = "";
  els.paymentDate.value = "";
  els.paymentInvoice.value = "";
  els.paymentParticulars.value = "";
  els.paymentAmount.value = "";
  els.paymentSubmit.textContent = "Save Payment";
  els.paymentForm.classList.remove("editing");
  renderPaymentInvoiceOptions();
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}Panel`).classList.add("active");
  });
});

els.supplierForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = els.supplierCode.value.trim();
  const name = els.supplierName.value.trim();
  if (!code || !name) return;

  const existing = state.suppliers.find((supplier) => supplier.id === els.supplierId.value);
  if (existing) {
    existing.code = code;
    existing.name = name;
    existing.note = els.supplierNote.value.trim();
  } else {
    state.suppliers.push({ id: uid(), code, name, note: els.supplierNote.value.trim() });
  }

  save();
  resetSupplierForm();
  renderAll();
});

els.supplierCancel.addEventListener("click", resetSupplierForm);

els.supplierTable.addEventListener("click", (event) => {
  const editId = event.target.dataset.editSupplier;
  const deleteId = event.target.dataset.deleteSupplier;

  if (editId) {
    const supplier = state.suppliers.find((item) => item.id === editId);
    if (!supplier) return;
    els.supplierId.value = supplier.id;
    els.supplierCode.value = supplier.code || "";
    els.supplierName.value = supplier.name || "";
    els.supplierNote.value = supplier.note || "";
    els.supplierSubmit.textContent = "Update Supplier";
    els.supplierForm.classList.add("editing");
  }

  if (deleteId) {
    const used = state.invoices.some((invoice) => invoice.supplierId === deleteId) || state.payments.some((payment) => payment.supplierId === deleteId);
    const message = used
      ? "This supplier has invoices or payments. Delete supplier and related records?"
      : "Delete this supplier?";
    if (!confirm(message)) return;
    state.suppliers = state.suppliers.filter((supplier) => supplier.id !== deleteId);
    state.invoices = state.invoices.filter((invoice) => invoice.supplierId !== deleteId);
    state.payments = state.payments.filter((payment) => payment.supplierId !== deleteId);
    save();
    resetSupplierForm();
    renderAll();
  }
});

els.addInvoiceItem.addEventListener("click", () => addInvoiceItem());

els.invoiceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const items = readInvoiceItems();
  if (!items.length) {
    alert("Add at least one invoice item.");
    return;
  }

  const existing = state.invoices.find((invoice) => invoice.id === els.invoiceId.value);
  const invoice = {
    id: existing?.id || uid(),
    supplierId: els.invoiceSupplier.value,
    invoiceNo: els.invoiceNo.value.trim(),
    date: els.invoiceDate.value,
    particulars: els.invoiceParticulars.value.trim(),
    items,
  };

  if (existing) {
    Object.assign(existing, invoice);
  } else {
    state.invoices.push(invoice);
  }

  save();
  resetInvoiceForm();
  renderAll();
});

els.invoiceCancel.addEventListener("click", resetInvoiceForm);

els.invoiceTable.addEventListener("click", (event) => {
  const editId = event.target.dataset.editInvoice;
  const deleteId = event.target.dataset.deleteInvoice;

  if (editId) {
    const invoice = state.invoices.find((item) => item.id === editId);
    if (!invoice) return;
    els.invoiceId.value = invoice.id;
    els.invoiceSupplier.value = invoice.supplierId;
    els.invoiceNo.value = invoice.invoiceNo || "";
    els.invoiceDate.value = invoice.date;
    els.invoiceParticulars.value = invoice.particulars;
    els.invoiceItems.innerHTML = "";
    (invoice.items || []).forEach((item) => addInvoiceItem(item));
    els.invoiceSubmit.textContent = "Update Invoice";
    els.invoiceForm.classList.add("editing");
    updateInvoiceDraftTotal();
  }

  if (deleteId) {
    if (!confirm("Delete this purchase invoice?")) return;
    state.invoices = state.invoices.filter((invoice) => invoice.id !== deleteId);
    state.payments = state.payments.map((payment) =>
      payment.invoiceId === deleteId ? { ...payment, invoiceId: "" } : payment,
    );
    save();
    resetInvoiceForm();
    renderAll();
  }
});

els.paymentSupplier.addEventListener("change", renderPaymentInvoiceOptions);

els.paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const existing = state.payments.find((payment) => payment.id === els.paymentId.value);
  const payment = {
    id: existing?.id || uid(),
    supplierId: els.paymentSupplier.value,
    date: els.paymentDate.value,
    invoiceId: els.paymentInvoice.value,
    particulars: els.paymentParticulars.value.trim(),
    amount: toNumber(els.paymentAmount.value),
  };

  if (existing) {
    Object.assign(existing, payment);
  } else {
    state.payments.push(payment);
  }

  save();
  resetPaymentForm();
  renderAll();
});

els.paymentCancel.addEventListener("click", resetPaymentForm);

els.paymentTable.addEventListener("click", (event) => {
  const editId = event.target.dataset.editPayment;
  const deleteId = event.target.dataset.deletePayment;

  if (editId) {
    const payment = state.payments.find((item) => item.id === editId);
    if (!payment) return;
    els.paymentId.value = payment.id;
    els.paymentSupplier.value = payment.supplierId;
    renderPaymentInvoiceOptions();
    els.paymentInvoice.value = payment.invoiceId || "";
    els.paymentDate.value = payment.date;
    els.paymentParticulars.value = payment.particulars;
    els.paymentAmount.value = payment.amount;
    els.paymentSubmit.textContent = "Update Payment";
    els.paymentForm.classList.add("editing");
  }

  if (deleteId) {
    if (!confirm("Delete this payment?")) return;
    state.payments = state.payments.filter((payment) => payment.id !== deleteId);
    save();
    resetPaymentForm();
    renderAll();
  }
});

els.statusList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-status]");
  if (!button) return;
  button.closest(".status-card").classList.toggle("open");
});

load();
resetInvoiceForm();
renderAll();
initFirebase();
