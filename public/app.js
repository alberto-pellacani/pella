// Piccoli miglioramenti progressivi: la pagina funziona anche senza questo script.

// Filtro testuale sulle liste lunghe: <input data-filter> filtra le righe [data-filter-row]
document.querySelectorAll('input[data-filter]').forEach((input) => {
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('[data-filter-row]').forEach((row) => {
      row.hidden = q !== '' && !String(row.dataset.filterText || '').toLowerCase().includes(q);
    });
  });
});

// Conferma prima di azioni distruttive: <form data-confirm="Messaggio">
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!window.confirm(form.dataset.confirm)) e.preventDefault();
  });
});
