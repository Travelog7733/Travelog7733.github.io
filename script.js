const state = {
  tour: [],
  hotel: [],
  expense: [],
  sales: [],
};

const config = {
  tour: {
    listId: "tourList",
    namePlaceholder: "Place of tour",
    amountPlaceholder: "Total amount in VND",
  },
  hotel: {
    listId: "hotelList",
    namePlaceholder: "Hotel name or stay details",
    amountPlaceholder: "Total amount in VND",
  },
  expense: {
    listId: "expenseList",
    namePlaceholder: "Visa or other expense",
    amountPlaceholder: "Total amount in VND",
  },
  sales: {
    listId: "salesList",
    namePlaceholder: "Tour name",
    amountPlaceholder: "Total amount in INR",
  },
};

const formatterInr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const formatterVnd = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const rowTemplate = document.querySelector("#rowTemplate");
const exchangeRateInput = document.querySelector("#exchangeRate");
const supplierTotalVnd = document.querySelector("#supplierTotalVnd");
const supplierTotalInr = document.querySelector("#supplierTotalInr");
const salesTotalInr = document.querySelector("#salesTotalInr");
const resultPanel = document.querySelector("#resultPanel");
const profitAmount = document.querySelector("#profitAmount");
const profitPercent = document.querySelector("#profitPercent");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getSectionTotal(section) {
  return state[section].reduce((total, row) => total + toNumber(row.amount), 0);
}

function getSupplierTotalVnd() {
  return getSectionTotal("tour") + getSectionTotal("hotel") + getSectionTotal("expense");
}

function updateTotals() {
  const rate = toNumber(exchangeRateInput.value);
  const supplierVnd = getSupplierTotalVnd();
  const supplierInr = supplierVnd * rate;
  const salesInr = getSectionTotal("sales");

  supplierTotalVnd.textContent = formatterVnd.format(supplierVnd);
  supplierTotalInr.textContent = formatterInr.format(supplierInr);
  salesTotalInr.textContent = formatterInr.format(salesInr);

  if (resultPanel.classList.contains("show")) {
    updateResult();
  }
}

function updateResult() {
  const supplierInr = getSupplierTotalVnd() * toNumber(exchangeRateInput.value);
  const salesInr = getSectionTotal("sales");
  const profit = salesInr - supplierInr;
  const marginPercent = salesInr > 0 ? (profit / salesInr) * 100 : 0;

  profitAmount.textContent = formatterInr.format(profit);
  profitPercent.textContent = `${marginPercent.toFixed(2)}%`;
  resultPanel.classList.add("show");
}

function renderRow(section, row) {
  const fragment = rowTemplate.content.cloneNode(true);
  const entry = fragment.querySelector(".entry-row");
  const nameInput = fragment.querySelector(".name-input");
  const amountInput = fragment.querySelector(".amount-input");
  const removeButton = fragment.querySelector(".remove-button");

  nameInput.placeholder = config[section].namePlaceholder;
  amountInput.placeholder = config[section].amountPlaceholder;
  nameInput.value = row.name;
  amountInput.value = row.amount;

  nameInput.addEventListener("input", () => {
    row.name = nameInput.value;
  });

  amountInput.addEventListener("input", () => {
    row.amount = amountInput.value;
    updateTotals();
  });

  removeButton.addEventListener("click", () => {
    state[section] = state[section].filter((item) => item.id !== row.id);
    entry.remove();
    updateTotals();
  });

  return fragment;
}

function addRow(section, defaults = {}) {
  const row = {
    id: crypto.randomUUID(),
    name: defaults.name || "",
    amount: defaults.amount || "",
  };
  state[section].push(row);
  document.querySelector(`#${config[section].listId}`).append(renderRow(section, row));
  updateTotals();
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));

    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}Panel`).classList.add("active");
  });
});

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => addRow(button.dataset.add));
});

exchangeRateInput.addEventListener("input", updateTotals);
document.querySelector("#compareButton").addEventListener("click", updateResult);

addRow("tour");
addRow("hotel");
addRow("expense");
addRow("sales");
