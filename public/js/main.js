(() => {
  const form = document.querySelector('#booking-form');
  if (form) {
    const dateInput = form.querySelector('#date');
    const timeSelect = form.querySelector('#time');
    const status = form.querySelector('#slot-status');
    const submit = form.querySelector('#book-submit');
    const doctorId = form.dataset.doctorId;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Thimphu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const today = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    dateInput.min = `${today.year}-${today.month}-${today.day}`;

    dateInput.addEventListener('change', async () => {
      timeSelect.replaceChildren(new Option('Loading available times…', ''));
      timeSelect.disabled = true;
      submit.disabled = true;
      status.textContent = '';
      if (!dateInput.value) return;
      try {
        const response = await fetch(`/api/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(dateInput.value)}`, {
          headers: { Accept: 'application/json' }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load appointment times.');
        timeSelect.replaceChildren(new Option(result.slots.length ? 'Select an available time' : 'No times available', ''));
        result.slots.forEach((time) => timeSelect.add(new Option(time, time)));
        timeSelect.disabled = result.slots.length === 0;
        status.textContent = result.slots.length ? 'Times shown in Bhutan Time.' : 'No times are available on this date.';
      } catch (error) {
        timeSelect.replaceChildren(new Option('Unable to load times', ''));
        status.textContent = error.message;
      }
    });

    timeSelect.addEventListener('change', () => {
      submit.disabled = !timeSelect.value;
    });
  }

  document.querySelectorAll('form[data-confirm]').forEach((confirmForm) => {
    confirmForm.addEventListener('submit', (event) => {
      if (!window.confirm(confirmForm.dataset.confirm)) event.preventDefault();
    });
  });
})();
